import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { GetPurchaseOrdersFilterDto } from './dto/get-purchase-orders-filter.dto';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(createPurchaseOrderDto: CreatePurchaseOrderDto) {
    const { supplierId, warehouseId, items } = createPurchaseOrderDto;

    // Validate supplier and warehouse
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !supplier.isActive) {
      throw new BadRequestException('Supplier does not exist or is inactive');
    }

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException('Warehouse does not exist or is inactive');
    }

    // Validate products
    const productIds = items.map(item => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products do not exist');
    }

    const inactiveProducts = products.filter(p => !p.isActive);
    if (inactiveProducts.length > 0) {
      throw new BadRequestException(`Cannot create order with inactive products: ${inactiveProducts.map(p => p.sku).join(', ')}`);
    }

    // Create the order atomically with its items
    return this.prisma.purchaseOrder.create({
      data: {
        supplierId,
        warehouseId,
        status: PurchaseOrderStatus.DRAFT,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            quantityOrdered: item.quantity,
            costPrice: item.costPrice,
          })),
        },
      },
      include: {
        items: true,
      },
    });
  }

  async findAll(filters: GetPurchaseOrdersFilterDto) {
    const { status, supplierId, warehouseId, dateFrom, dateTo } = filters;
    const where: Prisma.PurchaseOrderWhereInput = {};

    if (status) {
      where.status = status;
    }
    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    return this.prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, taxId: true } },
        warehouse: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }

    return order;
  }

  async transitionToSent(id: string) {
    const order = await this.findOne(id);

    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(`Invalid status transition. Cannot send an order in ${order.status} status.`);
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.SENT },
    });
  }

  async transitionToCancelled(id: string) {
    const order = await this.findOne(id);

    if (order.status === PurchaseOrderStatus.PARTIAL || order.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException('Cannot cancel a purchase order that has already received stock.');
    }

    if (order.status === PurchaseOrderStatus.CANCELLED) {
      return order; // Idempotent
    }

    if (order.status !== PurchaseOrderStatus.DRAFT && order.status !== PurchaseOrderStatus.SENT) {
      throw new BadRequestException(`Invalid status transition from ${order.status} to CANCELLED.`);
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
    });
  }
}
