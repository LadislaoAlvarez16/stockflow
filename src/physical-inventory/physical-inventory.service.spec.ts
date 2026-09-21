import { Test, TestingModule } from '@nestjs/testing';
import { PhysicalInventoryService } from './physical-inventory.service';
import { PrismaService } from '../common/prisma.service';
import { StockService } from '../stock/stock.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { getQueueToken } from '@nestjs/bullmq';
import * as ExcelJS from 'exceljs';

describe('PhysicalInventoryService – N-01 buffer pool bug', () => {
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

  it('FAILS with original code (file.buffer.buffer) when XLSX is pooled', async () => {
    expect.assertions(2);

    // 1. Generate a small XLSX
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['sku', 'counted_quantity']);
    sheet.addRow(['PROD-1', 10]);
    const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    expect(xlsxBuffer.length).toBeLessThan(8192);

    // 2. Simulate Node.js memory pool: XLSX is at offset 1024, but another
    //    valid ZIP signature sits AFTER it (simulating a second multer upload
    //    in the same pool). JSZip scans from the end and finds the wrong EOCD.
    const pool = Buffer.alloc(16384);
    xlsxBuffer.copy(pool, 1024);
    // Write a fake ZIP end-of-central-directory signature after the real XLSX
    // PK\x05\x06 = End of central directory record signature
    const fakeEocd = Buffer.from([
      0x50, 0x4b, 0x05, 0x06, // signature
      0x00, 0x00, 0x00, 0x00, // disk info
      0x00, 0x00, 0x00, 0x00, // entries
      0x00, 0x00, 0x00, 0x00, // size
      0x00, 0x00, 0x00, 0x00, // offset
      0x00, 0x00,             // comment length
    ]);
    fakeEocd.copy(pool, 1024 + xlsxBuffer.length + 100);
    const pooledBuffer = pool.subarray(1024, 1024 + xlsxBuffer.length);

    // 3. Original code path: file.buffer.buffer — exposes the entire 16 KB pool
    const wb = new ExcelJS.Workbook();
    const arrayBuffer = pooledBuffer.buffer as ArrayBuffer; // the full 16 KB!
    try {
      await wb.xlsx.load(arrayBuffer);
      // If it doesn't throw, it reads the WRONG data (empty workbook from fake EOCD)
      const ws = wb.worksheets[0];
      // With fake EOCD pointing to offset 0/size 0, JSZip finds 0 entries
      expect(ws).toBeUndefined();
    } catch (e: any) {
      // JSZip throws "Corrupted zip" or "End of data" when EOCD offsets are wrong
      expect(e.message).toMatch(/Corrupted|End of data|end of central directory/i);
    }
  });

  it('PASSES with fix (buf.buffer.slice) when XLSX is pooled', async () => {
    expect.assertions(3);

    // 1. Generate a small XLSX
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['sku', 'counted_quantity']);
    sheet.addRow(['PROD-1', 10]);
    const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    expect(xlsxBuffer.length).toBeLessThan(8192);

    // 2. Same pool setup
    const pool = Buffer.alloc(16384);
    xlsxBuffer.copy(pool, 1024);
    const fakeEocd = Buffer.from([
      0x50, 0x4b, 0x05, 0x06,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00,
    ]);
    fakeEocd.copy(pool, 1024 + xlsxBuffer.length + 100);
    const pooledBuffer = pool.subarray(1024, 1024 + xlsxBuffer.length);

    expect(pooledBuffer.buffer.byteLength).toBe(16384);

    // 3. Fixed code path: buf.buffer.slice(byteOffset, byteOffset + byteLength)
    const wb = new ExcelJS.Workbook();
    const buf = pooledBuffer;
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    await wb.xlsx.load(arrayBuffer);

    const ws = wb.worksheets[0];
    const rows: any[][] = [];
    ws.eachRow((row, _n) => {
      rows.push(row.values as any[]);
    });

    expect(rows).toEqual([
      [undefined, 'sku', 'counted_quantity'],
      [undefined, 'PROD-1', 10],
    ]);
  });
});
