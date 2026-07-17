import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail.service';
import {
  lowStockTemplate,
  outOfStockTemplate,
  dailyReportTemplate,
} from '../templates';

interface SendEmailPayload {
  template: string;
  alertId?: string;
  productId?: string;
  warehouseId?: string;
  currentQuantity?: number;
  minStock?: number;
  message?: string;
  to?: string[];
  subject?: string;
  // Daily report fields
  activeAlertsCount?: number;
  recentMovementsCount?: number;
  movementsByType?: Array<{ type: string; count: number }>;
  newAlerts?: Array<{ productId: string; type: string }>;
  topProducts?: Array<{ productId: string; count: number }>;
}

@Processor('notifications')
@Injectable()
export class NotificationsWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationsWorker.name);

  // In a real scenario, this would come from the database (admin users). For now we mock it or pass it in payload.
  private readonly defaultAdminEmail = 'admin@stockflow.com';

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<SendEmailPayload, any, string>): Promise<any> {
    if (job.name !== 'send-email') return;

    const payload = job.data;
    let html = '';
    let subject = payload.subject;

    switch (payload.template) {
      case 'low-stock-alert':
        html = lowStockTemplate(payload as any);
        subject =
          subject || `Alerta de Stock Crítico - Producto ${payload.productId}`;
        break;
      case 'out-of-stock-alert':
        html = outOfStockTemplate(payload as any);
        subject =
          subject || `¡QUIEBRE DE STOCK! - Producto ${payload.productId}`;
        break;
      case 'daily-report':
        html = dailyReportTemplate(payload as any);
        subject = subject || 'Resumen Diario de Operaciones';
        break;
      default:
        throw new Error(`Unknown email template: ${payload.template}`);
    }

    const to =
      payload.to && payload.to.length > 0
        ? payload.to
        : [this.defaultAdminEmail];

    await this.mailService.sendMail({
      to,
      subject,
      html,
    });

    this.logger.log(
      `Email enviado con éxito a ${to.join(', ')} usando template ${payload.template}`,
    );
  }
}
