import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsOptional()
  @IsString()
  manager?: string;
}
