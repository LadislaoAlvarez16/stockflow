import { Injectable, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { PrismaService } from '../common/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { sku: createProductDto.sku },
    });

    if (existingProduct) {
      throw new ConflictException('SKU already exists');
    }

    try {
      return await this.prisma.product.create({
        data: createProductDto,
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to create product');
    }
  }

  async findAll(query: QueryProductDto) {
    const { search, category, isActive, lowStock, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (lowStock) {
      // Obtenemos los IDs de los productos con stock total <= minStock.
      // Utilizamos LEFT JOIN para incluir productos que no tienen registros en la tabla stocks (stock nulo/cero).
      const lowStockIds = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id
        FROM products p
        LEFT JOIN stocks s ON p.id = s.product_id
        WHERE p.min_stock > 0
        GROUP BY p.id, p.min_stock
        HAVING COALESCE(SUM(s.quantity), 0) <= p.min_stock
      `;
      const ids = lowStockIds.map((row) => row.id);
      where.id = { in: ids };
    }

    const [total, data] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { stocks: true },
    });
    
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    // Validamos la existencia antes de actualizar
    await this.findOne(id);

    // Validamos exclusividad de SKU si se está enviando en el payload
    if (updateProductDto.sku) {
      const existingProduct = await this.prisma.product.findUnique({
        where: { sku: updateProductDto.sku },
      });
      
      if (existingProduct && existingProduct.id !== id) {
        throw new ConflictException('SKU already exists');
      }
    }

    try {
      return await this.prisma.product.update({
        where: { id },
        data: updateProductDto,
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to update product');
    }
  }

  async deactivate(id: string) {
    // Validamos existencia y lanzamos NotFoundException si no existe
    await this.findOne(id);

    try {
      return await this.prisma.product.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to deactivate product');
    }
  }
}
