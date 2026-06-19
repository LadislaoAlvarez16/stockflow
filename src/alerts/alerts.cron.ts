import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UserRole, AlertStatus } from '@prisma/client';

@Injectable()
export class AlertsCronService {
  private readonly logger = new Logger(AlertsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_11PM)
  async handleDailyReport() {
    this.logger.log('Iniciando recopilación de datos para reporte diario...');

    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // 1. Consultar alertas activas
    const activeAlertsCount = await this.prisma.alert.count({
      where: { status: AlertStatus.ACTIVE },
    });

    // 2. Consultar movimientos recientes
    const [recentMovementsCount, recentMovements] = await Promise.all([
      this.prisma.stockMovement.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      this.prisma.stockMovement.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          quantity: true,
          productId: true,
        },
      }),
    ]);

    // 3. Escape temprano
    if (activeAlertsCount === 0 && recentMovementsCount === 0) {
      this.logger.debug('No hay alertas activas ni movimientos recientes. Reporte omitido.');
      return;
    }

    // 4. Consultar destinatarios (ADMINs)
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { email: true },
    });

    const to = admins.map((admin) => admin.email);

    if (to.length === 0) {
      this.logger.warn('No se encontraron administradores activos para enviar el reporte diario.');
      return;
    }

    // 5. Construir payload y encolar
    const data = {
      activeAlertsCount,
      recentMovementsCount,
      recentMovements,
    };

    await this.notificationsQueue.add('send-email', {
      template: 'daily-report',
      to,
      subject: '📊 StockFlow - Reporte Diario de Operaciones',
      ...data, // Bullmq payload
    });

    this.logger.log(`Reporte diario encolado exitosamente para ${to.length} administrador(es).`);
  }
}
