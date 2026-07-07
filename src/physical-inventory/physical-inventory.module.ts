import { Module } from '@nestjs/common';
import { PhysicalInventoryService } from './physical-inventory.service';
import { PhysicalInventoryController } from './physical-inventory.controller';
import { CommonModule } from '../common/common.module';
import { StockModule } from '../stock/stock.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [CommonModule, StockModule, WebhooksModule, ReportsModule],
  controllers: [PhysicalInventoryController],
  providers: [PhysicalInventoryService],
  exports: [PhysicalInventoryService],
})
export class PhysicalInventoryModule {}
