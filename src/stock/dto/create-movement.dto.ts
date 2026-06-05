import { IsUUID, IsEnum, IsNumber, IsPositive, IsString, MaxLength, IsOptional } from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateMovementDto {
  @IsUUID()
  productId: string;

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
