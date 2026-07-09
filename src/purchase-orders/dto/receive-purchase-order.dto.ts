import { IsUUID, IsInt, IsString, IsNotEmpty, IsArray, ValidateNested, ArrayMinSize, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceivePurchaseOrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantityReceived: number;
}

export class ReceivePurchaseOrderDto {
  @IsUUID()
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ReceivePurchaseOrderItemDto)
  items: ReceivePurchaseOrderItemDto[];
}
