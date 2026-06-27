import { IsOptional, IsUUID, IsDateString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class GetBatchesFiltersDto {
  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsDateString()
  @IsOptional()
  expiresBeforeDate?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  hasStock?: boolean;
}
