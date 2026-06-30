import { IsUUID, IsEnum, IsNumber, IsPositive, IsString, MaxLength, IsOptional, IsArray, ArrayMaxSize } from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateMovementDto {
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

  @IsEnum(MovementType)
  type: MovementType;

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
