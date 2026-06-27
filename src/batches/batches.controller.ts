import { Controller, Get, Post, Body, Param, Query, Request } from '@nestjs/common';
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
    return this.batchesService.create(createBatchDto, req.user.sub);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  findAll(@Query() filters: GetBatchesFiltersDto) {
    return this.batchesService.findAll(filters);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.batchesService.findOne(id);
  }
}
