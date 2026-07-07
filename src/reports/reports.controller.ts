import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  getReportsDirectory() {
    return [
      {
        id: 'stock-valuation',
        name: 'Reporte de Valorización de Stock',
        description: 'Calcula el valor financiero del stock materializado por categoría.',
        url: '/reports/stock-valuation',
        filters: [
          { name: 'warehouseId', type: 'string', required: false, description: 'Filtrar por ID de depósito' }
        ]
      },
      {
        id: 'movement-history',
        name: 'Historial de Movimientos',
        description: 'Detalle de todos los movimientos (INBOUND, OUTBOUND, TRANSFER, ADJUSTMENT). Límite de 90 días.',
        url: '/reports/movement-history',
        filters: [
          { name: 'dateFrom', type: 'date', required: true, description: 'Fecha de inicio (ISO 8601)' },
          { name: 'dateTo', type: 'date', required: true, description: 'Fecha de fin (ISO 8601)' }
        ]
      },
      {
        id: 'expiry',
        name: 'Lotes por Vencer',
        description: 'Listado de lotes con stock, ordenados por fecha de vencimiento más próxima.',
        url: '/reports/expiry',
        filters: [
          { name: 'warehouseId', type: 'string', required: false, description: 'Filtrar por ID de depósito' },
          { name: 'expiresInDays', type: 'number', required: false, description: 'Mostrar solo lotes que venzan en los próximos N días' }
        ]
      }
    ];
  }

  @Get('stock-valuation')
  @Roles(UserRole.ADMIN)
  async getStockValuation(
    @Query('warehouseId') warehouseId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.reportsService.generateStockValuation(warehouseId);
    this.sendPdfResponse(res, pdfBuffer, 'stock-valuation');
  }

  @Get('movement-history')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async getMovementHistory(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.reportsService.generateMovementHistory(dateFrom, dateTo);
    this.sendPdfResponse(res, pdfBuffer, 'movement-history');
  }

  @Get('expiry')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async getExpiryReport(
    @Query('warehouseId') warehouseId: string,
    @Query('expiresInDays') expiresInDays: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.reportsService.generateExpiryReport(
      warehouseId, 
      expiresInDays ? parseInt(expiresInDays, 10) : undefined
    );
    this.sendPdfResponse(res, pdfBuffer, 'expiry-report');
  }

  private sendPdfResponse(res: Response, buffer: Buffer, prefix: string) {
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `\${prefix}-\${dateStr}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="\${filename}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
