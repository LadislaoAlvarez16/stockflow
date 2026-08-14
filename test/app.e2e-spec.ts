import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';

jest.mock('../src/reports/pdf.service', () => ({
  PdfService: jest.fn().mockImplementation(() => ({
    generateFromHtml: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
  })),
}));

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Logger)
      .useValue({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    const alertsQueue = app.get<Queue>(getQueueToken('alerts'));
    const webhooksQueue = app.get<Queue>(getQueueToken('webhooks'));
    await alertsQueue.pause();
    await webhooksQueue.pause();
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
