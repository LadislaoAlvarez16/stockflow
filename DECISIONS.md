# Technical Decisions (ADR)

## 011 - Notificaciones, Colas y Seguridad (Semana 2)
**Fecha:** 2026-06-19
**Contexto:** Necesitábamos dotar al sistema de comunicación asíncrona hacia el exterior (email), asegurar las colas ante caídas silenciosas o race-conditions, y proveer una interfaz de administración temporal de forma segura.

**Decisiones:**
1. **Nodemailer vs API Transaccional Externa:**
   - Se eligió `Nodemailer` en conjunto con credenciales puramente controladas por el `.env` (ej: Mailtrap para dev local) para mantener agilidad y desacoplamiento. Si a futuro se escala a Sendgrid/AWS SES, solo cambian las credenciales SMTP, sin refactorizar lógica en Node.

2. **Deduplicación Nativa de BullMQ:**
   - En el cron reactivo (`checkStockAlerts`), en lugar de llevar la cuenta en memoria o consultar constantemente la DB para ver si ya mandamos un job, se delegó al `jobId` determinístico (`low-stock-${productId}-${warehouseId}`). BullMQ ignora el push si un job con la misma ID ya está pendiente o procesándose. Evita contención de colas.

3. **Bull Board y Basic Auth:**
   - Para no ensuciar el guard global o los decoradores nativos de NestJS con rutas estáticas del panel, inyectamos el `ExpressAdapter` junto a `express-basic-auth`.
   - Se aplicó una estrategia de *"Fail Fast"*: Si `BULL_BOARD_USER` o `BULL_BOARD_PASSWORD` no están explícitamente seteados, la aplicación entera hace `throw new Error()` en el bootstrap. Esto garantiza que es materialmente imposible pushear el panel a producción por accidente sin estar fuertemente bloqueado.

## 012 - Motor de Stock Extendido con Trazabilidad de Lote (Fase 3)
**Fecha:** 2026-06-27
**Contexto:** Necesidad de extender el motor de stock existente para soportar trazabilidad por Lote (`batchId`), manteniendo la retrocompatibilidad con los movimientos sin lote.
**Decisiones:**
1. **Aditividad y Compatibilidad:**
   - La columna `batchId` en `stock_movements` se definió como `nullable`. El sistema soporta operaciones atómicas híbridas: movimientos que afectan la proyección de inventario general (`stocks`) y opcionalmente una segunda proyección materializada de trazabilidad (`batch_stocks`).
2. **Prevención de Deadlocks (Strict Locking Hierarchy):**
   - Se extendió el bloqueo pesimista (`FOR UPDATE`) para asegurar primero la tabla general (`stocks`) y secuencialmente la tabla detallada (`batch_stocks`) en el mismo orden determinístico. Esto erradica el riesgo de deadlocks entre transacciones concurrentes.

## 013 - Trazabilidad Unitaria por Números de Serie (Fase 3)
**Fecha:** 2026-06-29
**Contexto:** Integración de la entidad `SerialNumber` para trazar unidades físicas específicas desde su entrada (Inbound) hasta su salida (Outbound) o transferencia (Transfer).
**Decisiones:**
1. **Delegación Transaccional (`Prisma.TransactionClient`):**
   - El servicio `SerialNumbersService` opera ciegamente bajo el cliente transaccional inyectado (`tx`). No inicializa sus propias transacciones para garantizar la atomicidad total: si un registro de serie falla, el movimiento de stock completo en `StockService` hace rollback.
2. **Fail-Fast de Integridad:**
   - Se inyectó una validación temprana en el `StockService` (`serialNumbers.length !== dto.quantity`). Esto aborta la operación antes de solicitar un solo Lock en base de datos, ahorrando recursos y latencia ante un Bad Request.

## 014 - Arquitectura Síncrona de Vencimientos y Trazabilidad (Fase 3)
**Fecha:** 2026-06-30
**Contexto:** Integración del seguimiento de vencimientos de lotes y trazabilidad bidireccional (Fase 3). Se contemplaba inicialmente el uso de CRON jobs (ej. `@nestjs/schedule`) para monitorear lotes próximos a vencer.

**Decisiones:**
1. **Delegación del Scheduler (Endpoint REST):**
   - **Restricción de Fase 1:** Queda prohibido instalar `@nestjs/schedule` o agregar procesos de fondo (CRON jobs) embebidos dentro del monolito para el cálculo de vencimientos. 
   - **Solución:** Se diseñó un motor de consulta puramente sincrónico y se expuso vía `GET /batches/expiring-soon`. De este modo, la carga computacional ocurre únicamente bajo demanda. A futuro (Fase 2), si se requiere lanzar notificaciones automáticas, un worker de sistema (por ej. una cola o lambda function externa) invocará este endpoint, preservando la inmutabilidad y estabilidad del backend transaccional.

2. **Querying y Agrupación en Memoria (Evitar raw queries):**
   - El motor de vencimientos escanea `batch_stocks` utilizando el ORM de Prisma nativamente para recuperar lotes cuya cantidad sea `> 0` y fecha de caducidad crítica, agrupando luego en memoria por almacén. Esto evita inyecciones de `$queryRaw` para queries de agregación complejas, manteniendo type-safety.

3. **Prevención de Route Collision:**
   - Al exponer los endpoints en `BatchesController`, la ruta estática `@Get('expiring-soon')` fue intencionalmente declarada por encima de las rutas paramétricas como `@Get(':id/movements')`. NestJS evalúa en orden descendente; omitir este detalle técnico desencadenaría un "Shadowing" e interpretaría "expiring-soon" como un UUID.

4. **Blindaje mediante Paginación Estricta:**
   - Todo endpoint de trazabilidad cruzada (`/batches/:id/movements`, `/batches/:id/serial-numbers`) está obligado estructuralmente a usar `take` y `skip`. Es un escudo de protección en producción para evitar Vectores de DoS derivados de una saturación masiva de la DB al listar el historial infinito de un lote físico.
