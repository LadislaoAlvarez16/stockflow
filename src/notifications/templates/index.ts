export const lowStockTemplate = (data: {
  productId: string;
  warehouseId: string;
  currentQuantity: number;
  minStock: number;
}) => {
  return `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #d97706;">⚠️ Alerta de Stock Mínimo</h2>
      <p>El siguiente producto ha alcanzado su nivel de punto de reorden.</p>
      <ul>
        <li><strong>Producto ID:</strong> ${data.productId}</li>
        <li><strong>Depósito ID:</strong> ${data.warehouseId}</li>
        <li><strong>Stock Actual:</strong> ${data.currentQuantity}</li>
        <li><strong>Punto de Reorden:</strong> ${data.minStock}</li>
      </ul>
      <p>Por favor, gestione la reposición a la brevedad.</p>
    </div>
  `;
};

export const outOfStockTemplate = (data: {
  productId: string;
  warehouseId: string;
  currentQuantity: number;
  minStock: number;
}) => {
  return `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #dc2626;">🚨 Alerta de Quiebre de Stock</h2>
      <p>El siguiente producto se ha quedado sin stock disponible (0 unidades).</p>
      <ul>
        <li><strong>Producto ID:</strong> ${data.productId}</li>
        <li><strong>Depósito ID:</strong> ${data.warehouseId}</li>
        <li><strong>Punto de Reorden Configurado:</strong> ${data.minStock}</li>
      </ul>
      <p>Esto puede afectar las operaciones. Se requiere atención inmediata.</p>
    </div>
  `;
};

export const dailyReportTemplate = (data: any) => {
  return `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #2563eb;">📊 Reporte Diario de Stock</h2>
      <p>Este es un resumen de las operaciones del día (MOCK).</p>
      <p>Próximamente se incluirán las métricas reales de movimientos y transferencias.</p>
    </div>
  `;
};
