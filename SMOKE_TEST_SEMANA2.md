# Smoke Test E2E - Semana 2 (Colas y Notificaciones)

Sigue estos pasos rigurosamente tras levantar tus contenedores con `docker-compose up -d`, ejecutar las migraciones pendientes con `npx prisma migrate dev` e iniciar el servidor NestJS con `npm run start:dev`.

## Requisitos Previos
1. Autenticarte en el endpoint de login y obtener un `access_token` válido para el rol **ADMIN**.
2. Identificar el `id` de un producto (`$PRODUCT_ID`) y un depósito (`$WAREHOUSE_ID`) en la base de datos que actualmente tengan stock por encima del `min_stock`.
3. Navegar a [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues) e ingresar con las credenciales seteadas en tu `.env` (ej: admin / admin_password123).

---

## Ejecución del Test

### Hito 1: Gatillar el sistema mediante un movimiento
Ejecutar un movimiento `OUTBOUND` que rompa hacia abajo la barrera de `min_stock` del producto.

**Request:**
```bash
curl -X POST http://localhost:3000/stock/movements \
-H "Authorization: Bearer <TU_TOKEN>" \
-H "Content-Type: application/json" \
-d '{
  "productId": "<PRODUCT_ID>",
  "warehouseId": "<WAREHOUSE_ID>",
  "type": "OUTBOUND",
  "quantity": 100,
  "reference": "TEST-SMOKE-01"
}'
```

### Hito 2: Observabilidad Bull Board
1. Ve al panel de Bull Board (http://localhost:3000/admin/queues).
2. Entra a la cola `alerts` y luego a `notifications`.
3. Verás que el job `check-low-stock` se procesó y luego saltó el job `send-email`.

### Hito 3: Auditoría por API de Alertas
Asegúrate de que la alerta haya quedado insertada permanentemente en la base de datos con status `ACTIVE`.

**Request:**
```bash
curl -X GET "http://localhost:3000/alerts?productId=<PRODUCT_ID>&warehouseId=<WAREHOUSE_ID>" \
-H "Authorization: Bearer <TU_TOKEN>"
```

### Hito 4: Verificación SMTP (Email)
Revisa tu inbox local de Nodemailer/Mailtrap. Deberías tener un correo con asunto "Alerta de Stock Crítico - Producto <PRODUCT_ID>" y renderizado en HTML puro.

### Hito 5: Deduplicación Sincrónica
Repite **exactamente el mismo POST del Hito 1**.
- Resultado esperado en BD: Se descuenta el stock.
- Resultado esperado en Alertas/Bull Board: **No se debe crear ninguna alerta nueva**. El sistema reconoce que ya existe una alerta activa para ese par Producto-Depósito y aborta el push a la cola.

### Hito 6: Deduplicación Reactiva (Cron Fallback)
Simula que el cron que corre cada 6 horas se dispara.

**Request:**
```bash
curl -X POST http://localhost:3000/debug/cron/check-stock-alerts \
-H "Authorization: Bearer <TU_TOKEN>"
```
- Ve al panel de Bull Board (`alerts` queue).
- Verás que **no se duplican** los jobs gracias a la clave determinística `low-stock-<PRODUCT_ID>-<WAREHOUSE_ID>`.

### Hito 7: Resolución Orgánica
Ejecuta un movimiento `ADJUSTMENT` o `INBOUND` devolviendo el stock por encima de su `min_stock`.

**Request:**
```bash
curl -X POST http://localhost:3000/stock/movements \
-H "Authorization: Bearer <TU_TOKEN>" \
-H "Content-Type: application/json" \
-d '{
  "productId": "<PRODUCT_ID>",
  "warehouseId": "<WAREHOUSE_ID>",
  "type": "ADJUSTMENT",
  "quantity": 200,
  "reference": "TEST-SMOKE-RECOVERY"
}'
```

### Hito 8: Auto-Limpieza (Cron Stale Alerts)
Simula el cron de las 3:00 AM para limpiar las bases de datos.

**Request:**
```bash
curl -X POST http://localhost:3000/debug/cron/resolve-stale-alerts \
-H "Authorization: Bearer <TU_TOKEN>"
```
- Repite el `GET` del **Hito 3**. El estado de tu alerta debería haber mutado a `RESOLVED` con un `resolvedAt` presente.

### Hito 9: Reporte Diario
Simula el cierre del día.

**Request:**
```bash
curl -X POST http://localhost:3000/debug/cron/daily-report \
-H "Authorization: Bearer <TU_TOKEN>"
```
- Revisa Bull Board (`notifications`). Se encoló el job `send-email`.
- Revisa tu inbox en Mailtrap: Verás un correo completo detallando las estadísticas de movimientos y productos, calculadas desde Prisma `_count`.
