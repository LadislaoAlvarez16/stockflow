import { IsString, IsNumber, IsOptional, Min, IsUUID } from 'class-validator';

export class CreateProductDto {
  @IsString()
  sku: string;

  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;
}
