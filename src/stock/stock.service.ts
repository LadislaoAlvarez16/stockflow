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
        // Total Order of Locks para prevenir deadlocks.
        // Ordenamos los almacenes alfanuméricamente para asegurar que las
        // transacciones concurrentes siempre adquieran los bloqueos en el mismo orden.
        const sortedWarehouses = [dto.fromWarehouseId, dto.toWarehouseId].sort();

        // Aplicamos el pre-bloqueo pesimista determinístico.
        for (const wId of sortedWarehouses) {
          await tx.$queryRaw`
            SELECT 1 
            FROM stocks 
            WHERE product_id = ${dto.productId}::uuid 
              AND warehouse_id = ${wId}::uuid 
            FOR UPDATE
          `;
        }

        // Una vez asegurados los locks jerárquicos, ejecutamos los movimientos de manera segura.
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

    // 1. Re-afirmar o asegurar el bloqueo pesimista de la fila específica (Row Exclusive Lock).
    const stockLock = await tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity 
      FROM stocks 
      WHERE product_id = ${dto.productId}::uuid 
        AND warehouse_id = ${dto.warehouseId}::uuid 
      FOR UPDATE
    `;

    let currentQuantity = 0;

    if (stockLock.length > 0) {
      currentQuantity = Number(stockLock[0].quantity);
    }

    // 2. Calcular nueva cantidad en base al tipo de movimiento.
    let newQuantity = currentQuantity;
    if (dto.type === MovementType.INBOUND) {
      newQuantity += dto.quantity;
    } else if (dto.type === MovementType.OUTBOUND) {
      newQuantity -= dto.quantity;
    } else if (dto.type === MovementType.ADJUSTMENT) {
      throw new BadRequestException('Use explicit INBOUND/OUTBOUND for adjustments in this context');
    }

    // 3. Validar atomicidad: Si queda negativo, forzamos BadRequest para hacer rollback automático
    if (newQuantity < 0) {
      throw new BadRequestException(`Insufficient stock. Current: ${currentQuantity}, Requested: ${dto.quantity}`);
    }

    // 4. Insertar en el ledger inmutable (StockMovement)
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

    // 5. Materializar la proyección en la tabla stocks mediante UPSERT nativo
    await tx.stock.upsert({
      where: {
        productId_warehouseId: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
        },
      },
      create: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        quantity: newQuantity,
      },
      update: {
        quantity: newQuantity,
      },
    });

    return { movement, stockAfter: newQuantity };
  }
}
