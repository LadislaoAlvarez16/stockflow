import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsUUID,
  IsOptional,
  IsDateString,
  IsNumber,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  batchNumber: string;

  @IsUUID()
  productId: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsDateString()
  @IsOptional()
  manufacturingDate?: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  initialQuantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
