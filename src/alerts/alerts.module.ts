import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsWorker } from './workers/alerts.worker';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    CommonModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: 'alerts',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsWorker],
  exports: [BullModule, AlertsService],
})
export class AlertsModule {}
