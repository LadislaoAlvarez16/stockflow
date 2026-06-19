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

export const dailyReportTemplate = (data: {
  activeAlertsCount: number;
  recentMovementsCount: number;
  recentMovements: Array<{ id: string; type: string; quantity: number; productId: string }>;
}) => {
  const movementsHtml = data.recentMovements.length > 0
    ? data.recentMovements.map(m => `<li>${m.type} de ${m.quantity} unidad(es) (Prod: ${m.productId})</li>`).join('')
    : '<li>No hubo movimientos relevantes.</li>';

  return `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #2563eb;">📊 Reporte Diario de Stock</h2>
      <p>Este es el resumen de las operaciones de las últimas 24 horas.</p>
      
      <div style="margin-top: 20px; padding: 15px; border-left: 4px solid #d97706; background-color: #fef3c7;">
        <h3 style="margin: 0; color: #b45309;">Alertas Críticas Activas</h3>
        <p style="font-size: 18px; font-weight: bold; margin-top: 10px;">Total: ${data.activeAlertsCount}</p>
      </div>

      <div style="margin-top: 20px; padding: 15px; border-left: 4px solid #2563eb; background-color: #eff6ff;">
        <h3 style="margin: 0; color: #1d4ed8;">Actividad Reciente</h3>
        <p>Total de movimientos en las últimas 24hs: <strong>${data.recentMovementsCount}</strong></p>
        <h4>Últimos registros destacados:</h4>
        <ul>
          ${movementsHtml}
        </ul>
      </div>

      <p style="margin-top: 30px; font-size: 12px; color: #666;">Notificación generada automáticamente por StockFlow.</p>
    </div>
  `;
};
