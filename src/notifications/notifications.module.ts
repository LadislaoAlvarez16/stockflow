import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { NotificationsWorker } from './workers/notifications.worker';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'notifications',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
  ],
  providers: [MailService, NotificationsWorker],
  exports: [BullModule, MailService],
})
export class NotificationsModule {}
