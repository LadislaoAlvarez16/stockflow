import { Controller, Get, Post, Param, UseInterceptors, UploadedFile, Body, Res, ParseUUIDPipe, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PhysicalInventoryService } from './physical-inventory.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Express } from 'express';
import { ReportsService } from '../reports/reports.service';

@Controller('physical-inventory')
export class PhysicalInventoryController {
  constructor(
    private readonly physicalInventoryService: PhysicalInventoryService,
    private readonly reportsService: ReportsService
  ) {}

  @Get('template')
  getTemplate(@Res() res: Response) {
    // Generate CSV template with sheetjs or manually
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @UseInterceptors(FileInterceptor('file'))
  async uploadInventory(
    @UploadedFile() file: Express.Multer.File,
    @Body('warehouseId') warehouseId: string,
    @CurrentUser() user: any,
  ) {
    const userId = user.id || user.sub;
    return this.physicalInventoryService.processUpload(file, warehouseId, userId);
  }

  @Get()
  async getSessions() {
    return this.physicalInventoryService.getSessions();
  }

  @Get(':id')
  async getSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.physicalInventoryService.getSession(id);
  }

  @Get(':id/adjustments')
  async getSessionAdjustments(@Param('id', ParseUUIDPipe) id: string) {
    return this.physicalInventoryService.getSessionAdjustments(id);
  }

  @Get(':id/report')
  async getSessionReport(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const session = await this.physicalInventoryService.getSession(id);

    if (session && session.status === 'processing') {
      throw new BadRequestException('La sesión de inventario aún no ha finalizado');
    }

    const pdfBuffer = await this.reportsService.generateInventorySessionReport(id);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="inventory-session-\${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    
    res.end(pdfBuffer);
  }
}
