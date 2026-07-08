import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhookJobPayload } from './interfaces/webhook-job.interface';
import { WebhookEncryptionService } from './webhook-encryption.service';
import { PrismaService } from '../common/prisma.service';
import axios from 'axios';
import * as crypto from 'crypto';

@Processor('webhooks')
export class WebhooksWorker extends WorkerHost {
  private readonly logger = new Logger(WebhooksWorker.name);

  constructor(
    private readonly encryptionService: WebhookEncryptionService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobPayload>): Promise<void> {
    const { subscriptionId, url, encryptedSecret, event, payload } = job.data;
    const attemptNumber = job.attemptsMade + 1;
    const startTime = Date.now();
    let statusCode: number | null = null;
    let responseBody: string | null = null;

    try {
      // 1. Desencriptar secret (Si falla, arroja error y falla el job)
      const plainSecret = this.encryptionService.decrypt(encryptedSecret);

      // 2. Serializar cuerpo estricto
      const bodyString = JSON.stringify(payload);

      // 3. Firmar payload con HMAC-SHA256
      const hmac = crypto.createHmac('sha256', plainSecret);
      hmac.update(bodyString);
      const signature = hmac.digest('hex');

      // 4. Disparar webhook
      const response = await axios.post(url, bodyString, {
        headers: {
          'Content-Type': 'application/json',
          'X-StockFlow-Signature': `sha256=${signature}`,
          'X-StockFlow-Event': event,
          'X-StockFlow-Delivery': job.id,
          'X-StockFlow-Timestamp': new Date().toISOString(),
        },
        timeout: 10000,
      });

      statusCode = response.status;
      responseBody = response.data 
        ? JSON.stringify(response.data).substring(0, 500) 
        : 'OK';

      // 5. Registrar entrega exitosa
      const duration = Date.now() - startTime;
      await this.logDelivery({
        subscriptionId,
        event,
        statusCode,
        responseBody,
        duration,
        attemptNumber,
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      statusCode = error.response?.status || null;
      
      const rawError = error.response?.data || error.message;
      responseBody = typeof rawError === 'string' 
        ? rawError.substring(0, 500) 
        : JSON.stringify(rawError).substring(0, 500);

      // Registrar entrega fallida
      await this.logDelivery({
        subscriptionId,
        event,
        statusCode,
        responseBody,
        duration,
        attemptNumber,
      });

      // Importante: re-lanzar error para que BullMQ registre el backoff
      this.logger.error(`Webhook fallido para suscripcion ${subscriptionId}, evento ${event}. Attempt: ${attemptNumber}. Error: ${error.message}`);
      throw error;
    }
  }

  private async logDelivery(data: {
    subscriptionId: string;
    event: any;
    statusCode: number | null;
    responseBody: string | null;
    duration: number;
    attemptNumber: number;
  }) {
    try {
      await this.prisma.webhookDelivery.create({
        data,
      });
    } catch (e) {
      this.logger.error('Error logging webhook delivery to database', e);
    }
  }
}
