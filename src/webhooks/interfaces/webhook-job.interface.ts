import { WebhookEventType } from '@prisma/client';
import { WebhookPayloadMap } from './webhook-payloads.interface';

export interface WebhookJobPayload<E extends WebhookEventType = WebhookEventType> {
  subscriptionId: string;
  url: string;
  encryptedSecret: string;
  event: E;
  payload: WebhookPayloadMap[E];
}
