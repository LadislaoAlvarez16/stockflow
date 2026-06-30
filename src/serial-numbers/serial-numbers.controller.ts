import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Controller()
export class SerialNumbersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('serial-numbers/:serialNumber/history')
  async getHistory(@Param('serialNumber') serialNumber: string) {
    const serial = await this.prisma.serialNumber.findFirst({
      where: { serialNumber },
      include: {
        product: true,
        batch: true,
        warehouse: true,
      },
    });

    if (!serial) {
      throw new NotFoundException(`Serial number ${serialNumber} not found`);
    }

    return serial;
  }

  @Get('products/:productId/serial-numbers')
  async getProductSerials(
    @Param('productId') productId: string,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('batchId') batchId?: string,
  ) {
    const where: any = { productId };
    if (status) where.status = status;
    if (warehouseId) where.warehouseId = warehouseId;
    if (batchId) where.batchId = batchId;

    return this.prisma.serialNumber.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
