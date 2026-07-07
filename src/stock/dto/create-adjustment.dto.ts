import { IsUUID, IsNumber, IsPositive, IsString, IsNotEmpty, IsIn, IsOptional, IsArray, ArrayMaxSize } from 'class-validator';

export class CreateAdjustmentDto {
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
  warehouseId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsIn(['ADD', 'SUBTRACT'])
  operation: 'ADD' | 'SUBTRACT';

  @IsString()
  @IsNotEmpty()
  notes: string;

  @IsOptional()
  @IsUUID()
  correctsMovementId?: string;

  @IsOptional()
  @IsUUID()
  physicalInventorySessionId?: string;
}
