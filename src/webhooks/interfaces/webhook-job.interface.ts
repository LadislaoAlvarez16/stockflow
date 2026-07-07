import { WebhookEventType } from '@prisma/client';

export interface WebhookJobPayload {
  subscriptionId: string;
  url: string;
  encryptedSecret: string;
  event: WebhookEventType;
  payload: any;
}
