jest.mock('puppeteer', () => ({}));
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../common/prisma.service';
import { PdfService } from './pdf.service';
import * as ExcelJS from 'exceljs';

describe('ReportsService - N-05 Template Literals', () => {
  let service: ReportsService;
  let pdfService: PdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: PrismaService,
          useValue: {
            stock: {
              findMany: jest.fn().mockResolvedValue([
                {
                  quantity: 10,
                  product: { sku: 'SKU-TEST', name: 'Prod Name', category: 'Test Cat' },
                  warehouse: { name: 'WH' },
                },
              ]),
            },
            purchaseOrderItem: {
              findMany: jest.fn().mockResolvedValue([
                { productId: 'some-id', costPrice: 100 },
              ]),
            },
          },
        },
        {
          provide: PdfService,
          useValue: {
            generateFromHtml: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
            baseReportLayout: jest.fn((content) => content),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    pdfService = module.get<PdfService>(PdfService);
  });

  it('generates stock valuation HTML without escaped literals', async () => {
    await service.generateStockValuation();

    expect(pdfService.generateFromHtml).toHaveBeenCalled();
    const htmlArgs = (pdfService.generateFromHtml as jest.Mock).mock.calls[0][0];

    expect(htmlArgs).toContain('SKU-TEST');
    expect(htmlArgs).toContain('Prod Name');
    expect(htmlArgs).toContain('Test Cat');
    
    // Original buggy code output literally ${item.sku}, etc.
    expect(htmlArgs).not.toContain('${');
  });
});
