import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StockService } from '../stock/stock.service';
import { CreateAdjustmentDto } from '../stock/dto/create-adjustment.dto';
import * as xlsx from 'xlsx';
import { z } from 'zod';
import { PhysicalInventoryStatus, Prisma } from '@prisma/client';

const InventoryRowSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  counted_quantity: z.coerce
    .number()
    .nonnegative('Quantity must be non-negative'),
  batch_number: z.coerce.string().optional().nullable(),
  notes: z.coerce.string().optional().nullable(),
});

type InventoryRow = z.infer<typeof InventoryRowSchema>;

import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { WebhookEventType } from '@prisma/client';

@Injectable()
export class PhysicalInventoryService {
  private readonly logger = new Logger(PhysicalInventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly webhookDispatcherService: WebhookDispatcherService,
  ) {}

  async processUpload(
    file: Express.Multer.File,
    warehouseId: string,
    userId: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!warehouseId) throw new BadRequestException('warehouseId is required');

    // Validar depósito
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    // 1. Crear sesión de inventario en procesamiento
    const session = await this.prisma.physicalInventorySession.create({
      data: {
        warehouseId,
        createdById: userId,
        status: PhysicalInventoryStatus.processing,
      },
    });

    let matchedItems = 0;
    let adjustedItems = 0;
    let skippedItems = 0;
    const errorLog: any[] = [];
    const adjustmentsToProcess: { dto: CreateAdjustmentDto; rowNum: number }[] =
      [];

    try {
      // 2. Parsear el archivo con SheetJS
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      // defval: null garantiza que celdas vacías vengan en null y no en undefined
      const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: null });

      // 3. Pre-load O(1) del inventario actual para este depósito
      // Obtenemos todos los productos activos y sus stocks/batches en este warehouse
      const productsData = await this.prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          hasSerialNumbers: true,
          stocks: {
            where: { warehouseId },
            select: { quantity: true },
          },
          batches: {
            select: {
              id: true,
              batchNumber: true,
              batchStocks: {
                where: { warehouseId },
                select: { quantity: true },
              },
            },
          },
        },
      });

      // Map para búsqueda rápida O(1)
      const productMap = new Map<string, (typeof productsData)[0]>();
      for (const p of productsData) {
        productMap.set(p.sku.toUpperCase(), p);
      }

      // 4. Iterar sobre las filas y reconciliar
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2; // Fila 1 es header, índice 0 de datos = Fila 2 de Excel

        const parsed = InventoryRowSchema.safeParse(row);
        if (!parsed.success) {
          const errors = parsed.error.issues
            .map((e: any) => `${e.path.join('.')}: ${e.message}`)
            .join(', ');
          errorLog.push({
            row: rowNum,
            error: `Invalid data format: ${errors}`,
          });
          continue;
        }

        const data = parsed.data;
        const skuUpper = data.sku.toUpperCase();
        const product = productMap.get(skuUpper);

        if (!product) {
          skippedItems++;
          errorLog.push({
            row: rowNum,
            error: `SKU no encontrado o inactivo: ${data.sku}`,
          });
          continue;
        }

        if (product.hasSerialNumbers) {
          skippedItems++;
          errorLog.push({
            row: rowNum,
            error:
              'Producto serializado: el ajuste debe realizarse de forma manual',
          });
          continue;
        }

        // Determinar system quantity (general o por lote)
        let systemQuantity = 0;
        let batchId: string | undefined = undefined;

        if (data.batch_number) {
          const batch = product.batches.find(
            (b) => b.batchNumber === data.batch_number,
          );
          if (!batch) {
            skippedItems++;
            errorLog.push({
              row: rowNum,
              error: `Lote ${data.batch_number} no encontrado para SKU ${data.sku}`,
            });
            continue;
          }
          batchId = batch.id;
          const bs = batch.batchStocks[0];
          systemQuantity = bs ? Number(bs.quantity) : 0;
        } else {
          // General stock
          const s = product.stocks[0];
          systemQuantity = s ? Number(s.quantity) : 0;
        }

        const counted = data.counted_quantity;
        const difference = counted - systemQuantity;

        if (difference === 0) {
          matchedItems++;
        } else {
          const operation = difference > 0 ? 'ADD' : 'SUBTRACT';
          const qtyToAdjust = Math.abs(difference);

          adjustmentsToProcess.push({
            rowNum,
            dto: {
              productId: product.id,
              warehouseId,
              quantity: qtyToAdjust,
              operation,
              notes:
                data.notes || `Ajuste por inventario físico. Fila ${rowNum}`,
              batchId,
              physicalInventorySessionId: session.id,
            },
          });
        }
      }

      // 5. Procesar los ajustes en chunks de 50
      const CHUNK_SIZE = 50;
      for (let i = 0; i < adjustmentsToProcess.length; i += CHUNK_SIZE) {
        const chunk = adjustmentsToProcess.slice(i, i + CHUNK_SIZE);

        for (const item of chunk) {
          try {
            await this.stockService.createAdjustment(item.dto, userId);
            adjustedItems++;
          } catch (error: any) {
            errorLog.push({
              row: item.rowNum,
              error: `Falló al generar ajuste: ${error.message}`,
            });
          }
        }
      }

      // 6. Actualizar el estado final de la sesión
      let finalStatus: PhysicalInventoryStatus =
        PhysicalInventoryStatus.completed;
      if (errorLog.length > 0) {
        finalStatus =
          adjustedItems === 0 && matchedItems === 0
            ? PhysicalInventoryStatus.failed
            : PhysicalInventoryStatus.completed_with_errors;
      } else if (adjustedItems > 0) {
        finalStatus = PhysicalInventoryStatus.completed_with_differences;
      }

      const completedSession =
        await this.prisma.physicalInventorySession.update({
          where: { id: session.id },
          data: {
            status: finalStatus,
            matchedItems,
            adjustedItems,
            skippedItems,
            errorLog: errorLog.length > 0 ? errorLog : Prisma.DbNull,
          },
        });

      // Emitir webhook post-transacción/post-actualización
      await this.webhookDispatcherService.dispatch(
        WebhookEventType.inventory_reconciled,
        {
          sessionId: completedSession.id,
          warehouseId,
          status: completedSession.status,
          matchedItems,
          adjustedItems,
          skippedItems,
          errors: errorLog.length,
        },
      );

      return {
        message: 'Inventario físico procesado exitosamente',
        session: completedSession,
      };
    } catch (err: any) {
      this.logger.error(
        `Error procesando inventario físico: ${err.message}`,
        err.stack,
      );

      await this.prisma.physicalInventorySession.update({
        where: { id: session.id },
        data: {
          status: PhysicalInventoryStatus.failed,
          errorLog: [
            { row: 0, error: 'Error catastrófico procesando el archivo' },
          ],
        },
      });

      throw new BadRequestException(
        `No se pudo procesar el archivo: ${err.message}`,
      );
    }
  }

  async getSessions() {
    return this.prisma.physicalInventorySession.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { name: true, email: true } },
        warehouse: { select: { name: true } },
      },
    });
  }

  async getSession(id: string) {
    return this.prisma.physicalInventorySession.findUniqueOrThrow({
      where: { id },
      include: {
        createdBy: { select: { name: true, email: true } },
        warehouse: { select: { name: true } },
      },
    });
  }

  async getSessionAdjustments(id: string) {
    return this.prisma.stockMovement.findMany({
      where: { physicalInventorySessionId: id },
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    });
  }
}
