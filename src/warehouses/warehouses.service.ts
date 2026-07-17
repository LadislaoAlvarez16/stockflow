import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createWarehouseDto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findUnique({
      where: { code: createWarehouseDto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Warehouse with code ${createWarehouseDto.code} already exists`,
      );
    }

    try {
      return await this.prisma.warehouse.create({
        data: createWarehouseDto,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Warehouse with code ${createWarehouseDto.code} already exists`,
        );
      }
      throw new InternalServerErrorException('Failed to create warehouse');
    }
  }

  async findAll() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
    });
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
    await this.findOne(id);

    if (updateWarehouseDto.code) {
      const existing = await this.prisma.warehouse.findUnique({
        where: { code: updateWarehouseDto.code },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Warehouse with code ${updateWarehouseDto.code} already exists`,
        );
      }
    }

    try {
      return await this.prisma.warehouse.update({
        where: { id },
        data: updateWarehouseDto,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Warehouse with code ${updateWarehouseDto.code} already exists`,
        );
      }
      throw new InternalServerErrorException('Failed to update warehouse');
    }
  }

  async deactivate(id: string) {
    await this.findOne(id);

    try {
      return await this.prisma.warehouse.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to deactivate warehouse');
    }
  }
}
