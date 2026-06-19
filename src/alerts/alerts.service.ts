import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AlertType, AlertStatus, Prisma } from '@prisma/client';
import { GetAlertsFilterDto } from './dto/get-alerts-filter.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: GetAlertsFilterDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.AlertWhereInput = {};

    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.productId) where.productId = filters.productId;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;

    const [data, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { sku: true, name: true } },
          warehouse: { select: { name: true } },
          resolvedBy: { select: { name: true, email: true } },
        },
      }),
      this.prisma.alert.count({ where }),
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
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        product: true,
        warehouse: true,
        resolvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${id} not found`);
    }

    return alert;
  }

  async acknowledge(id: string) {
    const alert = await this.findOne(id);

    if (alert.status === AlertStatus.RESOLVED) {
      throw new ConflictException('Cannot acknowledge a resolved alert');
    }

    if (alert.status === AlertStatus.ACKNOWLEDGED) {
      return alert;
    }

    return this.prisma.alert.update({
      where: { id },
      data: { status: AlertStatus.ACKNOWLEDGED },
    });
  }

  async resolve(id: string, userId: string) {
    const alert = await this.findOne(id);

    if (alert.status === AlertStatus.RESOLVED) {
      throw new ConflictException('Alert is already resolved');
    }

    return this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedById: userId,
      },
    });
  }

  async createIfNotDuplicate(data: {
    productId: string;
    warehouseId: string;
    type: AlertType;
    message: string;
  }) {
    const existing = await this.prisma.alert.findFirst({
      where: {
        productId: data.productId,
        warehouseId: data.warehouseId,
        type: data.type,
        status: AlertStatus.ACTIVE,
      },
    });

    if (existing) {
      return null;
    }

    return this.prisma.alert.create({
      data: {
        productId: data.productId,
        warehouseId: data.warehouseId,
        type: data.type,
        message: data.message,
        status: AlertStatus.ACTIVE,
      },
    });
  }
}
