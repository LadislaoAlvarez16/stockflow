import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PdfService } from './pdf.service';
import { Prisma } from '@prisma/client';

interface ValuationItem {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  costPrice: number;
  totalValue: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  async generateStockValuation(warehouseId?: string): Promise<Buffer> {
    const whereClause: any = { quantity: { gt: 0 }, product: { isActive: true } };
    if (warehouseId) whereClause.warehouseId = warehouseId;

    const stocks = await this.prisma.stock.findMany({
      where: whereClause,
      include: { product: true, warehouse: true },
    });

    const productMap = new Map<string, ValuationItem>();

    for (const stock of stocks) {
      const p = stock.product;
      const categoryKey = p.category ? p.category.trim().toUpperCase() : 'SIN CATEGORÍA';
      
      const existing = productMap.get(p.id);
      const qty = Number(stock.quantity);
      const cost = Number(p.costPrice);

      if (existing) {
        existing.quantity += qty;
        existing.totalValue += qty * cost;
      } else {
        productMap.set(p.id, {
          sku: p.sku, name: p.name, category: categoryKey,
          quantity: qty, costPrice: cost, totalValue: qty * cost,
        });
      }
    }

    const categoriesMap = new Map<string, ValuationItem[]>();
    let grandTotal = 0;

    for (const item of productMap.values()) {
      if (!categoriesMap.has(item.category)) categoriesMap.set(item.category, []);
      categoriesMap.get(item.category)!.push(item);
      grandTotal += item.totalValue;
    }

    const sortedCategories = Array.from(categoriesMap.keys()).sort((a, b) => a.localeCompare(b));

    let htmlContent = `
      <table>
        <thead>
          <tr><th>SKU</th><th>Producto</th><th class="text-right">Cantidad</th><th class="text-right">Precio Costo</th><th class="text-right">Total Valorizado</th></tr>
        </thead>
        <tbody>
    `;

    for (const category of sortedCategories) {
      const items = categoriesMap.get(category)!;
      items.sort((a, b) => a.name.localeCompare(b.name));
      let categoryTotal = 0;

      htmlContent += `<tr class="category-row"><td colspan="5">Categoría: \${category}</td></tr>`;

      for (const item of items) {
        categoryTotal += item.totalValue;
        htmlContent += `
          <tr>
            <td>\${item.sku}</td><td>\${item.name}</td>
            <td class="text-right">\${item.quantity.toLocaleString('es-AR')}</td>
            <td class="text-right">$\${item.costPrice.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="text-right">$\${item.totalValue.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `;
      }
      htmlContent += `<tr class="subtotal-row"><td colspan="4" class="text-right">Subtotal \${category}:</td><td class="text-right">$\${categoryTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`;
    }

    htmlContent += `
        </tbody>
        <tfoot>
          <tr class="total-row"><td colspan="4" class="text-right">TOTAL GENERAL:</td><td class="text-right">$\${grandTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        </tfoot>
      </table>
    `;

    let subtitle = 'Consolidado Global';
    if (warehouseId && stocks.length > 0) subtitle = `Depósito: \${stocks[0].warehouse.name}`;

    const fullHtml = PdfService.baseReportLayout(htmlContent, {
      title: 'Reporte de Valorización de Stock',
      subtitle: subtitle,
      date: new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });

    return this.pdfService.generateFromHtml(fullHtml);
  }

  async generateMovementHistory(dateFrom: string, dateTo: string): Promise<Buffer> {
    if (!dateFrom || !dateTo) {
      throw new BadRequestException('Las fechas dateFrom y dateTo son obligatorias');
    }

    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Formato de fecha inválido');
    }

    const diffTime = Math.abs(to.getTime() - from.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 90) {
      throw new BadRequestException('El rango de fechas no puede superar los 90 días por protección de memoria');
    }
    
    // Set 'to' to end of day if it matches 'from' or is just a date string
    to.setHours(23, 59, 59, 999);

    let htmlContent = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Producto (SKU)</th>
            <th>Depósito</th>
            <th class="text-right">Cant.</th>
            <th>Referencia</th>
            <th>Lote</th>
            <th>Usuario</th>
          </tr>
        </thead>
        <tbody>
    `;

    let cursorId: string | undefined = undefined;
    let keepFetching = true;
    
    const totals: Record<string, number> = {
      INBOUND: 0,
      OUTBOUND: 0,
      TRANSFER: 0,
      ADJUSTMENT: 0
    };

    while (keepFetching) {
      const movements: any[] = await this.prisma.stockMovement.findMany({
        take: 500,
        skip: cursorId ? 1 : 0,
        cursor: cursorId ? { id: cursorId } : undefined,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'asc' }
        ],
        where: {
          createdAt: {
            gte: from,
            lte: to,
          },
        },
        include: {
          product: { select: { sku: true, name: true } },
          warehouse: { select: { name: true } },
          createdBy: { select: { name: true } },
          batch: { select: { batchNumber: true } }
        }
      });

      if (movements.length === 0) {
        keepFetching = false;
        break;
      }

      for (const mov of movements) {
        // badge color
        let color = '#6b7280';
        const movType = mov.type as string;
        if (movType === 'INBOUND') color = '#10b981'; // green
        if (movType === 'OUTBOUND') color = '#ef4444'; // red
        if (movType === 'TRANSFER') color = '#f59e0b'; // orange
        if (movType === 'ADJUSTMENT') color = '#3b82f6'; // blue
        
        if (totals[movType] !== undefined) {
          totals[movType] += Number(mov.quantity);
        }

        const dateStr = mov.createdAt.toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        htmlContent += `
          <tr>
            <td style="font-size: 10px;">\${dateStr}</td>
            <td><span style="background-color: \${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold;">\${mov.type}</span></td>
            <td>\${mov.product.sku}</td>
            <td>\${mov.warehouse.name}</td>
            <td class="text-right">\${Number(mov.quantity).toLocaleString('es-AR')}</td>
            <td style="font-size: 10px;">\${mov.reference}</td>
            <td>\${mov.batch ? mov.batch.batchNumber : '-'}</td>
            <td style="font-size: 10px;">\${mov.createdBy.name}</td>
          </tr>
        `;
      }

      cursorId = movements[movements.length - 1].id;
    }

    htmlContent += `
        </tbody>
      </table>
      
      <div style="margin-top: 30px; border-top: 2px solid #e5e7eb; padding-top: 10px;">
        <h3 style="color: #374151; font-size: 14px; margin-bottom: 10px;">Resumen de Cantidades Operadas</h3>
        <table style="width: 50%; margin: 0 auto; border: 1px solid #d1d5db;">
          <thead>
            <tr>
              <th style="background-color: #10b981; color: white;">INBOUND</th>
              <th style="background-color: #ef4444; color: white;">OUTBOUND</th>
              <th style="background-color: #f59e0b; color: white;">TRANSFER</th>
              <th style="background-color: #3b82f6; color: white;">ADJUSTMENT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-right" style="font-weight: bold;">\${totals.INBOUND.toLocaleString('es-AR')}</td>
              <td class="text-right" style="font-weight: bold;">\${totals.OUTBOUND.toLocaleString('es-AR')}</td>
              <td class="text-right" style="font-weight: bold;">\${totals.TRANSFER.toLocaleString('es-AR')}</td>
              <td class="text-right" style="font-weight: bold;">\${totals.ADJUSTMENT.toLocaleString('es-AR')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const fullHtml = PdfService.baseReportLayout(htmlContent, {
      title: 'Historial de Movimientos de Stock',
      subtitle: `Período: \${from.toLocaleDateString('es-AR')} al \${to.toLocaleDateString('es-AR')}`,
      date: new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });

    return this.pdfService.generateFromHtml(fullHtml);
  }

  async generateExpiryReport(warehouseId?: string, expiresInDays?: number): Promise<Buffer> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let maxDate: Date | undefined = undefined;
    if (expiresInDays !== undefined) {
      maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + Number(expiresInDays));
    }

    const whereBatchStock: Prisma.BatchStockWhereInput = {
      quantity: { gt: 0 }
    };
    if (warehouseId) {
      whereBatchStock.warehouseId = warehouseId;
    }

    const batchWhere: Prisma.BatchWhereInput = {
      expiryDate: { not: null },
      batchStocks: { some: whereBatchStock }
    };

    if (maxDate) {
      batchWhere.expiryDate = { lte: maxDate };
    }

    // Buscamos los lotes que cumplen
    const batches = await this.prisma.batch.findMany({
      where: batchWhere,
      include: {
        product: true,
        batchStocks: {
          where: whereBatchStock,
          include: { warehouse: true }
        }
      },
      orderBy: { expiryDate: 'asc' }
    });

    let htmlContent = `
      <table>
        <thead>
          <tr>
            <th>Fecha Vto.</th>
            <th>Días Restantes</th>
            <th>Lote</th>
            <th>Producto (SKU)</th>
            <th>Depósito</th>
            <th class="text-right">Cant. Disp.</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const b of batches) {
      const vto = new Date(b.expiryDate!);
      // Fix timezone offsets issues by zeroing hours
      vto.setHours(0,0,0,0);
      
      const diffTime = vto.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let colorClass = '#10b981'; // Green
      if (diffDays < 15) {
        colorClass = '#ef4444'; // Red
      } else if (diffDays <= 30) {
        colorClass = '#f59e0b'; // Orange
      }

      for (const bs of b.batchStocks) {
        htmlContent += `
          <tr>
            <td style="font-weight: bold;">\${vto.toLocaleDateString('es-AR')}</td>
            <td><span style="background-color: \${colorClass}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">\${diffDays} días</span></td>
            <td>\${b.batchNumber}</td>
            <td>\${b.product.name} <br><small style="color: #6b7280;">\${b.product.sku}</small></td>
            <td>\${bs.warehouse.name}</td>
            <td class="text-right">\${Number(bs.quantity).toLocaleString('es-AR')}</td>
          </tr>
        `;
      }
    }

    htmlContent += `
        </tbody>
      </table>
    `;

    let subtitle = 'Listado global de lotes con stock';
    if (warehouseId) subtitle += ` | Depósito Filtrado`;
    if (expiresInDays) subtitle += ` | Vencimiento <= \${expiresInDays} días`;

    const fullHtml = PdfService.baseReportLayout(htmlContent, {
      title: 'Reporte de Lotes por Vencer',
      subtitle: subtitle,
      date: new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });

    return this.pdfService.generateFromHtml(fullHtml);
  }

  async generateInventorySessionReport(sessionId: string): Promise<Buffer> {
    const session = await this.prisma.physicalInventorySession.findUnique({
      where: { id: sessionId },
      include: {
        warehouse: true,
        createdBy: true,
        movements: {
          include: {
            product: true,
            batch: true,
          }
        }
      }
    });

    if (!session) {
      throw new BadRequestException('Sesión de inventario no encontrada');
    }

    const dateStr = session.createdAt.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    let htmlContent = `
      <div style="margin-bottom: 20px;">
        <h3 style="color: #374151; font-size: 16px; margin-bottom: 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Resumen Ejecutivo</h3>
        <ul style="list-style-type: none; padding: 0; font-size: 14px;">
          <li><strong>Depósito:</strong> \${session.warehouse.name}</li>
          <li><strong>Responsable:</strong> \${session.createdBy.name} (\${session.createdBy.email})</li>
          <li><strong>Estado:</strong> \${session.status}</li>
          <li style="margin-top: 10px;"><strong>Ítems Contados Totales:</strong> \${session.totalItems}</li>
          <li><span style="color: #10b981; font-weight: bold;">Sin Diferencia (Matched):</span> \${session.matchedItems}</li>
          <li><span style="color: #f59e0b; font-weight: bold;">Con Diferencia (Adjusted):</span> \${session.adjustedItems}</li>
          <li><span style="color: #6b7280; font-weight: bold;">Omitidos (Skipped):</span> \${session.skippedItems}</li>
        </ul>
      </div>
    `;

    if (session.movements && session.movements.length > 0) {
      htmlContent += `
        <h3 style="color: #374151; font-size: 16px; margin-top: 30px; margin-bottom: 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Ajustes Realizados (Diferencias)</h3>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Lote</th>
              <th class="text-right">Diferencia</th>
              <th>Motivo / Notas</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      for (const mov of session.movements) {
        // En los ajustes, quantity puede ser negativo o positivo dependiendo de si fue SUBTRACT o ADD.
        // Prisma Decimal type a Number. Si es SUBTRACT y quantity es positivo en base, le ponemos el signo.
        // En StockService se guarda con signo nativo en BD? Depende. Lo parseamos del string notes si es necesario, 
        // pero la regla dice: "Renderizá esa columna tal cual viene de la base de datos".
        const isNegative = Number(mov.quantity) < 0;
        const color = isNegative ? '#ef4444' : '#10b981';
        const sign = isNegative ? '' : '+'; // el num ya tiene - si es negativo

        htmlContent += `
          <tr>
            <td>\${mov.product.sku}</td>
            <td>\${mov.product.name}</td>
            <td>\${mov.batch ? mov.batch.batchNumber : '-'}</td>
            <td class="text-right" style="color: \${color}; font-weight: bold;">\${sign}\${Number(mov.quantity).toLocaleString('es-AR')}</td>
            <td style="font-size: 11px;">\${mov.notes || '-'}</td>
          </tr>
        `;
      }
      
      htmlContent += `
          </tbody>
        </table>
      `;
    }

    if (session.errorLog && Array.isArray(session.errorLog) && session.errorLog.length > 0) {
      htmlContent += `
        <h3 style="color: #ef4444; font-size: 16px; margin-top: 30px; margin-bottom: 10px; border-bottom: 2px solid #fca5a5; padding-bottom: 5px;">Errores Detectados</h3>
        <table style="border: 1px solid #fca5a5;">
          <thead>
            <tr style="background-color: #fee2e2;">
              <th style="color: #991b1b;">Fila</th>
              <th style="color: #991b1b;">Detalle / Error</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const err of session.errorLog as any[]) {
        htmlContent += `
          <tr>
            <td style="color: #991b1b; font-weight: bold;">\${err.row || '-'}</td>
            <td style="color: #991b1b;">\${JSON.stringify(err.error || err)}</td>
          </tr>
        `;
      }

      htmlContent += `
          </tbody>
        </table>
      `;
    }

    htmlContent += `
      <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px dashed #d1d5db; padding-top: 10px;">
        Generado automáticamente por StockFlow
      </div>
    `;

    const fullHtml = PdfService.baseReportLayout(htmlContent, {
      title: 'Comprobante de Sesión de Inventario Físico',
      subtitle: `ID Sesión: \${session.id}`,
      date: dateStr,
    });

    return this.pdfService.generateFromHtml(fullHtml);
  }
}

