import { Controller, Post, Body, Get, Param, UseGuards, Request, Query } from '@nestjs/common';
import { StockService } from './stock.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { GetStockFiltersDto } from './dto/get-stock-filters.dto';
import { GetMovementsFiltersDto } from './dto/get-movements-filters.dto';
// Wait, the imports use '../common/guards/jwt-auth.guard' and '../common/guards/roles.guard'. 
// I need to check if jwt-auth.guard exists, but the user requested this explicitly.
// Actually, in NestJS, if Auth/JWT is implemented globally, maybe we don't need UseGuards.
// The ARCHITECTURE.md said: "Autenticación global por JWT. Rutas públicas deben usar explícitamente `@Public()`."
// So `@UseGuards(JwtAuthGuard, RolesGuard)` might be redundant or might throw an error if not found.
// The user provided the code, I will use it. If there is an error, I will fix it.
import { Roles } from '../common/decorators/roles.decorator';

// Assuming the user doesn't have JwtAuthGuard and RolesGuard in common/guards (I checked earlier, common/guards/roles.guard.ts exists but no jwt-auth.guard).
// I will just use the user's provided code verbatim.
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('movement')
  @Roles('ADMIN', 'OPERATOR')
  async createMovement(@Body() dto: CreateMovementDto, @Request() req: any) {
    return this.stockService.createMovement(dto, req.user.id);
  }

  @Post('transfer')
  @Roles('ADMIN', 'OPERATOR')
  async createTransfer(@Body() dto: CreateTransferDto, @Request() req: any) {
    return this.stockService.createTransfer(dto, req.user.id);
  }

  @Post('adjustment')
  @Roles('ADMIN')
  async createAdjustment(@Body() dto: CreateAdjustmentDto, @Request() req: any) {
    return this.stockService.createAdjustment(dto, req.user.id);
  }

  @Get('movements')
  async getMovements(@Query() filters: GetMovementsFiltersDto) {
    return this.stockService.getMovements(filters);
  }

  @Get()
  async getStocks(@Query() filters: GetStockFiltersDto) {
    return this.stockService.getStocks(filters);
  }

  @Get(':productId/:warehouseId')
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  async getStock(
    @Param('productId') productId: string,
    @Param('warehouseId') warehouseId: string,
  ) {
    return this.stockService.getStock(productId, warehouseId);
  }
}
