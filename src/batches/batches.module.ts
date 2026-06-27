import { Module } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { BatchesController } from './batches.controller';
import { ProductBatchesController } from './product-batches.controller';

@Module({
  controllers: [BatchesController, ProductBatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
