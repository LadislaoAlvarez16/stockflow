import {
  IsUUID,
  IsEnum,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { MovementType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMovementDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'ID del lote si aplica', required: false })
  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(1000)
  serialNumbers?: string[];

  @ApiProperty({ description: 'ID del depósito' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ enum: MovementType, description: 'Tipo de movimiento' })
  @IsEnum(MovementType)
  @IsNotEmpty()
  type: MovementType;

  @ApiProperty({ description: 'Cantidad a mover', minimum: 1 })
  @IsNumber()
  @IsPositive()
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @IsString()
  @MaxLength(100)
  reference: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
