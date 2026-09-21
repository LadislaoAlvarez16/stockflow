jest.mock('puppeteer', () => ({}));
import { PdfService } from './pdf.service';

describe('PdfService - N-05 Template Literals', () => {
  it('baseReportLayout renders properly without literal ${}', () => {
    const service = new PdfService();
    const content = '<p>CONTENIDO-X</p>';
    const meta = {
      title: 'TITULO-X',
      subtitle: 'SUB-X',
      date: 'FECHA-X'
    };
    const html = PdfService.baseReportLayout(content, meta);
    
    expect(html).toContain('CONTENIDO-X');
    expect(html).toContain('TITULO-X');
    expect(html).toContain('SUB-X');
    expect(html).toContain('FECHA-X');
    
    // The previous bug output literal ${meta.title} etc.
    expect(html).not.toContain('${');
    expect(html).not.toContain('\\`');
  });
});
