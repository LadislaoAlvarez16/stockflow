import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MovementType, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async createMovement(dto: CreateMovementDto, userId: string) {
    const transactionId = uuidv4();

    try {
      return await this.prisma.$transaction(async (tx) => {
        return this.executeMovementLogic(tx, dto, userId, transactionId);
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.error('[StockService.createMovement] Transaction failed:', error);
      throw new InternalServerErrorException('Failed to process stock movement');
    }
  }

  async createTransfer(dto: CreateTransferDto, userId: string) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must be different');
    }

    const transactionId = uuidv4();

    try {
      return await this.prisma.$transaction(async (tx) => {
        // OUTBOUND from source
        await this.executeMovementLogic(tx, {
          productId: dto.productId,
          warehouseId: dto.fromWarehouseId,
          type: MovementType.OUTBOUND,
          quantity: dto.quantity,
          reference: `TRANSFER-OUT-${dto.reference}`,
          notes: dto.notes,
        }, userId, transactionId);

        // INBOUND to destination
        await this.executeMovementLogic(tx, {
          productId: dto.productId,
          warehouseId: dto.toWarehouseId,
          type: MovementType.INBOUND,
          quantity: dto.quantity,
          reference: `TRANSFER-IN-${dto.reference}`,
          notes: dto.notes,
        }, userId, transactionId);

        return { transactionId, status: 'SUCCESS' };
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.error('[StockService.createTransfer] Transaction failed:', error);
      throw new InternalServerErrorException('Failed to process stock transfer');
    }
  }

  async getStock(productId: string, warehouseId: string) {
    const stock = await this.prisma.stock.findUnique({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
    });
    return stock || { productId, warehouseId, quantity: 0 };
  }

  private async executeMovementLogic(
    tx: Prisma.TransactionClient, 
    dto: CreateMovementDto, 
    userId: string, 
    transactionId: string
  ) {
    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be strictly positive');
    }

    // 1. Lock the specific stock row to prevent race conditions
    const stockLock = await tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity 
      FROM stocks 
      WHERE product_id = ${dto.productId}::uuid 
        AND warehouse_id = ${dto.warehouseId}::uuid 
      FOR UPDATE
    `;

    let currentQuantity = 0;
    let isNewStock = true;

    if (stockLock.length > 0) {
      currentQuantity = Number(stockLock[0].quantity);
      isNewStock = false;
    }

    // 2. Calculate new quantity based on movement type
    let newQuantity = currentQuantity;
    if (dto.type === MovementType.INBOUND) {
      newQuantity += dto.quantity;
    } else if (dto.type === MovementType.OUTBOUND) {
      newQuantity -= dto.quantity;
    } else if (dto.type === MovementType.ADJUSTMENT) {
      throw new BadRequestException('Use explicit INBOUND/OUTBOUND for adjustments in this context');
    }

    if (newQuantity < 0) {
      throw new BadRequestException(`Insufficient stock. Current: ${currentQuantity}, Requested: ${dto.quantity}`);
    }

    // 3. Insert immutable movement
    const movement = await tx.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: dto.type,
        quantity: dto.quantity,
        reference: dto.reference,
        notes: dto.notes,
        transactionId,
        createdById: userId,
      },
    });

    // 4. Upsert materialized stock
    if (isNewStock) {
      await tx.stock.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: newQuantity,
        },
      });
    } else {
      await tx.stock.update({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
        data: { quantity: newQuantity },
      });
    }

    return movement;
  }
}
