import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { GetBatchesFiltersDto } from './dto/get-batches-filters.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  create(@Body() createBatchDto: CreateBatchDto, @Request() req: any) {
    return this.batchesService.create(createBatchDto, req.user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  findAll(@Query() filters: GetBatchesFiltersDto) {
    return this.batchesService.findAll(filters);
  }

  @Get('expiring-soon')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  getExpiringBatches(
    @Query('daysThreshold', new DefaultValuePipe(30), ParseIntPipe)
    daysThreshold: number,
  ) {
    return this.batchesService.getExpiringBatches(daysThreshold);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.batchesService.findOne(id);
  }

  @Get(':id/movements')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  getMovements(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.batchesService.getMovements(id, page, limit);
  }

  @Get(':id/serial-numbers')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  getSerialNumbers(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.batchesService.getSerialNumbers(id, page, limit, status);
  }
}
