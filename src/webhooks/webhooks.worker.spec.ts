import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksWorker } from './webhooks.worker';
import { WebhookEncryptionService } from './webhook-encryption.service';
import { PrismaService } from '../common/prisma.service';
import { Job } from 'bullmq';
import { WebhookJobPayload } from './interfaces/webhook-job.interface';
import { WebhookEventType } from '@prisma/client';
import axios from 'axios';
import * as crypto from 'crypto';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhooksWorker', () => {
  let worker: WebhooksWorker;
  let encryptionService: jest.Mocked<WebhookEncryptionService>;
  let prismaService: jest.Mocked<PrismaService>;

  const mockEncryptionService = {
    decrypt: jest.fn(),
  };

  const mockPrismaService = {
    webhookDelivery: { create: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksWorker,
        { provide: WebhookEncryptionService, useValue: mockEncryptionService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    worker = module.get<WebhooksWorker>(WebhooksWorker);
    encryptionService = module.get(WebhookEncryptionService);
    prismaService = module.get(PrismaService);

    jest.clearAllMocks();
  });

  const createJob = (): Job<WebhookJobPayload> => {
    return {
      id: 'job-id-123',
      attemptsMade: 0,
      data: {
        subscriptionId: 'sub-1',
        url: 'https://example.com/webhook',
        encryptedSecret: 'encrypted-secret-abc',
        event: WebhookEventType.stock_low,
        payload: { some: 'data' },
      },
    } as unknown as Job<WebhookJobPayload>;
  };

  describe('process', () => {
    it('1. Entrega exitosa (axios responde 200) → decrypt() y axios.post() llamados, loguea 200', async () => {
      const job = createJob();
      mockEncryptionService.decrypt.mockReturnValue('plain-secret');
      mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });

      await expect(worker.process(job)).resolves.toBeUndefined();

      expect(encryptionService.decrypt).toHaveBeenCalledWith('encrypted-secret-abc');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        JSON.stringify({ some: 'data' }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-StockFlow-Signature': expect.any(String),
            'X-StockFlow-Event': WebhookEventType.stock_low,
            'X-StockFlow-Delivery': 'job-id-123',
            'X-StockFlow-Timestamp': expect.any(String),
          }),
        }),
      );
      expect(prismaService.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusCode: 200,
          }),
        }),
      );
    });

    it('2. Endpoint externo responde 500 → prisma llamado con 500 y relanza el error', async () => {
      const job = createJob();
      mockEncryptionService.decrypt.mockReturnValue('plain-secret');
      const error500 = new Error('Server Error');
      (error500 as any).response = { status: 500, data: 'Internal Error' };
      mockedAxios.post.mockRejectedValue(error500);

      await expect(worker.process(job)).rejects.toThrow('Server Error');

      expect(prismaService.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusCode: 500,
          }),
        }),
      );
    });

    it('3. axios lanza timeout / network error → statusCode null y relanza error', async () => {
      const job = createJob();
      mockEncryptionService.decrypt.mockReturnValue('plain-secret');
      const networkError = new Error('Network Timeout');
      mockedAxios.post.mockRejectedValue(networkError);

      await expect(worker.process(job)).rejects.toThrow('Network Timeout');

      expect(prismaService.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusCode: null,
          }),
        }),
      );
    });

    it('4. decrypt() lanza error (secret corrupto) → axios NO es llamado y relanza error', async () => {
      const job = createJob();
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Corrupt secret');
      });

      await expect(worker.process(job)).rejects.toThrow('Corrupt secret');

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('5. Verificar que la firma HMAC-SHA256 es correcta', async () => {
      const job = createJob();
      const secret = 'test-secret';
      mockEncryptionService.decrypt.mockReturnValue(secret);
      mockedAxios.post.mockResolvedValue({ status: 200 });

      await worker.process(job);

      const expectedHmac = crypto.createHmac('sha256', secret);
      expectedHmac.update(JSON.stringify(job.data.payload));
      const expectedSignature = expectedHmac.digest('hex');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-StockFlow-Signature': `sha256=${expectedSignature}`,
          }),
        }),
      );
    });

    it('6. logDelivery falla → no se propaga el error de logging al proceso principal', async () => {
      const job = createJob();
      mockEncryptionService.decrypt.mockReturnValue('plain-secret');
      mockedAxios.post.mockResolvedValue({ status: 200 });
      mockPrismaService.webhookDelivery.create.mockRejectedValue(new Error('DB connection failed'));

      // Debería resolver sin arrojar error a pesar de que el Prisma lanzó uno
      await expect(worker.process(job)).resolves.toBeUndefined();
    });
  });
});
