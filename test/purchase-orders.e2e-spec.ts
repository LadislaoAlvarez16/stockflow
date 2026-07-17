import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { v4 as uuidv4 } from 'uuid';

describe('PurchaseOrders (e2e) - Smoke Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test Data
  let adminUserId: string;
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
    }).compile();

    app = moduleFixture.createNestApplication();
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
    adminUserId = user.id;

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
    // Assuming we can get a token:
    const authService = moduleFixture.get('AuthService');
    if (authService) {
      const tokens = await authService.generateTokens(user);
      adminToken = tokens.accessToken;
    }
  });

  afterAll(async () => {
    // Cleanup if necessary, or let DB isolate
    await app.close();
  });

  it('Step 2: POST /purchase-orders creates a DRAFT order', async () => {
    const response = await request(app.getHttpServer())
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

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('DRAFT');
    expect(response.body.items).toHaveLength(3);

    purchaseOrderId = response.body.id;
  });

  it('Step 3: PATCH /purchase-orders/:id/send transitions to SENT', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/purchase-orders/${purchaseOrderId}/send`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('SENT');
  });

  it('Step 4: PATCH /purchase-orders/:id/receive (partial)', async () => {
    const response = await request(app.getHttpServer())
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

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('PARTIAL');
  });

  it('Step 5: GET /stock verifies automatic INBOUND', async () => {
    // Wait for the async stock movements to finish (they are done sequentially in the service, so they should be done)
    const stock1 = await request(app.getHttpServer())
      .get(`/stock/${product1Id}/${warehouseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const stock2 = await request(app.getHttpServer())
      .get(`/stock/${product2Id}/${warehouseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(stock1.status).toBe(200);
    expect(parseFloat(stock1.body.quantity)).toBe(10); // 10 received

    expect(stock2.status).toBe(200);
    expect(parseFloat(stock2.body.quantity)).toBe(5); // 5 received
  });

  it('Step 6: PATCH /purchase-orders/:id/receive (completion)', async () => {
    const response = await request(app.getHttpServer())
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

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('RECEIVED');
  });
});
