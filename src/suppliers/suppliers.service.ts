import {
  Injectable,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSupplierDto: CreateSupplierDto) {
    try {
      return await this.prisma.supplier.create({
        data: createSupplierDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Supplier with this taxId already exists',
          );
        }
      }
      throw new InternalServerErrorException('Error creating supplier');
    }
  }

  async findAll() {
    return this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
    return supplier;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    await this.findOne(id); // Ensures it exists

    try {
      return await this.prisma.supplier.update({
        where: { id },
        data: updateSupplierDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Supplier with this taxId already exists',
          );
        }
      }
      throw new InternalServerErrorException('Error updating supplier');
    }
  }

  async deactivate(id: string) {
    const supplier = await this.findOne(id);

    if (!supplier.isActive) {
      return supplier;
    }

    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
