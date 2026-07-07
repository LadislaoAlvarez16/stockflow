import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';
import { WebhookEncryptionService } from './webhook-encryption.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhooksWorker } from './webhooks.worker';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhooks',
    }),
  ],
  controllers: [WebhooksController],
  providers: [
    WebhookSubscriptionsService,
    WebhookEncryptionService,
    WebhookDispatcherService,
    WebhooksWorker,
  ],
  exports: [
    WebhookSubscriptionsService,
    WebhookEncryptionService,
    WebhookDispatcherService,
  ],
})
export class WebhooksModule {}
