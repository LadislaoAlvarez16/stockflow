import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { CheckLowStockJob } from '../../queue/interfaces/check-low-stock.job';
import { AlertsService } from '../alerts.service';
import { AlertType } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';

@Processor('alerts')
@Injectable()
export class AlertsWorker extends WorkerHost {
  private readonly logger = new Logger(AlertsWorker.name);

  constructor(
    private readonly alertsService: AlertsService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<CheckLowStockJob, any, string>): Promise<any> {
    if (job.name !== 'check-low-stock') return;

    const { productId, warehouseId, currentQuantity, minStock } = job.data;

    // 1. Si currentQuantity > minStock -> return temprano
    if (currentQuantity > minStock) {
      this.logger.debug(`Stock normal para el producto ${productId}. Cantidad actual: ${currentQuantity}, mínimo: ${minStock}. Abortando alerta.`);
      return;
    }

    // 2. Determinar type
    const type = currentQuantity === 0 ? AlertType.OUT_OF_STOCK : AlertType.LOW_STOCK;

    // 3. Formatear mensaje
    const message = `Stock ${type === AlertType.OUT_OF_STOCK ? 'agotado' : 'crítico'}: ${currentQuantity} unidades disponibles (mínimo configurado: ${minStock})`;

    // 4. Intentar crear alerta deduplicada
    const alert = await this.alertsService.createIfNotDuplicate({
      productId,
      warehouseId,
      type,
      message,
    });

    // 5. Evaluar resultado
    if (!alert) {
      this.logger.debug(`Alerta duplicada ya activa para el producto ${productId} en el depósito ${warehouseId}. Omitiendo.`);
      return;
    }

    this.logger.log(`Alerta creada exitosamente: ${alert.id} (${type})`);

    // Encolar notificación
    await this.notificationsQueue.add('send-email', {
      template: type === AlertType.OUT_OF_STOCK ? 'out-of-stock-alert' : 'low-stock-alert',
      alertId: alert.id,
      productId,
      warehouseId,
      currentQuantity,
      minStock,
      message,
    });
    this.logger.log(`Notificación encolada para la alerta ${alert.id}`);
  }
}
