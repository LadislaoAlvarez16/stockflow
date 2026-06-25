import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UserRole, AlertStatus } from '@prisma/client';
import { DashboardService } from '../dashboard/dashboard.service';

@Injectable()
export class AlertsCronService {
  private readonly logger = new Logger(AlertsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('alerts') private readonly alertsQueue: Queue,
    private readonly dashboardService: DashboardService,
  ) {}

  @Cron('0 */6 * * *')
  async checkStockAlerts() {
    this.logger.log('Ejecutando cron checkStockAlerts (Fallback)...');
    
    // Buscar stocks que cayeron por debajo del mínimo (min_stock > 0 para ignorar los no configurados)
    const vulnerableStocks = await this.prisma.$queryRaw<Array<{ product_id: string, warehouse_id: string, quantity: number, min_stock: number }>>`
      SELECT s.product_id, s.warehouse_id, s.quantity, p.min_stock 
      FROM stocks s 
      JOIN products p ON s.product_id = p.id 
      WHERE s.quantity <= p.min_stock AND p.min_stock > 0
    `;

    for (const stock of vulnerableStocks) {
      // Deduplicación en la cola
      const jobId = `low-stock-${stock.product_id}-${stock.warehouse_id}`;
      await this.alertsQueue.add(
        'check-low-stock',
        {
          productId: stock.product_id,
          warehouseId: stock.warehouse_id,
          currentQuantity: stock.quantity,
          minStock: stock.min_stock,
        },
        { jobId }
      );
    }
    
    this.logger.log(`checkStockAlerts finalizado. Se encontraron ${vulnerableStocks.length} casos potenciales.`);
  }

  @Cron('0 3 * * *')
  async resolveStaleAlerts() {
    this.logger.log('Ejecutando cron resolveStaleAlerts (Auto-resolución)...');

    const staleAlerts = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT a.id FROM alerts a
      JOIN stocks s ON a.product_id = s.product_id AND a.warehouse_id = s.warehouse_id
      JOIN products p ON a.product_id = p.id
      WHERE a.status = 'ACTIVE' AND a.type = 'LOW_STOCK'
        AND s.quantity > p.min_stock
    `;

    if (staleAlerts.length > 0) {
      const ids = staleAlerts.map(a => a.id);
      await this.prisma.alert.updateMany({
        where: { id: { in: ids } },
        data: { status: AlertStatus.RESOLVED, resolvedAt: new Date() },
      });
      this.logger.log(`resolveStaleAlerts finalizado. Se resolvieron automáticamente ${ids.length} alertas obsoletas.`);
    } else {
      this.logger.debug('resolveStaleAlerts: No se encontraron alertas obsoletas.');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_11PM)
  async handleDailyReport() {
    this.logger.log('Iniciando recopilación de datos para reporte diario...');

    const summary = await this.dashboardService.getSummary();

    if (summary.lowStockCount === 0 && summary.todayMovements === 0) {
      this.logger.debug('No hay alertas activas ni movimientos recientes. Reporte omitido.');
      return;
    }

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { email: true },
    });

    const to = admins.map((admin) => admin.email);

    if (to.length === 0) {
      this.logger.warn('No se encontraron administradores activos para enviar el reporte diario.');
      return;
    }

    await this.notificationsQueue.add('send-email', {
      template: 'daily-report',
      to,
      subject: '📊 StockFlow - Reporte Diario de Operaciones',
      ...summary,
    });

    this.logger.log(`Reporte diario encolado exitosamente para ${to.length} administrador(es).`);
  }
}
