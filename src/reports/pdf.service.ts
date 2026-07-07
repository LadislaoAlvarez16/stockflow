import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

export interface ReportMeta {
  title: string;
  subtitle?: string;
  date: string;
}

@Injectable()
export class PdfService {
  async generateFromHtml(html: string): Promise<Buffer> {
    let browser: puppeteer.Browser | undefined;
    try {
      browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true, // headless is default, just explicit
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const pdfUint8Array = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '15mm',
          right: '15mm',
        },
      });
      
      // Puppeteer returns a Uint8Array in recent versions, so convert to Buffer
      return Buffer.from(pdfUint8Array);
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new InternalServerErrorException('Failed to generate PDF report');
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  static baseReportLayout(content: string, meta: ReportMeta): string {
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>\${meta.title}</title>
        <style>
          @page {
            size: A4;
            margin: 0; 
            /* Margins are handled by puppeteer config, but we can set counter here */
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            font-size: 12px;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .header h1 {
            color: #1e3a8a;
            margin: 0 0 5px 0;
            font-size: 24px;
          }
          .header h2 {
            color: #4b5563;
            margin: 0 0 5px 0;
            font-size: 16px;
            font-weight: normal;
          }
          .header p {
            color: #6b7280;
            margin: 0;
            font-size: 11px;
          }
          .footer {
            text-align: center;
            color: #9ca3af;
            font-size: 10px;
            margin-top: 30px;
            border-top: 1px solid #e5e7eb;
            padding-top: 10px;
            position: fixed;
            bottom: 0;
            width: 100%;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background-color: #f3f4f6;
            color: #374151;
            font-weight: bold;
            text-align: left;
            padding: 10px;
            border-bottom: 2px solid #d1d5db;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #e5e7eb;
            color: #4b5563;
          }
          .category-row {
            background-color: #e5e7eb;
            font-weight: bold;
            color: #1f2937;
          }
          .category-row td {
            padding-top: 15px;
            padding-bottom: 15px;
          }
          .subtotal-row {
            background-color: #f9fafb;
            font-weight: bold;
          }
          .total-row {
            background-color: #dbeafe;
            font-weight: bold;
            font-size: 14px;
            color: #1e40af;
          }
          .total-row td {
            border-top: 2px solid #93c5fd;
            border-bottom: 2px solid #93c5fd;
          }
          .text-right {
            text-align: right;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>StockFlow</h1>
          <h2>\${meta.title}</h2>
          \${meta.subtitle ? \`<p>\${meta.subtitle}</p>\` : ''}
          <p>Fecha de Emisión: \${meta.date}</p>
        </div>
        
        <div class="content">
          \${content}
        </div>
        
        <!-- Puppeteer can inject footer via headerTemplate/footerTemplate if needed, 
             but inline CSS paging requires specific browser flags. We will just add a static footer for now 
             or rely on page numbers if we use displayHeaderFooter -->
      </body>
      </html>
    `;
  }
}
