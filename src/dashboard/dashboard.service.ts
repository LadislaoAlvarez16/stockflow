import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AlertStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailySummary() {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // 1. Total de movimientos en las ultimas 24hs
    const recentMovementsCount = await this.prisma.stockMovement.count({
      where: { createdAt: { gte: twentyFourHoursAgo } },
    });

    // 2. Movimientos desglosados por tipo
    const movementsByTypeRaw = await this.prisma.stockMovement.groupBy({
      by: ['type'],
      _count: {
        id: true,
      },
      where: { createdAt: { gte: twentyFourHoursAgo } },
    });
    
    const movementsByType = movementsByTypeRaw.map(m => ({
      type: m.type,
      count: m._count.id,
    }));

    // 3. Alertas criticas activas (historicas)
    const activeAlertsCount = await this.prisma.alert.count({
      where: { status: AlertStatus.ACTIVE },
    });

    // 4. Productos que cruzaron el mínimo (alertas creadas ultimas 24h)
    const newAlertsRaw = await this.prisma.alert.findMany({
      where: { createdAt: { gte: twentyFourHoursAgo } },
      select: { productId: true, type: true },
    });
    const newAlerts = newAlertsRaw.map(a => ({ productId: a.productId, type: a.type }));

    // 5. Top 5 productos con más movimientos
    const topProductsRaw = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      _count: {
        id: true,
      },
      where: { createdAt: { gte: twentyFourHoursAgo } },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    });
    const topProducts = topProductsRaw.map(p => ({
      productId: p.productId,
      count: p._count.id,
    }));

    return {
      activeAlertsCount,
      recentMovementsCount,
      movementsByType,
      newAlerts,
      topProducts,
    };
  }
}
