import { IsString, IsOptional } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  name: string;

  @IsString()
  location: string;

  @IsOptional()
  @IsString()
  manager?: string;
}
