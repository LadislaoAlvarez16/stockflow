import { IsOptional, IsEnum, IsUUID, IsISO8601 } from 'class-validator';
import { PurchaseOrderStatus } from '@prisma/client';

export class GetPurchaseOrdersFilterDto {
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
