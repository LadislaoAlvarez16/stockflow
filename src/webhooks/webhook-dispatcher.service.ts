import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { WebhookEventType } from '@prisma/client';
import { WebhookJobPayload } from './interfaces/webhook-job.interface';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async dispatch(event: WebhookEventType, payload: any) {
    try {
      // Buscar suscripciones activas para este evento
      const subscriptions = await this.prisma.webhookSubscription.findMany({
        where: {
          isActive: true,
          events: {
            has: event,
          },
        },
      });

      if (subscriptions.length === 0) {
        return;
      }

      const jobs = subscriptions.map((sub) => {
        const jobData: WebhookJobPayload = {
          subscriptionId: sub.id,
          url: sub.url,
          encryptedSecret: sub.encryptedSecret,
          event,
          payload,
        };

        return {
          name: event,
          data: jobData,
          opts: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 10000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        };
      });

      // Encolar de forma masiva
      await this.webhooksQueue.addBulk(jobs);
      
      this.logger.log(`Encolados \${jobs.length} webhooks para el evento \${event}`);
    } catch (error) {
      this.logger.error(`Error despachando webhooks para \${event}:`, error);
      // Falla silenciosa permitida aquí porque los webhooks son post-transacción
      // y no deben interrumpir el flujo principal (BR-21).
    }
  }

  async dispatchTestEvent(subscriptionId: string, url: string, encryptedSecret: string) {
    const jobData: WebhookJobPayload = {
      subscriptionId,
      url,
      encryptedSecret,
      event: WebhookEventType.movement_created,
      payload: {
        test: true,
        message: 'This is a test webhook from StockFlow',
        timestamp: new Date().toISOString()
      },
    };

    await this.webhooksQueue.add('test_event', jobData, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(`Encolado webhook de prueba para la suscripcion \${subscriptionId}`);
  }
}
