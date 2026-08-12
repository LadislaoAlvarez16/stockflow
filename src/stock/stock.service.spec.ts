import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { PrismaService } from '../common/prisma.service';
import { SerialNumbersService } from '../serial-numbers/serial-numbers.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { getQueueToken } from '@nestjs/bullmq';
import { MovementType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('StockService', () => {
  let service: StockService;
  interface MockPrisma {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    product: { findUnique: jest.Mock };
    stockMovement: { create: jest.Mock };
    stock: { upsert: jest.Mock };
    batchStock: { upsert: jest.Mock };
  }

  const mockPrismaService: MockPrisma = {
    $transaction: jest.fn(async (callback) => {
      return callback(mockPrismaService);
    }),
    $queryRaw: jest.fn(),
    product: {
      findUnique: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(),
    },
    stock: {
      upsert: jest.fn(),
    },
    batchStock: {
      upsert: jest.fn(),
    },
  };

  const mockQueue = {
    add: jest.fn(),
  };

  const mockSerialNumbersService = {
    registerInbound: jest.fn(),
    registerOutbound: jest.fn(),
    transferSerials: jest.fn(),
  };

  const mockWebhookDispatcher = {
    dispatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SerialNumbersService, useValue: mockSerialNumbersService },
        { provide: WebhookDispatcherService, useValue: mockWebhookDispatcher },
        { provide: getQueueToken('alerts'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<StockService>(StockService);

    jest.clearAllMocks();
  });

  describe('createMovement', () => {
    it('debe registrar un ingreso exitoso (INBOUND)', async () => {
      // $queryRaw retorna unknown[] por diseño — el cast es inevitable en tests
      mockPrismaService.$queryRaw.mockResolvedValueOnce([{ quantity: 10 }]); // stockLock
      mockPrismaService.stockMovement.create.mockResolvedValueOnce({
        id: 'mov-1',
        type: MovementType.INBOUND,
        quantity: 5,
        productId: 'prod-1',
        warehouseId: 'wh-1',
      });
      mockPrismaService.stock.upsert.mockResolvedValueOnce({ quantity: 15 });
      mockPrismaService.product.findUnique.mockResolvedValueOnce({
        minStock: 5,
      });

      const dto = {
        productId: 'prod-1',
        warehouseId: 'wh-1',
        type: MovementType.INBOUND,
        quantity: 5,
        reference: 'REF-001',
      };
      const userId = 'user-1';

      const result = await service.createMovement(dto, userId);

      expect(result.stockAfter).toBe(15);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.stockMovement.create).toHaveBeenCalled();
      expect(mockWebhookDispatcher.dispatch).toHaveBeenCalled();
    });

    it('debe registrar un egreso exitoso (OUTBOUND)', async () => {
      // $queryRaw retorna unknown[] por diseño — el cast es inevitable en tests
      mockPrismaService.$queryRaw.mockResolvedValueOnce([{ quantity: 20 }]); // stockLock
      mockPrismaService.stockMovement.create.mockResolvedValueOnce({
        id: 'mov-2',
        type: MovementType.OUTBOUND,
        quantity: 5,
        productId: 'prod-1',
        warehouseId: 'wh-1',
      });
      mockPrismaService.stock.upsert.mockResolvedValueOnce({ quantity: 15 });
      mockPrismaService.product.findUnique.mockResolvedValueOnce({
        minStock: 5,
      });

      const dto = {
        productId: 'prod-1',
        warehouseId: 'wh-1',
        type: MovementType.OUTBOUND,
        quantity: 5,
        reference: 'REF-002',
      };
      const userId = 'user-1';

      const result = await service.createMovement(dto, userId);

      expect(result.stockAfter).toBe(15);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-low-stock',
        expect.any(Object),
      );
    });

    it('debe lanzar BadRequestException si el stock es insuficiente en egreso', async () => {
      // $queryRaw retorna unknown[] por diseño — el cast es inevitable en tests
      mockPrismaService.$queryRaw.mockResolvedValueOnce([{ quantity: 2 }]); // stockLock actual = 2

      const dto = {
        productId: 'prod-1',
        warehouseId: 'wh-1',
        type: MovementType.OUTBOUND,
        quantity: 5,
        reference: 'REF-FAIL',
      };

      await expect(service.createMovement(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si la cantidad es negativa o cero', async () => {
      const dto = {
        productId: 'prod-1',
        warehouseId: 'wh-1',
        type: MovementType.INBOUND,
        quantity: -5,
        reference: 'REF-FAIL',
      };

      await expect(service.createMovement(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe simular rollback en la transacción si ocurre un error interno (Prisma error)', async () => {
      // $queryRaw retorna unknown[] por diseño — el cast es inevitable en tests
      mockPrismaService.$queryRaw.mockRejectedValueOnce(
        new Error('DB Connection lost'),
      );

      const dto = {
        productId: 'prod-1',
        warehouseId: 'wh-1',
        type: MovementType.INBOUND,
        quantity: 10,
        reference: 'REF-FAIL',
      };

      await expect(service.createMovement(dto, 'user-1')).rejects.toThrow(
        'Failed to process stock movement',
      );
    });
  });

  describe('createTransfer', () => {
    it('debe fallar si origen y destino son el mismo depósito', async () => {
      const dto = {
        productId: 'prod-1',
        fromWarehouseId: 'wh-1',
        toWarehouseId: 'wh-1',
        quantity: 5,
        reference: 'TR-1',
      };

      await expect(service.createTransfer(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe ejecutar la transferencia exitosamente', async () => {
      // $queryRaw retorna unknown[] por diseño — el cast es inevitable en tests
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ quantity: 50 }]) // Lock origin/destination
        .mockResolvedValueOnce([{ quantity: 50 }]) // Lock origin/destination

        // Mocks para executeMovementLogic OUTBOUND (origin)
        .mockResolvedValueOnce([{ quantity: 50 }])
        // Mocks para executeMovementLogic INBOUND (dest)
        .mockResolvedValueOnce([{ quantity: 50 }]);

      mockPrismaService.stockMovement.create.mockResolvedValue({
        id: 'mov-id',
        type: MovementType.OUTBOUND,
      });
      mockPrismaService.stock.upsert.mockResolvedValue({ quantity: 45 });
      mockPrismaService.product.findUnique.mockResolvedValue({ minStock: 10 });

      const dto = {
        productId: 'prod-1',
        fromWarehouseId: 'wh-1',
        toWarehouseId: 'wh-2',
        quantity: 5,
        reference: 'TR-OK',
      };

      const result = await service.createTransfer(dto, 'user-1');
      expect(result.status).toBe('SUCCESS');
      expect(mockWebhookDispatcher.dispatch).toHaveBeenCalled();
    });
  });
});
