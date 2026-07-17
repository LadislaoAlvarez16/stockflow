import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Inicio del día local

    const [activeProducts, activeWarehouses, todayMovements, lowStockResult] =
      await Promise.all([
        this.prisma.product.count({ where: { isActive: true } }),
        this.prisma.warehouse.count({ where: { isActive: true } }),
        this.prisma.stockMovement.count({
          where: { createdAt: { gte: today } },
        }),
        // Raw query requerida por limitación de Prisma para comparar columnas de distintas tablas
        this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint
        FROM stocks s
        JOIN products p ON s.product_id = p.id
        WHERE s.quantity <= p.min_stock 
        AND p.is_active = true
      `,
      ]);

    return {
      activeProducts,
      activeWarehouses,
      todayMovements,
      lowStockCount: Number(lowStockResult[0]?.count || 0),
    };
  }

  async getRecentMovements() {
    return this.prisma.stockMovement.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { sku: true, name: true } },
        warehouse: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
  }

  async getLowStock() {
    // Raw query por la misma limitación descrita arriba
    return this.prisma.$queryRaw`
      SELECT 
        s.quantity as "currentQuantity",
        p.min_stock as "minStock",
        p.name as "productName",
        p.sku as "sku",
        w.name as "warehouseName"
      FROM stocks s
      JOIN products p ON s.product_id = p.id
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.quantity <= p.min_stock
      AND p.is_active = true
      AND w.is_active = true
      ORDER BY (s.quantity / NULLIF(p.min_stock, 0)) ASC
      LIMIT 20
    `;
  }
}
