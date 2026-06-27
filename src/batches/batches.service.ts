import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { GetBatchesFiltersDto } from './dto/get-batches-filters.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class BatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBatchDto, userId: string) {
    if (dto.manufacturingDate && dto.expiryDate) {
      if (new Date(dto.manufacturingDate) >= new Date(dto.expiryDate)) {
        throw new BadRequestException('Manufacturing date must be before expiry date');
      }
    }

    try {
      const batch = await this.prisma.batch.create({
        data: {
          batchNumber: dto.batchNumber,
          productId: dto.productId,
          supplierId: dto.supplierId,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : null,
          initialQuantity: dto.initialQuantity,
          notes: dto.notes,
          createdById: userId,
        },
      });
      return batch;
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Batch number already exists for this product');
        }
      }
      throw error;
    }
  }

  async findAll(filters: GetBatchesFiltersDto) {
    const where: Prisma.BatchWhereInput = {};

    if (filters.productId) {
      where.productId = filters.productId;
    }

    if (filters.supplierId) {
      where.supplierId = filters.supplierId;
    }

    if (filters.expiresBeforeDate) {
      where.expiryDate = {
        lt: new Date(filters.expiresBeforeDate),
      };
    }

    const batches = await this.prisma.batch.findMany({
      where,
      include: {
        batchStocks: {
          include: {
            warehouse: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = batches.map((batch) => {
      const totalStock = batch.batchStocks.reduce((sum, stock) => sum + Number(stock.quantity), 0);
      return {
        ...batch,
        totalStock,
      };
    });

    if (filters.hasStock) {
      return result.filter((b) => b.totalStock > 0);
    }

    return result;
  }

  async findOne(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        batchStocks: {
          include: {
            warehouse: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const totalStock = batch.batchStocks.reduce((sum, stock) => sum + Number(stock.quantity), 0);
    return {
      ...batch,
      totalStock,
    };
  }

  async findByProduct(productId: string) {
    const batches = await this.prisma.batch.findMany({
      where: { productId },
      include: {
        batchStocks: {
          include: {
            warehouse: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: {
        expiryDate: { sort: 'asc', nulls: 'last' },
      },
    });

    return batches.map((batch) => {
      const totalStock = batch.batchStocks.reduce((sum, stock) => sum + Number(stock.quantity), 0);
      return {
        ...batch,
        totalStock,
      };
    });
  }

  async suggestBatchForOutbound(productId: string, warehouseId: string, quantity: number) {
    const batchStock = await this.prisma.batchStock.findFirst({
      where: {
        warehouseId,
        quantity: { gte: quantity },
        batch: { productId }
      },
      orderBy: {
        batch: { expiryDate: { sort: 'asc', nulls: 'last' } }
      },
      include: {
        batch: true
      }
    });

    if (!batchStock) {
      return null;
    }

    return batchStock.batch;
  }
}
