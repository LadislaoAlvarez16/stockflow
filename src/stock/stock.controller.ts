import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { GetStockFiltersDto } from './dto/get-stock-filters.dto';
import { GetMovementsFiltersDto } from './dto/get-movements-filters.dto';
// Wait, the imports use '../common/guards/jwt-auth.guard' and '../common/guards/roles.guard'.
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BatchesService } from '../batches/batches.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Stock')
@ApiBearerAuth()
@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly batchesService: BatchesService,
  ) {}

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
  async createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @Request() req: any,
  ) {
    return this.stockService.createAdjustment(dto, req.user.id);
  }

  @Get('audit')
  @Roles('ADMIN')
  async getAuditDiscrepancies() {
    return this.stockService.getAuditDiscrepancies();
  }

  @Get('movements')
  async getMovements(@Query() filters: GetMovementsFiltersDto) {
    return this.stockService.getMovements(filters);
  }

  @Get('movements/:id/batch')
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  async getBatchForMovement(@Param('id') id: string) {
    return this.stockService.getBatchForMovement(id);
  }

  @Get('fefo-suggestion')
  @Roles('ADMIN', 'OPERATOR')
  async getFefoSuggestion(
    @Query('productId') productId: string,
    @Query('warehouseId') warehouseId: string,
    @Query('quantity') quantity: string,
  ) {
    const qty = Number(quantity);
    const suggestedBatch = await this.batchesService.suggestBatchForOutbound(
      productId,
      warehouseId,
      qty,
    );
    return {
      suggestedBatch,
      reason: suggestedBatch
        ? 'FEFO policy applied'
        : 'No suitable batch found',
    };
  }

  @Get('by-batch')
  @Roles('ADMIN', 'OPERATOR', 'VIEWER')
  async getStockByBatch(
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('batchId') batchId?: string,
    @Query('includeEmpty') includeEmpty?: string,
  ) {
    const parseIncludeEmpty = includeEmpty === 'true';
    return this.stockService.getStockByBatch(
      productId,
      warehouseId,
      batchId,
      parseIncludeEmpty,
    );
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
