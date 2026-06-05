import { Injectable, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: createProductDto,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Product with SKU '${createProductDto.sku}' already exists`);
      }
      throw new InternalServerErrorException('Failed to create product');
    }
  }

  async findAll() {
    return this.prisma.product.findMany();
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    try {
      return await this.prisma.product.update({
        where: { id },
        data: updateProductDto,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Product with provided SKU already exists`);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      throw new InternalServerErrorException('Failed to update product');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.product.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      throw new InternalServerErrorException('Failed to delete product');
    }
  }
}
