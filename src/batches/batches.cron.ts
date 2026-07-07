import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BatchesService } from './batches.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { WebhookEventType } from '@prisma/client';

@Injectable()
export class BatchesCronService {
  private readonly logger = new Logger(BatchesCronService.name);

  constructor(
    private readonly batchesService: BatchesService,
    private readonly webhookDispatcherService: WebhookDispatcherService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkExpiringBatches() {
    this.logger.log('Ejecutando cron checkExpiringBatches...');
    
    // Buscar lotes que expiran en los proximos 30 dias
    const expiringBatches = await this.batchesService.getExpiringBatches(30);

    for (const data of expiringBatches) {
      await this.webhookDispatcherService.dispatch(WebhookEventType.batch_expiring, {
        batchId: data.batch.id,
        batchNumber: data.batch.batchNumber,
        productId: data.batch.product.id,
        expiryDate: data.batch.expiryDate,
        totalQuantity: data.totalQuantity,
        locations: data.locations,
      });
    }

    this.logger.log(`checkExpiringBatches finalizado. Se detectaron \${expiringBatches.length} lotes por vencer.`);
  }
}
