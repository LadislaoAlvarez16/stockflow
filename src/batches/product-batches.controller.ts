import { Controller, Get, Param } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('products')
export class ProductBatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get(':id/batches')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  getBatchesByProduct(@Param('id') id: string) {
    return this.batchesService.findByProduct(id);
  }
}
