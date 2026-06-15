import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { CommonModule } from '../common/common.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [CommonModule, AlertsModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
