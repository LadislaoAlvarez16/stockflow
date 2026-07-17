import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('alerts') private readonly alertsQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Verifica el estado del sistema (API, BD, Redis)' })
  async check() {
    const health = {
      api: 'up',
      database: 'down',
      redis: 'down',
      timestamp: new Date().toISOString(),
    };

    let isHealthy = true;

    // Check Database (Prisma)
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      health.database = 'up';
    } catch (e) {
      isHealthy = false;
    }

    // Check Redis (via BullMQ client)
    try {
      const client = await this.alertsQueue.client;
      await client.ping();
      health.redis = 'up';
    } catch (e) {
      isHealthy = false;
    }

    if (!isHealthy) {
      throw new ServiceUnavailableException(health);
    }

    return health;
  }
}
