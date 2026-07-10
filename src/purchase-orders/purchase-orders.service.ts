import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { GetPurchaseOrdersFilterDto } from './dto/get-purchase-orders-filter.dto';
import { Prisma, PurchaseOrderStatus, WebhookEventType, MovementType } from '@prisma/client';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { StockService } from '../stock/stock.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly webhookDispatcher: WebhookDispatcherService,
    private readonly auditService: AuditService,
  ) {}

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

  async transitionToCancelled(id: string, userId: string = 'system') {
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

    const updatedOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
    });

    this.auditService.log({
      userId,
      action: 'CANCEL_PURCHASE_ORDER',
      entity: 'PurchaseOrder',
      entityId: id,
      metadata: { fromStatus: order.status, toStatus: PurchaseOrderStatus.CANCELLED },
    });

    return updatedOrder;
  }

  async receive(id: string, dto: ReceivePurchaseOrderDto, userId: string) {
    // Validación Inicial
    const order = await this.findOne(id);

    if (order.status !== PurchaseOrderStatus.SENT && order.status !== PurchaseOrderStatus.PARTIAL) {
      throw new BadRequestException(`Cannot receive items for an order in ${order.status} status.`);
    }

    // Validación de Ítems
    for (const itemDto of dto.items) {
      const orderItem = order.items.find(i => i.productId === itemDto.productId);
      if (!orderItem) {
        throw new BadRequestException(`Product ${itemDto.productId} is not part of this purchase order.`);
      }

      const maxAllowed = orderItem.quantityOrdered - orderItem.quantityReceived;
      if (itemDto.quantityReceived > maxAllowed) {
        throw new BadRequestException(`Cannot receive ${itemDto.quantityReceived} of product ${itemDto.productId}. Maximum allowed is ${maxAllowed}.`);
      }
    }

    // Transacción de OC (Fase 1)
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // Actualizar quantityReceived de cada item
      for (const itemDto of dto.items) {
        await tx.purchaseOrderItem.updateMany({
          where: { purchaseOrderId: id, productId: itemDto.productId },
          data: { quantityReceived: { increment: itemDto.quantityReceived } },
        });
      }

      // Recalcular estado
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
      });

      const allReceived = updatedItems.every(i => i.quantityReceived === i.quantityOrdered);
      const newStatus = allReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIAL;

      // Actualizar orden
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: newStatus },
      });
    });

    // Impacto en Stock (Fase 2 - Post-Transacción)
    for (const itemDto of dto.items) {
      const orderItem = order.items.find(i => i.productId === itemDto.productId);
      
      await this.stockService.createMovement({
        productId: itemDto.productId,
        warehouseId: dto.warehouseId,
        type: MovementType.INBOUND,
        quantity: itemDto.quantityReceived,
        reference: dto.reference,
        // No pasamos costPrice porque createMovement no lo soporta directamente en el core DTO actual
      }, userId);
    }

    // Webhook
    if (updatedOrder.status === PurchaseOrderStatus.RECEIVED) {
      await this.webhookDispatcher.dispatch(WebhookEventType.purchase_order_received, {
        purchaseOrderId: updatedOrder.id,
        supplierId: updatedOrder.supplierId,
        warehouseId: updatedOrder.warehouseId,
      });
    }

    return updatedOrder;
  }
}
