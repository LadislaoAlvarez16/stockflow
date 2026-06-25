import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { getQueueToken } from '@nestjs/bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import * as basicAuth from 'express-basic-auth';
import { Queue } from 'bullmq';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl || '*',
  });

  app.useGlobalFilters(new PrismaExceptionFilter());

  // Fail fast: Verify Bull Board credentials
  const bullUser = process.env.BULL_BOARD_USER;
  const bullPassword = process.env.BULL_BOARD_PASSWORD;

  if (!bullUser || !bullPassword) {
    throw new Error('FATAL ERROR: BULL_BOARD_USER and BULL_BOARD_PASSWORD must be defined in environment variables.');
  }

  // Bull Board Setup
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const alertsQueue = app.get<Queue>(getQueueToken('alerts'));
  const notificationsQueue = app.get<Queue>(getQueueToken('notifications'));

  createBullBoard({
    queues: [
      new BullMQAdapter(alertsQueue),
      new BullMQAdapter(notificationsQueue),
    ],
    serverAdapter,
  });

  app.use(
    '/admin/queues',
    basicAuth({
      users: {
        [bullUser]: bullPassword,
      },
      challenge: true,
      realm: 'Bull Board Admin Area',
    }),
    serverAdapter.getRouter()
  );
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
