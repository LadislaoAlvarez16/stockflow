import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../common/prisma.service';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'alerts',
    }),
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class HealthModule {}
