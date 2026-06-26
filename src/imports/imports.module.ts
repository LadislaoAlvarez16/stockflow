import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [StockModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
