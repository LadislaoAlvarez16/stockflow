import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MovementType, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { GetStockFiltersDto } from './dto/get-stock-filters.dto';
import { GetMovementsFiltersDto } from './dto/get-movements-filters.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CheckLowStockJob } from '../queue/interfaces/check-low-stock.job';
import { SerialNumbersService } from '../serial-numbers/serial-numbers.service';

interface AuditDiscrepancyRaw {
  productId: string;
  warehouseId: string;
  expectedQuantity: number;
  actualQuantity: number;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('alerts') private alertsQueue: Queue,
    private readonly serialNumbersService: SerialNumbersService,
  ) {}

  async createMovement(dto: CreateMovementDto, userId: string) {
    if (dto.batchId) {
      await this.validateBatch(dto.batchId, dto.productId);
    }
    if (dto.serialNumbers && dto.serialNumbers.length !== dto.quantity) {
      throw new BadRequestException(`El número de series provistas (${dto.serialNumbers.length}) no coincide con la cantidad (${dto.quantity})`);
    }

    const transactionId = uuidv4();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const movementResult = await this.executeMovementLogic(tx, dto, userId, transactionId);

        if (dto.serialNumbers && dto.serialNumbers.length > 0) {
          if (dto.type === MovementType.INBOUND) {
            await this.serialNumbersService.registerInbound(tx, dto.serialNumbers, movementResult.movement.id, dto.productId, dto.warehouseId, dto.batchId);
          } else if (dto.type === MovementType.OUTBOUND) {
            await this.serialNumbersService.registerOutbound(tx, dto.serialNumbers, movementResult.movement.id, dto.warehouseId, dto.productId);
          }
        }

        return movementResult;
      });

      if (dto.type === MovementType.OUTBOUND) {
        await this.alertsQueue.add('check-low-stock', {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          currentQuantity: result.stockAfter,
          minStock: result.minStock,
        });
        this.logger.debug(`Enqueued check-low-stock for product ${dto.productId} in warehouse ${dto.warehouseId}`);
      }

      return {
        movement: result.movement,
        stockAfter: result.stockAfter,
      };
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

    if (dto.batchId) {
      await this.validateBatch(dto.batchId, dto.productId);
    }
    if (dto.serialNumbers && dto.serialNumbers.length !== dto.quantity) {
      throw new BadRequestException(`El número de series provistas (${dto.serialNumbers.length}) no coincide con la cantidad (${dto.quantity})`);
    }

    const transactionId = uuidv4();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Total Order of Locks para prevenir deadlocks.
        // Ordenamos los almacenes alfanuméricamente para asegurar que las
        // transacciones concurrentes siempre adquieran los bloqueos en el mismo orden.
        const sortedWarehouses = [dto.fromWarehouseId, dto.toWarehouseId].sort();

        // Aplicamos el pre-bloqueo pesimista determinístico sobre stocks.
        let originStockQuantity = 0;
        for (const wId of sortedWarehouses) {
          const result = await tx.$queryRaw<{ quantity: number }[]>`
            SELECT quantity 
            FROM stocks 
            WHERE product_id = ${dto.productId}::uuid 
              AND warehouse_id = ${wId}::uuid 
            FOR UPDATE
          `;
          
          if (wId === dto.fromWarehouseId && result.length > 0) {
            originStockQuantity = Number(result[0].quantity);
          }
        }

        if (originStockQuantity < dto.quantity) {
          throw new BadRequestException('Insufficient stock in origin warehouse');
        }

        // Pre-bloqueo pesimista sobre batch_stocks en el mismo orden (si hay lote)
        let originBatchQuantity = 0;
        if (dto.batchId) {
          for (const wId of sortedWarehouses) {
            const batchResult = await tx.$queryRaw<{ quantity: number }[]>`
              SELECT quantity 
              FROM batch_stocks 
              WHERE batch_id = ${dto.batchId}::uuid 
                AND warehouse_id = ${wId}::uuid 
              FOR UPDATE
            `;
            
            if (wId === dto.fromWarehouseId && batchResult.length > 0) {
              originBatchQuantity = Number(batchResult[0].quantity);
            }
          }
          if (originBatchQuantity < dto.quantity) {
            throw new BadRequestException('Insufficient batch stock in origin warehouse');
          }
        }

        // Una vez asegurados los locks jerárquicos, ejecutamos los movimientos de manera segura.
        // OUTBOUND from source
        const originResult = await this.executeMovementLogic(tx, {
          productId: dto.productId,
          warehouseId: dto.fromWarehouseId,
          type: MovementType.OUTBOUND,
          quantity: dto.quantity,
          reference: `TRANSFER-OUT-${dto.reference}`,
          notes: dto.notes,
          batchId: dto.batchId,
        }, userId, transactionId);

        // INBOUND to destination
        await this.executeMovementLogic(tx, {
          productId: dto.productId,
          warehouseId: dto.toWarehouseId,
          type: MovementType.INBOUND,
          quantity: dto.quantity,
          reference: `TRANSFER-IN-${dto.reference}`,
          notes: dto.notes,
          batchId: dto.batchId,
        }, userId, transactionId);

        if (dto.serialNumbers && dto.serialNumbers.length > 0) {
          await this.serialNumbersService.transferSerials(
            tx,
            dto.serialNumbers,
            dto.fromWarehouseId,
            dto.toWarehouseId,
            dto.productId,
          );
        }

        return { transactionId, status: 'SUCCESS', minStockOrigin: originResult.minStock, stockAfterOrigin: originResult.stockAfter };
      });

      // Fuera de la transacción encolamos la alerta para el depósito de origen
      await this.alertsQueue.add('check-low-stock', {
        productId: dto.productId,
        warehouseId: dto.fromWarehouseId,
        currentQuantity: result.stockAfterOrigin,
        minStock: result.minStockOrigin,
      });
      this.logger.debug(`Enqueued check-low-stock for product ${dto.productId} in warehouse ${dto.fromWarehouseId}`);

      return { transactionId: result.transactionId, status: result.status };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.error('[StockService.createTransfer] Transaction failed:', error);
      throw new InternalServerErrorException('Failed to process stock transfer');
    }
  }

  async createAdjustment(dto: CreateAdjustmentDto, userId: string) {
    if (dto.batchId) {
      await this.validateBatch(dto.batchId, dto.productId);
    }
    if (dto.serialNumbers && dto.serialNumbers.length !== dto.quantity) {
      throw new BadRequestException(`El número de series provistas (${dto.serialNumbers.length}) no coincide con la cantidad (${dto.quantity})`);
    }
    const transactionId = uuidv4();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Lock pesimista en stocks
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

        // 1.5. Lock pesimista de batch_stocks (Misma lógica que executeMovementLogic)
        let currentBatchQuantity = 0;
        if (dto.batchId) {
          const batchLock = await tx.$queryRaw<{ quantity: number }[]>`
            SELECT quantity 
            FROM batch_stocks 
            WHERE batch_id = ${dto.batchId}::uuid 
              AND warehouse_id = ${dto.warehouseId}::uuid 
            FOR UPDATE
          `;
          if (batchLock.length > 0) {
            currentBatchQuantity = Number(batchLock[0].quantity);
          }
        }

        // 2. Validación en memoria
        if (dto.operation === 'SUBTRACT') {
          if (currentQuantity - dto.quantity < 0) {
            throw new BadRequestException('El ajuste resultaría en stock negativo');
          }
          if (dto.batchId && currentBatchQuantity - dto.quantity < 0) {
            throw new BadRequestException('El ajuste resultaría en stock negativo para el lote');
          }
        }

        const newQuantity = dto.operation === 'ADD' 
          ? currentQuantity + dto.quantity 
          : currentQuantity - dto.quantity;
          
        const newBatchQuantity = dto.operation === 'ADD'
          ? currentBatchQuantity + dto.quantity
          : currentBatchQuantity - dto.quantity;

        // 3. Crear movimiento inmutable
        const notesWithPrefix = `[${dto.operation}] ${dto.notes}`;
        
        const movement = await tx.stockMovement.create({
          data: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
            type: MovementType.ADJUSTMENT,
            quantity: dto.quantity,
            reference: `ADJ-${transactionId.split('-')[0]}`,
            notes: notesWithPrefix,
            transactionId,
            createdById: userId,
            correctsMovementId: dto.correctsMovementId,
            batchId: dto.batchId,
          },
        });

        // 4. Materialización
        if (dto.operation === 'SUBTRACT') {
          await tx.stock.update({
            where: {
              productId_warehouseId: {
                productId: dto.productId,
                warehouseId: dto.warehouseId,
              },
            },
            data: {
              quantity: { decrement: dto.quantity },
            },
          });
        } else {
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
              quantity: dto.quantity,
            },
            update: {
              quantity: { increment: dto.quantity },
            },
          });
        }
        
        // 4.5 Materializar batch_stocks
        if (dto.batchId) {
          await tx.batchStock.upsert({
            where: {
              batchId_warehouseId: {
                batchId: dto.batchId,
                warehouseId: dto.warehouseId,
              },
            },
            create: {
              batchId: dto.batchId,
              warehouseId: dto.warehouseId,
              quantity: newBatchQuantity,
            },
            update: {
              quantity: newBatchQuantity,
            },
          });
        }

        // 4.6 Materializar serials
        if (dto.serialNumbers && dto.serialNumbers.length > 0) {
          if (dto.operation === 'ADD') {
            await this.serialNumbersService.registerInbound(tx, dto.serialNumbers, movement.id, dto.productId, dto.warehouseId, dto.batchId);
          } else if (dto.operation === 'SUBTRACT') {
            await this.serialNumbersService.registerOutbound(tx, dto.serialNumbers, movement.id, dto.warehouseId, dto.productId);
          }
        }

        // 5. Fetch minStock para la cola
        const product = await tx.product.findUnique({
          where: { id: dto.productId },
          select: { minStock: true },
        });

        return { movement, stockAfter: newQuantity, minStock: product ? Number(product.minStock) : 0 };
      });

      if (dto.operation === 'SUBTRACT') {
        await this.alertsQueue.add('check-low-stock', {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          currentQuantity: result.stockAfter,
          minStock: result.minStock,
        });
        this.logger.debug(`Enqueued check-low-stock for product ${dto.productId} in warehouse ${dto.warehouseId}`);
      }

      return { movement: result.movement, stockAfter: result.stockAfter };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.error('[StockService.createAdjustment] Transaction failed:', error);
      throw new InternalServerErrorException('Failed to process stock adjustment');
    }
  }

  async getMovements(filters: GetMovementsFiltersDto) {
    const limit = filters.limit || 50;
    
    // Configurar fechas por defecto si no vienen
    let dateFrom = filters.dateFrom;
    let dateTo = filters.dateTo;

    if (!dateTo) {
      dateTo = new Date();
    }

    if (!dateFrom) {
      const thirtyDaysAgo = new Date(dateTo);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFrom = thirtyDaysAgo;
    }

    // Firewall: El rango de fechas no puede superar los 60 días
    const diffTime = Math.abs(dateTo.getTime() - dateFrom.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 60) {
      throw new BadRequestException('El rango de fechas no puede superar los 60 días para proteger el rendimiento del sistema');
    }

    const where: Prisma.StockMovementWhereInput = {
      createdAt: {
        gte: dateFrom,
        lte: dateTo,
      },
    };

    if (filters.productId) where.productId = filters.productId;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters.transactionId) where.transactionId = filters.transactionId;
    if (filters.type) where.type = filters.type;

    const data = await this.prisma.stockMovement.findMany({
      where,
      take: limit + 1,
      skip: filters.cursor ? 1 : undefined,
      cursor: filters.cursor ? { id: filters.cursor } : undefined,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' }
      ],
      include: {
        product: { select: { sku: true, name: true } },
        warehouse: { select: { name: true } },
        createdBy: { select: { name: true, email: true } }
      }
    });

    const hasNextPage = data.length > limit;
    if (hasNextPage) {
      data.pop(); // Remover el extra record
    }

    const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    return {
      data,
      meta: {
        nextCursor,
        hasNextPage
      }
    };
  }

  async getStocks(filters: GetStockFiltersDto) {
    const { productId, warehouseId, search, lowStock } = filters;
    const where: Prisma.StockWhereInput = {};

    if (productId) {
      where.productId = productId;
    }
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    if (search) {
      where.product = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    if (lowStock) {
      const lowStockPairs = await this.prisma.$queryRaw<{product_id: string, warehouse_id: string}[]>`
        SELECT s.product_id, s.warehouse_id 
        FROM stocks s 
        JOIN products p ON s.product_id = p.id 
        WHERE s.quantity <= p.min_stock
      `;

      if (lowStockPairs.length === 0) {
        return {
          data: [],
          meta: { 
            total: 0, 
            page: filters.page || 1, 
            limit: filters.limit || 50, 
            totalPages: 0 
          }
        };
      }

      (where as any).productId_warehouseId = {
        in: lowStockPairs.map(p => ({
          productId: p.product_id,
          warehouseId: p.warehouse_id
        }))
      };
    }

    const include = {
      product: { select: { id: true, sku: true, name: true } },
      warehouse: { select: { id: true, name: true } },
    };

    if (productId) {
      // Ignorar paginación
      const [data, total] = await Promise.all([
        this.prisma.stock.findMany({ where, include }),
        this.prisma.stock.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page: 1,
          limit: total > 0 ? total : 1,
          totalPages: 1,
        },
      };
    } else {
      // Aplicar paginación por offset
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.prisma.stock.findMany({
          where,
          include,
          skip,
          take: limit,
        }),
        this.prisma.stock.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  }

  async getAuditDiscrepancies() {
    const discrepanciesRaw = await this.prisma.$queryRaw<AuditDiscrepancyRaw[]>`
      SELECT 
        sm.product_id AS "productId", 
        sm.warehouse_id AS "warehouseId", 
        SUM(
          CASE 
            WHEN sm.type = 'INBOUND' THEN sm.quantity
            WHEN sm.type = 'OUTBOUND' THEN -sm.quantity
            WHEN sm.type = 'ADJUSTMENT' AND COALESCE(sm.notes, '') LIKE '%[ADD]%' THEN sm.quantity
            WHEN sm.type = 'ADJUSTMENT' AND COALESCE(sm.notes, '') LIKE '%[SUBTRACT]%' THEN -sm.quantity
            ELSE 0
          END
        ) AS "expectedQuantity",
        COALESCE(s.quantity, 0) AS "actualQuantity"
      FROM stock_movements sm
      LEFT JOIN stocks s ON sm.product_id = s.product_id AND sm.warehouse_id = s.warehouse_id
      GROUP BY sm.product_id, sm.warehouse_id, s.quantity
      HAVING SUM(
        CASE 
          WHEN sm.type = 'INBOUND' THEN sm.quantity
          WHEN sm.type = 'OUTBOUND' THEN -sm.quantity
          WHEN sm.type = 'ADJUSTMENT' AND COALESCE(sm.notes, '') LIKE '%[ADD]%' THEN sm.quantity
          WHEN sm.type = 'ADJUSTMENT' AND COALESCE(sm.notes, '') LIKE '%[SUBTRACT]%' THEN -sm.quantity
          ELSE 0
        END
      ) != COALESCE(s.quantity, 0)
    `;

    const discrepancies = discrepanciesRaw.map((row) => {
      const expected = Number(row.expectedQuantity);
      const actual = Number(row.actualQuantity);
      return {
        productId: row.productId,
        warehouseId: row.warehouseId,
        expectedQuantity: expected,
        actualQuantity: actual,
        difference: actual - expected,
      };
    });

    return {
      consistent: discrepancies.length === 0,
      discrepancies,
    };
  }

  async getStock(productId: string, warehouseId: string) {
    const stock = await this.prisma.stock.findUnique({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
    });
    return stock || { productId, warehouseId, quantity: 0 };
  }

  async getStockByBatch(productId?: string, warehouseId?: string, batchId?: string, includeEmpty: boolean = false) {
    const where: Prisma.BatchStockWhereInput = {};
    
    if (productId) where.batch = { productId };
    if (warehouseId) where.warehouseId = warehouseId;
    if (batchId) where.batchId = batchId;
    if (!includeEmpty) where.quantity = { gt: 0 };

    return this.prisma.batchStock.findMany({
      where,
      include: {
        batch: true,
        warehouse: { select: { id: true, name: true } }
      },
      orderBy: { batch: { expiryDate: { sort: 'asc', nulls: 'last' } } }
    });
  }

  private async validateBatch(batchId: string, productId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }
    if (batch.productId !== productId) {
      throw new BadRequestException(`Batch ${batchId} does not belong to product ${productId}`);
    }
    return batch;
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

    // 1.5. Bloqueo de lote si corresponde (Lock Hierarchy: stocks -> batch_stocks)
    let currentBatchQuantity = 0;
    if (dto.batchId) {
      const batchLock = await tx.$queryRaw<{ quantity: number }[]>`
        SELECT quantity 
        FROM batch_stocks 
        WHERE batch_id = ${dto.batchId}::uuid 
          AND warehouse_id = ${dto.warehouseId}::uuid 
        FOR UPDATE
      `;
      if (batchLock.length > 0) {
        currentBatchQuantity = Number(batchLock[0].quantity);
      }
    }

    // 2. Calcular nueva cantidad en base al tipo de movimiento.
    let newQuantity = currentQuantity;
    let newBatchQuantity = currentBatchQuantity;
    if (dto.type === MovementType.INBOUND) {
      newQuantity += dto.quantity;
      if (dto.batchId) newBatchQuantity += dto.quantity;
    } else if (dto.type === MovementType.OUTBOUND) {
      newQuantity -= dto.quantity;
      if (dto.batchId) newBatchQuantity -= dto.quantity;
    } else if (dto.type === MovementType.ADJUSTMENT) {
      throw new BadRequestException('Use explicit INBOUND/OUTBOUND for adjustments in this context');
    }

    // 3. Validar atomicidad
    if (newQuantity < 0) {
      throw new BadRequestException(`Insufficient stock. Current: ${currentQuantity}, Requested: ${dto.quantity}`);
    }
    if (dto.batchId && newBatchQuantity < 0) {
      throw new BadRequestException(`Insufficient batch stock. Current: ${currentBatchQuantity}, Requested: ${dto.quantity}`);
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
        batchId: dto.batchId,
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

    // 5.5 Materializar batch_stocks si corresponde
    if (dto.batchId) {
      await tx.batchStock.upsert({
        where: {
          batchId_warehouseId: {
            batchId: dto.batchId,
            warehouseId: dto.warehouseId,
          },
        },
        create: {
          batchId: dto.batchId,
          warehouseId: dto.warehouseId,
          quantity: newBatchQuantity,
        },
        update: {
          quantity: newBatchQuantity,
        },
      });
    }

    // 6. Obtener minStock desde Product de forma segura (sin afectar SELECT FOR UPDATE de stocks)
    const product = await tx.product.findUnique({
      where: { id: dto.productId },
      select: { minStock: true },
    });

    return { 
      movement, 
      stockAfter: newQuantity, 
      minStock: product ? Number(product.minStock) : 0,
      batchStockAfter: dto.batchId ? newBatchQuantity : undefined 
    };
  }

  async getBatchForMovement(movementId: string) {
    const movement = await this.prisma.stockMovement.findUnique({
      where: { id: movementId },
      include: {
        batch: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!movement) {
      throw new NotFoundException(`Stock movement with ID ${movementId} not found`);
    }

    return movement.batch;
  }
}
