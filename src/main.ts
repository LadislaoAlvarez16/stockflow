import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { getQueueToken } from '@nestjs/bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import * as basicAuth from 'express-basic-auth';
import { Queue } from 'bullmq';

import { assertRequiredEnv } from './config/assert-env';

async function bootstrap() {
  assertRequiredEnv();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const frontendUrl = process.env.FRONTEND_URL;
  let origin: string | string[] = '*';

  if (frontendUrl) {
    const urls = frontendUrl.split(',').map((u) => u.trim().replace(/\/$/, ''));
    origin = urls.length === 1 ? urls[0] : urls;
  } else if (process.env.NODE_ENV?.trim().toLowerCase() === 'production') {
    origin = []; // Block all origins if not defined in production (though assertRequiredEnv should have caught this)
  }

  app.enableCors({
    origin,
  });

  const { ValidationPipe } = require('@nestjs/common');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());

  const bullEnabled = process.env.BULL_BOARD_ENABLED === 'true';

  if (bullEnabled) {
    // Fail fast: Verify Bull Board credentials
    const bullUser = process.env.BULL_BOARD_USER;
    const bullPassword = process.env.BULL_BOARD_PASSWORD;

    if (!bullUser || !bullPassword) {
      throw new Error(
        'FATAL ERROR: BULL_BOARD_USER and BULL_BOARD_PASSWORD must be defined in environment variables when BULL_BOARD_ENABLED is true.',
      );
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
      serverAdapter.getRouter(),
    );
  }

  const isProduction =
    process.env.NODE_ENV?.trim().toLowerCase() === 'production';

  if (!isProduction) {
    const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('StockFlow API')
      .setDescription(
        'Documentación de la API de StockFlow para gestión de inventarios y trazabilidad',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
