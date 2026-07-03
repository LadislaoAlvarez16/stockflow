import { Module, forwardRef } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { BatchesController } from './batches.controller';
import { ProductBatchesController } from './product-batches.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [BatchesController, ProductBatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
