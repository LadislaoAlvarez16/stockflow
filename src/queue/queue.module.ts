import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Parse REDIS_URL to host/port (BullMQ typically prefers connection object or ioredis connection string)
        const redisUrl =
          configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

        const u = new URL(redisUrl);
        return {
          connection: {
            host: u.hostname,
            port: Number(u.port || 6379),
            username: u.username ? decodeURIComponent(u.username) : undefined,
            password: u.password ? decodeURIComponent(u.password) : undefined,
            db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
            ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
