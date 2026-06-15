import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
  ],
  exports: [BullModule],
})
export class NotificationsModule {}
