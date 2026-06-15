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
        const redisUrl = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
        
        return {
          connection: {
            url: redisUrl,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
