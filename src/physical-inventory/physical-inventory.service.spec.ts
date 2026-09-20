import { Test, TestingModule } from '@nestjs/testing';
import { PhysicalInventoryService } from './physical-inventory.service';
import { PrismaService } from '../common/prisma.service';
import { StockService } from '../stock/stock.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { getQueueToken } from '@nestjs/bullmq';
import * as ExcelJS from 'exceljs';

describe('PhysicalInventoryService', () => {
  let service: PhysicalInventoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhysicalInventoryService,
        { provide: PrismaService, useValue: {} },
        { provide: StockService, useValue: {} },
        { provide: WebhookDispatcherService, useValue: {} },
        { provide: getQueueToken('audit'), useValue: {} },
      ],
    }).compile();
    service = module.get<PhysicalInventoryService>(PhysicalInventoryService);
  });

  it('should process a small excel file successfully', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['sku', 'quantity']);
    sheet.addRow(['PROD-1', 10]);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    
    // Simulamos que el buffer de exceljs es parte de un buffer más grande (pool de node)
    const largeBuffer = Buffer.alloc(8192);
    const sourceBuffer = Buffer.from(arrayBuffer);
    sourceBuffer.copy(largeBuffer, 1024);
    const slicedBuffer = largeBuffer.subarray(1024, 1024 + sourceBuffer.length);

    const file = { buffer: slicedBuffer } as any;
    
    try {
      await (service as any).processInventoryFile(file, 'test-id');
    } catch (e: any) {
      expect(e.message).not.toContain('File is not a zip');
      expect(e.message).not.toContain('End of data reached');
      expect(e.message).not.toContain('Corrupted zip');
    }
  });
});
