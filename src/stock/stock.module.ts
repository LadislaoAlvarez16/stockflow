import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { CommonModule } from '../common/common.module';
import { AlertsModule } from '../alerts/alerts.module';
import { BatchesModule } from '../batches/batches.module';

@Module({
  imports: [CommonModule, AlertsModule, BatchesModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
