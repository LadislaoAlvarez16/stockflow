import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createWarehouseDto: CreateWarehouseDto) {
    try {
      return await this.prisma.warehouse.create({
        data: createWarehouseDto,
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to create warehouse');
    }
  }

  async findAll() {
    return this.prisma.warehouse.findMany();
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
    });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }
    return warehouse;
  }

  async update(id: string, updateWarehouseDto: UpdateWarehouseDto) {
    try {
      return await this.prisma.warehouse.update({
        where: { id },
        data: updateWarehouseDto,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      throw new InternalServerErrorException('Failed to update warehouse');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.warehouse.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Warehouse with ID ${id} not found`);
      }
      throw new InternalServerErrorException('Failed to delete warehouse');
    }
  }
}
