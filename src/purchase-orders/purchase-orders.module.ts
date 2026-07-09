import { Module } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PrismaService } from '../common/prisma.service';
import { StockModule } from '../stock/stock.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [StockModule, WebhooksModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PrismaService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
