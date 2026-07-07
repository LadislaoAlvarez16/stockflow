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

   - Todo endpoint de trazabilidad cruzada (`/batches/:id/movements`, `/batches/:id/serial-numbers`) está obligado estructuralmente a usar `take` y `skip`. Es un escudo de protección en producción para evitar Vectores de DoS derivados de una saturación masiva de la DB al listar el historial infinito de un lote físico.

## 015 - Descarga de Reportes Protegidos y Manejo de Errores Binarios (Fase 3)
**Fecha:** 2026-07-06
**Contexto:** Los endpoints de descarga de PDFs (generados por Puppeteer) están protegidos por JWT. Utilizar un hipervínculo tradicional (`<a href="...">`) resultaría en un error `401 Unauthorized` al no poder inyectar el header de Autorización.

**Decisiones:**
1. **Descarga vía Axios y URL Efímera:**
   - La petición se realiza explícitamente a través del cliente HTTP inyectando el header `Authorization: Bearer <token>` y configurando la directiva `responseType: 'blob'`. 
   - El Blob recibido se convierte a una URL temporal en memoria del cliente (`window.URL.createObjectURL(blob)`) y se simula un click programático, forzando la descarga local.

2. **Liberación Estricta de Memoria:**
   - Se introdujo un `setTimeout` de 100ms antes de ejecutar `window.URL.revokeObjectURL(url)`. Esto otorga al navegador el margen necesario para asentar la descarga en background previniendo errores de puntero huérfano.

3. **Fallback JSON en Respuestas Fallidas:**
   - Forzar Axios a esperar un `blob` causa que respuestas de error como un JSON `400 BadRequest` (ej. si el filtro de fechas supera los 90 días) lleguen al cliente parseadas erróneamente como binarios. 
   - Se interceptan las respuestas fallidas que contengan un tipo `Blob` en el `error.response.data`. Mediante `await blob.text()` y `JSON.parse()`, se reconstituye el mensaje de la excepción nativa de NestJS y se re-inyecta en el objeto de error, garantizando que los Toast notifiquen con contexto preciso en lugar de un error de lectura de stream.

## 016 - Delegación Transversal de PDF y Separación de Responsabilidades (Fase 3)
**Fecha:** 2026-07-06
**Contexto:** Necesidad de exponer un comprobante PDF (Reporte 4) al finalizar una sesión de Inventario Físico. ¿El endpoint y lógica deben ir en `ReportsModule` o en `PhysicalInventoryModule`?

**Decisiones:**
1. **Semántica de Endpoints RESTful:**
   - Se ubicó el endpoint en `GET /physical-inventory/:id/report` dentro del `PhysicalInventoryController`. Esto preserva la semántica estricta y predecible de que un reporte atado a una entidad específica pertenezca a la ruta de esa entidad.

2. **Inyección de Módulos (Cross-Module Dependency):**
   - Toda la lógica del armado en HTML y renderizado de PDF reside estrictamente en el `ReportsService` (exportado globalmente por el `ReportsModule`). Esto centraliza el motor de reportes con Puppeteer, permitiendo que el módulo de Inventario Físico funcione como un mero orquestador/cliente, reduciendo duplicación de código y aislando dependencias.

## 017 - Criptografía Bidireccional (AES-256-GCM) para Secrets de Webhooks
**Fecha:** 2026-07-07
**Contexto:** Necesitamos almacenar secrets para firmar los payloads de los webhooks suscritos, con el objetivo de que el receptor verifique la autenticidad de la petición (HMAC).

**Decisiones:**
1. **No usar hashes unidireccionales (Bcrypt/Argon2):** A diferencia de las contraseñas, donde el sistema solo necesita verificar, el sistema (el worker futuro) necesita el secret en plano en memoria para firmar el payload antes de enviarlo. Un hash unidireccional haría imposible recuperar el secret.
2. **Uso de AES-256-GCM:** Se eligió un algoritmo de cifrado autenticado (AEAD) provisto nativamente por `crypto` de Node.js. Garantiza confidencialidad e integridad.
3. **Formato concatenado (`iv:encrypted:authTag`):** Se consolida toda la metadata en una sola cadena para almacenarla en el campo `encrypted_secret`. Mantiene el esquema agnóstico a las peculiaridades del algoritmo criptográfico.
4. **Fail Fast en el Bootstrap:** El módulo aserta la existencia y longitud de `WEBHOOK_ENCRYPTION_KEY` (exactamente 32 bytes) al instanciarse. Si no es válida, la app crashea de inmediato para prevenir estado corrupto o endpoints inoperantes.

## 018 - Despacho Asíncrono de Webhooks y Paginación por Cursor
**Fecha:** 2026-07-07
**Contexto:** Los eventos de dominio (como `movement.created` o `stock.low`) deben disparar webhooks a los clientes. Las entregas HTTP pueden fallar, bloquearse (timeout) o reintentarse. A su vez, se requiere un historial auditable infinito de las entregas (`webhook_deliveries`).

**Decisiones:**
1. **Despacho estrictamente Post-Transaccional (BR-21):** El `WebhookDispatcherService.dispatch` nunca se invoca dentro de un `prisma.$transaction()`. Si el webhook falla, el motor transaccional del ERP ya consolidó los datos de manera consistente.
2. **Workers en BullMQ con Backoff:** El retry y control de latencias (Axios) se delega completamente a un worker asíncrono. Los errores HTTP fuerzan un `throw` luego del log para que BullMQ gestione el backoff exponencial.
3. **Paginación obligatoria por Cursor (Keyset Pagination):** Dado que la tabla `webhook_deliveries` es un historial inmutable de alto crecimiento, se prohíbe `skip/take` tradicional por offset. El endpoint `GET /webhooks/:id/deliveries` requiere obligatoriamente paginación por cursor (`id`) para prevenir OOM y degradación en el DB Engine.
