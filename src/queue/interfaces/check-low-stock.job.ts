export interface CheckLowStockJob {
  productId: string;
  warehouseId: string;
  currentQuantity: number;
  minStock: number;
}
