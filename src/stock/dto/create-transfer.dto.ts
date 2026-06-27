import { IsUUID, IsNumber, IsPositive, IsString, MaxLength, IsOptional } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsUUID()
  fromWarehouseId: string;

  @IsUUID()
  toWarehouseId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsString()
  @MaxLength(100)
  reference: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
