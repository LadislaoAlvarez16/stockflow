import {
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsDate,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MovementType } from '@prisma/client';

export class GetMovementsFiltersDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;
}
