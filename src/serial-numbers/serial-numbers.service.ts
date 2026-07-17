import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Prisma } from '@prisma/client';

type TransactionClient = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class SerialNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  async registerInbound(
    tx: TransactionClient,
    serials: string[],
    movementId: string,
    productId: string,
    warehouseId: string,
    batchId?: string,
  ) {
    try {
      await tx.serialNumber.createMany({
        data: serials.map((serial) => ({
          serialNumber: serial,
          productId,
          warehouseId,
          batchId: batchId || null,
          inboundMovementId: movementId,
          status: 'available',
        })),
        skipDuplicates: false,
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'One or more serial numbers already exist for this product',
          );
        }
      }
      throw error;
    }
  }

  async registerOutbound(
    tx: TransactionClient,
    serials: string[],
    movementId: string,
    warehouseId: string,
    productId: string,
  ) {
    const existingSerials = await tx.serialNumber.findMany({
      where: {
        serialNumber: { in: serials },
        productId,
      },
    });

    if (existingSerials.length !== serials.length) {
      const foundSet = new Set(existingSerials.map((s) => s.serialNumber));
      const missing = serials.filter((s) => !foundSet.has(s));
      throw new BadRequestException(
        `Serial numbers not found: ${missing.join(', ')}`,
      );
    }

    const invalidStatuses = existingSerials.filter(
      (s) => s.status !== 'available',
    );
    if (invalidStatuses.length > 0) {
      throw new BadRequestException(
        `Serial numbers are not available: ${invalidStatuses.map((s) => s.serialNumber).join(', ')}`,
      );
    }

    const invalidWarehouses = existingSerials.filter(
      (s) => s.warehouseId !== warehouseId,
    );
    if (invalidWarehouses.length > 0) {
      throw new BadRequestException(
        `Serial numbers are not in warehouse ${warehouseId}: ${invalidWarehouses.map((s) => s.serialNumber).join(', ')}`,
      );
    }

    await tx.serialNumber.updateMany({
      where: {
        serialNumber: { in: serials },
        productId,
      },
      data: {
        status: 'consumed',
        outboundMovementId: movementId,
        warehouseId: null,
      },
    });
  }

  async transferSerials(
    tx: TransactionClient,
    serials: string[],
    fromWarehouseId: string,
    toWarehouseId: string,
    productId: string,
  ) {
    const existingSerials = await tx.serialNumber.findMany({
      where: {
        serialNumber: { in: serials },
        productId,
      },
    });

    if (existingSerials.length !== serials.length) {
      const foundSet = new Set(existingSerials.map((s) => s.serialNumber));
      const missing = serials.filter((s) => !foundSet.has(s));
      throw new BadRequestException(
        `Serial numbers not found: ${missing.join(', ')}`,
      );
    }

    const invalidStatuses = existingSerials.filter(
      (s) => s.status !== 'available',
    );
    if (invalidStatuses.length > 0) {
      throw new BadRequestException(
        `Serial numbers are not available: ${invalidStatuses.map((s) => s.serialNumber).join(', ')}`,
      );
    }

    const invalidWarehouses = existingSerials.filter(
      (s) => s.warehouseId !== fromWarehouseId,
    );
    if (invalidWarehouses.length > 0) {
      throw new BadRequestException(
        `Serial numbers are not in origin warehouse ${fromWarehouseId}: ${invalidWarehouses.map((s) => s.serialNumber).join(', ')}`,
      );
    }

    await tx.serialNumber.updateMany({
      where: {
        serialNumber: { in: serials },
        productId,
      },
      data: {
        warehouseId: toWarehouseId,
      },
    });
  }
}
