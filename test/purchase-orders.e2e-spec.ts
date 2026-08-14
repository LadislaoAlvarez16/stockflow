import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'http';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';

jest.mock('../src/reports/pdf.service', () => ({
  PdfService: jest.fn().mockImplementation(() => ({
    generateFromHtml: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
  })),
}));

describe('PurchaseOrders (e2e) - Smoke Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test Data
  let adminToken: string = 'mock-admin-token'; // We can mock the auth guard or inject a real user

  let supplierId: string;
  let warehouseId: string;
  let product1Id: string;
  let product2Id: string;
  let product3Id: string;
  let purchaseOrderId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Logger)
      .useValue({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(false);
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Step 1: Create master data
    // Create Admin User
    const user = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@test.com`,
        passwordHash: 'hashed',
        role: 'ADMIN',
      },
    });

    // Create Supplier
    const supplier = await prisma.supplier.create({
      data: {
        name: 'E2E Supplier',
        taxId: `CUIT-${Date.now()}`,
      },
    });
    supplierId = supplier.id;

    // Create Warehouse
    const warehouse = await prisma.warehouse.create({
      data: {
        name: 'E2E Warehouse',
        code: `WH-${Date.now()}`,
        location: 'Test Location',
      },
    });
    warehouseId = warehouse.id;

    // Create Products
    const p1 = await prisma.product.create({
      data: {
        sku: `SKU-1-${Date.now()}`,
        name: 'P1',
        category: 'TEST',
        costPrice: 10,
      },
    });
    const p2 = await prisma.product.create({
      data: {
        sku: `SKU-2-${Date.now()}`,
        name: 'P2',
        category: 'TEST',
        costPrice: 20,
      },
    });
    const p3 = await prisma.product.create({
      data: {
        sku: `SKU-3-${Date.now()}`,
        name: 'P3',
        category: 'TEST',
        costPrice: 30,
      },
    });
    product1Id = p1.id;
    product2Id = p2.id;
    product3Id = p3.id;

    // Mocking AuthGuard is complex here since the project uses JwtAuthGuard globally.
    // Instead of complex mocking, let's bypass it by injecting the req.user directly in the controller if needed,
    // or generating a real token if AuthService is available.
    const jwtService = moduleFixture.get(JwtService);
    if (jwtService) {
      adminToken = jwtService.sign({
        email: user.email,
        sub: user.id,
        role: user.role,
      });
    }
  });

  afterAll(async () => {
    // Pausar las colas antes de cerrar la app para evitar leaks de Jest
    const alertsQueue = app.get<Queue>(getQueueToken('alerts'));
    const webhooksQueue = app.get<Queue>(getQueueToken('webhooks'));
    await alertsQueue.pause();
    await webhooksQueue.pause();
    await app.close();
  });

  it('Step 2: POST /purchase-orders creates a DRAFT order', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        warehouseId,
        items: [
          { productId: product1Id, quantity: 10, costPrice: 10 },
          { productId: product2Id, quantity: 10, costPrice: 20 },
          { productId: product3Id, quantity: 10, costPrice: 30 },
        ],
      });

    const body = response.body as { id: string; status: string; items: any[] };
    expect(response.status).toBe(201);
    expect(body.status).toBe('DRAFT');
    expect(body.items).toHaveLength(3);

    purchaseOrderId = body.id;
  });

  it('Step 3: PATCH /purchase-orders/:id/send transitions to SENT', async () => {
    const response = await request(app.getHttpServer() as Server)
      .patch(`/purchase-orders/${purchaseOrderId}/send`)
      .set('Authorization', `Bearer ${adminToken}`);

    const body = response.body as { status: string };
    expect(response.status).toBe(200);
    expect(body.status).toBe('SENT');
  });

  it('Step 4: PATCH /purchase-orders/:id/receive (partial)', async () => {
    const response = await request(app.getHttpServer() as Server)
      .patch(`/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        reference: `REC-${Date.now()}`,
        items: [
          { productId: product1Id, quantityReceived: 10 },
          { productId: product2Id, quantityReceived: 5 },
        ],
      });

    const body = response.body as { status: string };
    expect(response.status).toBe(200);
    expect(body.status).toBe('PARTIAL');
  });

  it('Step 5: GET /stock verifies automatic INBOUND', async () => {
    // Wait for the async stock movements to finish (they are done sequentially in the service, so they should be done)
    const stock1 = await request(app.getHttpServer() as Server)
      .get(`/stock/${product1Id}/${warehouseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const stock2 = await request(app.getHttpServer() as Server)
      .get(`/stock/${product2Id}/${warehouseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const body1 = stock1.body as { quantity: string | number };
    const body2 = stock2.body as { quantity: string | number };

    expect(stock1.status).toBe(200);
    expect(parseFloat(String(body1.quantity))).toBe(10); // 10 received

    expect(stock2.status).toBe(200);
    expect(parseFloat(String(body2.quantity))).toBe(5); // 5 received
  });

  it('Step 6: PATCH /purchase-orders/:id/receive (completion)', async () => {
    const response = await request(app.getHttpServer() as Server)
      .patch(`/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        reference: `REC-FINAL-${Date.now()}`,
        items: [
          { productId: product2Id, quantityReceived: 5 }, // the remaining 5
          { productId: product3Id, quantityReceived: 10 },
        ],
      });

    const body = response.body as { status: string };
    expect(response.status).toBe(200);
    expect(body.status).toBe('RECEIVED');
  });
});
