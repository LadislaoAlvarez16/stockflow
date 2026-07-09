import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateSupplierDto } from './create-supplier.dto';

export class UpdateSupplierDto extends PartialType(OmitType(CreateSupplierDto, [] as const)) {}
