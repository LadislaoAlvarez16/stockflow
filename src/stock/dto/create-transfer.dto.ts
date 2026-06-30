import { IsUUID, IsNumber, IsPositive, IsString, MaxLength, IsOptional, IsArray, ArrayMaxSize } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(1000)
  serialNumbers?: string[];

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
