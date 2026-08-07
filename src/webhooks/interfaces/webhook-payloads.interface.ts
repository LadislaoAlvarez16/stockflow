import { WebhookEventType } from '@prisma/client';

export interface StockLowPayload {
  alertId: string;
  productId: string;
  warehouseId: string;
  currentQuantity: number;
  minStock: number;
  message: string;
  type: string;
}

export interface StockOutPayload {
  alertId: string;
  productId: string;
  warehouseId: string;
  currentQuantity: number;
  minStock: number;
  message: string;
  type: string;
}

export interface BatchExpiringPayload {
  batchId: string;
  batchNumber: string;
  productId: string;
  expiryDate: Date | string;
  totalQuantity: number;
  locations: Array<{ warehouseId: string; quantity: number }>;
}

export interface InventoryReconciledPayload {
  sessionId: string;
  warehouseId: string;
  status: string;
  matchedItems: number;
  adjustedItems: number;
  skippedItems: number;
  errors: number;
}

export interface PurchaseOrderReceivedPayload {
  purchaseOrderId: string;
  supplierId: string;
  warehouseId: string;
}

export interface MovementCreatedPayload {
  movementId: string;
  type: string;
  quantity: number;
  productId: string;
  warehouseId: string;
  batchId?: string | null;
  transactionId?: string | null;
}

export interface WebhookPayloadMap {
  [WebhookEventType.stock_low]: StockLowPayload;
  [WebhookEventType.stock_out]: StockOutPayload;
  [WebhookEventType.batch_expiring]: BatchExpiringPayload;
  [WebhookEventType.inventory_reconciled]: InventoryReconciledPayload;
  [WebhookEventType.purchase_order_received]: PurchaseOrderReceivedPayload;
  [WebhookEventType.movement_created]: MovementCreatedPayload;
}
