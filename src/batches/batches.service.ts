import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
        throw new BadRequestException(
          'Manufacturing date must be before expiry date',
        );
      }
    }

    try {
      const batch = await this.prisma.batch.create({
        data: {
          batchNumber: dto.batchNumber,
          productId: dto.productId,
          supplierId: dto.supplierId,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          manufacturingDate: dto.manufacturingDate
            ? new Date(dto.manufacturingDate)
            : null,
          initialQuantity: dto.initialQuantity,
          notes: dto.notes,
          createdById: userId,
        },
      });
      return batch;
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Batch number already exists for this product',
          );
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
      const totalStock = batch.batchStocks.reduce(
        (sum, stock) => sum + Number(stock.quantity),
        0,
      );
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

    const totalStock = batch.batchStocks.reduce(
      (sum, stock) => sum + Number(stock.quantity),
      0,
    );
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
      const totalStock = batch.batchStocks.reduce(
        (sum, stock) => sum + Number(stock.quantity),
        0,
      );
      return {
        ...batch,
        totalStock,
      };
    });
  }

  async suggestBatchForOutbound(
    productId: string,
    warehouseId: string,
    quantity: number,
  ) {
    const batchStock = await this.prisma.batchStock.findFirst({
      where: {
        warehouseId,
        quantity: { gte: quantity },
        batch: { productId },
      },
      orderBy: {
        batch: { expiryDate: { sort: 'asc', nulls: 'last' } },
      },
      include: {
        batch: true,
      },
    });

    if (!batchStock) {
      return null;
    }

    return batchStock.batch;
  }
  async getExpiringBatches(daysThreshold: number = 30) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    const expiringBatchStocks = await this.prisma.batchStock.findMany({
      where: {
        quantity: { gt: 0 },
        batch: {
          expiryDate: { lte: thresholdDate },
        },
      },
      include: {
        batch: {
          include: { product: { select: { id: true, name: true } } },
        },
        warehouse: { select: { id: true, name: true } },
      },
    });

    // Agrupar en memoria por batch
    const grouped = new Map<string, any>();

    for (const bs of expiringBatchStocks) {
      if (!grouped.has(bs.batchId)) {
        grouped.set(bs.batchId, {
          batch: {
            id: bs.batch.id,
            batchNumber: bs.batch.batchNumber,
            expiryDate: bs.batch.expiryDate,
            product: bs.batch.product,
          },
          totalQuantity: 0,
          locations: [],
        });
      }

      const group = grouped.get(bs.batchId);
      const qty = Number(bs.quantity);
      group.totalQuantity += qty;
      group.locations.push({
        warehouseId: bs.warehouseId,
        name: bs.warehouse.name,
        quantity: qty,
      });
    }

    return Array.from(grouped.values());
  }

  async getMovements(batchId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { batchId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockMovement.count({ where: { batchId } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSerialNumbers(
    batchId: string,
    page: number = 1,
    limit: number = 100,
    status?: any,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { batchId };

    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.serialNumber.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.serialNumber.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
