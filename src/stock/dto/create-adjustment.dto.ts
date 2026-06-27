import { IsUUID, IsNumber, IsPositive, IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';

export class CreateAdjustmentDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

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
}
