import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StockService } from '../stock/stock.service';
import { MovementType } from '@prisma/client';
import { ImportResultDto, ImportError } from './dto/import-result.dto';
import * as Papa from 'papaparse';

const MAX_IMPORT_ROWS = 1000;

interface CsvRow {
  sku: string;
  warehouseCode: string;
  type: string;
  quantity: string;
  reference?: string;
  notes?: string;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  async processMovementsCSV(file: Express.Multer.File, userId: string): Promise<ImportResultDto> {
    const csvData = file.buffer.toString('utf8');

    const parsed = Papa.parse<CsvRow>(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length > 0) {
      throw new BadRequestException('Error parsing CSV file format');
    }

    const rows = parsed.data;

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`El archivo excede el límite de ${MAX_IMPORT_ROWS} filas para esta fase.`);
    }

    const result: ImportResultDto = {
      totalProcessed: rows.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
    };

    // 1. Recolectar entidades para optimizar queries (O(1) lookups)
    const skus = new Set<string>();
    const warehouseCodes = new Set<string>();
    const references = new Set<string>();

    rows.forEach((row) => {
      if (row.sku) skus.add(row.sku.trim());
      if (row.warehouseCode) warehouseCodes.add(row.warehouseCode.trim());
      if (row.reference) references.add(row.reference.trim());
    });

    // 2. Fetch de base de datos en lote
    const [products, warehouses, existingMovements] = await Promise.all([
      this.prisma.product.findMany({
        where: { sku: { in: Array.from(skus) } },
        select: { id: true, sku: true },
      }),
      this.prisma.warehouse.findMany({
        where: { code: { in: Array.from(warehouseCodes) } },
        select: { id: true, code: true },
      }),
      this.prisma.stockMovement.findMany({
        where: { reference: { in: Array.from(references) } },
        select: { reference: true },
      }),
    ]);

    // Crear mapas para acceso O(1)
    const productMap = new Map<string, string>();
    products.forEach((p) => productMap.set(p.sku, p.id));

    const warehouseMap = new Map<string, string>();
    warehouses.forEach((w) => warehouseMap.set(w.code, w.id));

    // Set para idempotencia iterativa + existente
    const processedReferences = new Set<string>();
    existingMovements.forEach((m) => {
      if (m.reference) processedReferences.add(m.reference);
    });

    // 3. Procesamiento fila por fila
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +1 para índice base 1, +1 para la cabecera
      const sku = row.sku?.trim();
      const warehouseCode = row.warehouseCode?.trim();
      const typeStr = row.type?.trim().toUpperCase();
      const quantityStr = row.quantity?.trim();
      const reference = row.reference?.trim();
      const notes = row.notes?.trim();

      // Validaciones básicas
      if (!sku || !warehouseCode || !typeStr || !quantityStr) {
        result.errors.push({ rowNumber, sku, reason: 'Faltan campos obligatorios (sku, warehouseCode, type, quantity)' });
        result.errorCount++;
        continue;
      }

      // Validar Enum MovementType
      if (!(typeStr in MovementType)) {
        result.errors.push({ rowNumber, sku, reason: `Tipo de movimiento inválido: ${typeStr}. Tipos permitidos: INBOUND, OUTBOUND, TRANSFER, ADJUSTMENT` });
        result.errorCount++;
        continue;
      }
      const type = typeStr as MovementType;

      const quantity = Number(quantityStr);
      if (isNaN(quantity) || quantity <= 0) {
        result.errors.push({ rowNumber, sku, reason: 'La cantidad debe ser un número mayor a 0' });
        result.errorCount++;
        continue;
      }

      const productId = productMap.get(sku);
      if (!productId) {
        result.errors.push({ rowNumber, sku, reason: `SKU no encontrado en el sistema: ${sku}` });
        result.errorCount++;
        continue;
      }

      const warehouseId = warehouseMap.get(warehouseCode);
      if (!warehouseId) {
        result.errors.push({ rowNumber, sku, reason: `Código de depósito no encontrado: ${warehouseCode}` });
        result.errorCount++;
        continue;
      }

      // Idempotencia: Verificar si ya procesamos esta referencia
      if (reference) {
        if (processedReferences.has(reference)) {
          // Skipear, cuenta como éxito (ya existe)
          result.successCount++;
          continue;
        }
      }

      // Intentar crear el movimiento
      try {
        await this.stockService.createMovement(
          {
            productId,
            warehouseId,
            type,
            quantity,
            reference: reference || '',
            notes,
          },
          userId,
        );
        
        if (reference) {
          processedReferences.add(reference);
        }
        result.successCount++;
      } catch (error: any) {
        // Acumular error (ej: Stock insuficiente)
        result.errors.push({ 
          rowNumber, 
          sku, 
          reason: error.message || 'Error procesando el movimiento en base de datos' 
        });
        result.errorCount++;
      }
    }

    return result;
  }

  async processProducts(file: Express.Multer.File): Promise<ImportResultDto> {
    const csvData = file.buffer.toString('utf8');
    const parsed = Papa.parse<any>(csvData, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
    
    if (parsed.errors.length > 0) throw new BadRequestException('Error parsing CSV');
    
    const rows = parsed.data;
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`El archivo excede el límite de ${MAX_IMPORT_ROWS} filas.`);

    const result: ImportResultDto = { totalProcessed: rows.length, successCount: 0, errorCount: 0, errors: [] };

    // Procesar en chunks de 100
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      
      await this.prisma.$transaction(async (tx) => {
        for (let j = 0; j < chunk.length; j++) {
          const row = chunk[j];
          const rowNum = i + j + 2;
          
          if (!row.sku || !row.name || !row.costPrice) {
            result.errorCount++;
            result.errors.push({ row: rowNum, reason: 'Faltan campos obligatorios (sku, name, costPrice)' });
            continue;
          }

          try {
            await tx.product.upsert({
              where: { sku: row.sku.trim() },
              update: {
                name: row.name.trim(),
                costPrice: parseFloat(row.costPrice) || 0,
                minStock: row.minStock ? parseFloat(row.minStock) : 0,
                category: row.category?.trim() || 'Uncategorized',
              },
              create: {
                sku: row.sku.trim(),
                name: row.name.trim(),
                costPrice: parseFloat(row.costPrice) || 0,
                minStock: row.minStock ? parseFloat(row.minStock) : 0,
                category: row.category?.trim() || 'Uncategorized',
              },
            });
            result.successCount++;
          } catch (e: any) {
            result.errorCount++;
            result.errors.push({ row: rowNum, reason: `Error de BD: ${e.message}` });
          }
        }
      });
    }
    return result;
  }

  async processInitialStock(file: Express.Multer.File, warehouseId: string, userId: string): Promise<ImportResultDto> {
    const csvData = file.buffer.toString('utf8');
    const parsed = Papa.parse<any>(csvData, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
    
    if (parsed.errors.length > 0) throw new BadRequestException('Error parsing CSV');
    const rows = parsed.data;
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`El archivo excede el límite de ${MAX_IMPORT_ROWS} filas.`);

    const result: ImportResultDto = { totalProcessed: rows.length, successCount: 0, errorCount: 0, errors: [] };

    // Obtener todos los SKUs para validación O(1)
    const skus = Array.from(new Set(rows.map(r => r.sku?.trim()).filter(Boolean)));
    const products = await this.prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } });
    const productMap = new Map<string, string>();
    products.forEach(p => productMap.set(p.sku, p.id));

    // Validar warehouse
    const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new BadRequestException('Warehouse no existe');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const sku = row.sku?.trim();
      const quantity = parseFloat(row.quantity);

      if (!sku || isNaN(quantity) || quantity <= 0) {
        result.errorCount++;
        result.errors.push({ row: rowNum, reason: 'SKU faltante o cantidad inválida' });
        continue;
      }

      const productId = productMap.get(sku);
      if (!productId) {
        result.errorCount++;
        result.errors.push({ row: rowNum, reason: `SKU ${sku} no existe` });
        continue;
      }

      try {
        await this.stockService.createMovement({
          productId,
          warehouseId,
          type: MovementType.INBOUND,
          quantity,
          reference: row.reference || 'INITIAL_STOCK_IMPORT'
        }, userId);
        result.successCount++;
      } catch (e: any) {
        result.errorCount++;
        result.errors.push({ row: rowNum, reason: `Error al crear movimiento: ${e.message}` });
      }
    }
    return result;
  }
}
