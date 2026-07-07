import { Module, forwardRef } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { BatchesController } from './batches.controller';
import { ProductBatchesController } from './product-batches.controller';
import { CommonModule } from '../common/common.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { BatchesCronService } from './batches.cron';

@Module({
  imports: [CommonModule, WebhooksModule],
  controllers: [BatchesController, ProductBatchesController],
  providers: [BatchesService, BatchesCronService],
  exports: [BatchesService],
})
export class BatchesModule {}
