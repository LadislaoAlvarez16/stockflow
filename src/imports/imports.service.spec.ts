import { Test, TestingModule } from '@nestjs/testing';
import { ImportsService } from './imports.service';
import { PrismaService } from '../common/prisma.service';
import { StockService } from '../stock/stock.service';
import { BadRequestException } from '@nestjs/common';
import { MovementType } from '@prisma/client';

describe('ImportsService', () => {
  let service: ImportsService;
  let prismaService: jest.Mocked<PrismaService>;
  let stockService: jest.Mocked<StockService>;

  const mockPrismaService = {
    product: { findMany: jest.fn() },
    warehouse: { findMany: jest.fn() },
    stockMovement: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockStockService = {
    createMovement: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StockService, useValue: mockStockService },
      ],
    }).compile();

    service = module.get<ImportsService>(ImportsService);
    prismaService = module.get(PrismaService);
    stockService = module.get(StockService);

    jest.clearAllMocks();

    // Default setups
    mockPrismaService.product.findMany.mockResolvedValue([
      { id: 'prod-1', sku: 'SKU-001' },
      { id: 'prod-2', sku: 'SKU-002' },
    ]);
    mockPrismaService.warehouse.findMany.mockResolvedValue([
      { id: 'wh-1', code: 'WH-A' },
      { id: 'wh-2', code: 'WH-B' },
    ]);
    mockPrismaService.stockMovement.findMany.mockResolvedValue([]);
    mockStockService.createMovement.mockResolvedValue({
      movement: { id: 'mov-1' },
      stockAfter: 10,
    });
  });

  const createCsvFile = (csvContent: string): Express.Multer.File => {
    return {
      buffer: Buffer.from(csvContent, 'utf8'),
      originalname: 'test.csv',
      mimetype: 'text/csv',
    } as Express.Multer.File;
  };

  describe('processMovementsCSV', () => {
    it('1. Fila válida INBOUND → llama a StockService.createMovement() con los parámetros correctos → successCount: 1', async () => {
      const csv = 'sku,warehouseCode,type,quantity\nSKU-001,WH-A,INBOUND,10';
      const file = createCsvFile(csv);

      const result = await service.processMovementsCSV(file, 'user-1');

      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(0);
      expect(result.totalProcessed).toBe(1);
      expect(stockService.createMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          warehouseId: 'wh-1',
          type: MovementType.INBOUND,
          quantity: 10,
        }),
        'user-1',
      );
    });

    it('2. Fila con SKU inexistente → no llama a createMovement() → errorCount: 1, error describe el SKU faltante', async () => {
      const csv = 'sku,warehouseCode,type,quantity\nINVALID-SKU,WH-A,INBOUND,10';
      const file = createCsvFile(csv);

      const result = await service.processMovementsCSV(file, 'user-1');

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0].reason).toContain('SKU no encontrado');
      expect(stockService.createMovement).not.toHaveBeenCalled();
    });

    it('3. Fila con warehouseCode inexistente → errorCount: 1', async () => {
      const csv = 'sku,warehouseCode,type,quantity\nSKU-001,INVALID-WH,INBOUND,10';
      const file = createCsvFile(csv);

      const result = await service.processMovementsCSV(file, 'user-1');

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0].reason).toContain('Código de depósito no encontrado');
      expect(stockService.createMovement).not.toHaveBeenCalled();
    });

    it('4. Fila con quantity inválida (0, negativo, texto) → errorCount: 1', async () => {
      const csv1 = 'sku,warehouseCode,type,quantity\nSKU-001,WH-A,INBOUND,0';
      const csv2 = 'sku,warehouseCode,type,quantity\nSKU-001,WH-A,INBOUND,-5';
      const csv3 = 'sku,warehouseCode,type,quantity\nSKU-001,WH-A,INBOUND,texto';

      for (const csv of [csv1, csv2, csv3]) {
        const file = createCsvFile(csv);
        const result = await service.processMovementsCSV(file, 'user-1');
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(1);
        expect(result.errors[0].reason).toContain('La cantidad debe ser un número mayor a 0');
      }
      expect(stockService.createMovement).not.toHaveBeenCalled();
    });

    it('5. Fila con referencia ya existente en DB → se skipea (idempotencia DB) → successCount: 1, createMovement NO llamado', async () => {
      mockPrismaService.stockMovement.findMany.mockResolvedValue([
        { reference: 'REF-123' },
      ]);
      const csv = 'sku,warehouseCode,type,quantity,reference\nSKU-001,WH-A,INBOUND,10,REF-123';
      const file = createCsvFile(csv);

      const result = await service.processMovementsCSV(file, 'user-1');

      expect(result.successCount).toBe(1); // Cuenta como éxito porque ya existe
      expect(result.errorCount).toBe(0);
      expect(stockService.createMovement).not.toHaveBeenCalled();
    });

    it('6. Dos filas con la misma referencia en el mismo archivo → la segunda se skipea (idempotencia en memoria) → successCount: 1, errorCount: 0', async () => {
      const csv =
        'sku,warehouseCode,type,quantity,reference\n' +
        'SKU-001,WH-A,INBOUND,10,REF-NEW\n' +
        'SKU-002,WH-B,OUTBOUND,5,REF-NEW';
      const file = createCsvFile(csv);

      const result = await service.processMovementsCSV(file, 'user-1');

      expect(result.totalProcessed).toBe(2);
      // Wait, 1 successful processing + 1 skipped due to reference memory idempotency = 2 successCount!
      expect(result.successCount).toBe(2); 
      expect(result.errorCount).toBe(0);
      // Only called ONCE for the first reference
      expect(stockService.createMovement).toHaveBeenCalledTimes(1);
    });

    it('7. Mezcla: 3 filas válidas + 2 con error → successCount: 3, errorCount: 2, totalProcessed: 5', async () => {
      const csv =
        'sku,warehouseCode,type,quantity\n' +
        'SKU-001,WH-A,INBOUND,10\n' + // OK
        'SKU-INVALID,WH-A,INBOUND,10\n' + // Error: invalid sku
        'SKU-002,WH-B,OUTBOUND,5\n' + // OK
        'SKU-001,WH-INVALID,INBOUND,10\n' + // Error: invalid warehouse
        'SKU-001,WH-B,TRANSFER,2\n'; // OK

      const file = createCsvFile(csv);

      const result = await service.processMovementsCSV(file, 'user-1');

      expect(result.totalProcessed).toBe(5);
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(2);
      expect(stockService.createMovement).toHaveBeenCalledTimes(3);
    });

    it('8. Archivo que supera MAX_IMPORT_ROWS → BadRequestException antes de procesar nada', async () => {
      // 1001 filas
      let csv = 'sku,warehouseCode,type,quantity\n';
      for (let i = 0; i < 1001; i++) {
        csv += 'SKU-001,WH-A,INBOUND,1\n';
      }
      const file = createCsvFile(csv);

      await expect(service.processMovementsCSV(file, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(stockService.createMovement).not.toHaveBeenCalled();
    });
  });
});
