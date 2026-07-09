# StockFlow — Decisions

Registro de decisiones técnicas relevantes con su justificación.  
Cada decisión incluye lo que se eligió, lo que se descartó y por qué.

---

## 001 — Monolito modular en lugar de microservicios

**Decisión:** monolito modular con NestJS  
**Descartado:** microservicios, arquitectura distribuida

**Por qué:**
- Un solo desarrollador. La complejidad operativa de microservicios no tiene sentido.
- El scope del MVP no justifica la complejidad de servicios distribuidos.
- Un monolito bien modularizado permite extraer servicios después si el negocio lo requiere.
- Deployable con un solo `docker-compose up`.

---

## 002 — Tabla doble para stock (movements + materialización)

**Decisión:** `stock_movements` inmutable + `stocks` materializado, actualizados en la misma transacción  
**Descartado:** event sourcing puro, update directo de cantidad

**Por qué se descartó event sourcing puro:**
- Complica queries, debugging y proyecciones
- Introduce complejidad accidental que no aporta valor en este scope
- Difícil de mantener sin experiencia previa en el patrón

**Por qué se descartó update directo (`quantity = quantity - x`):**
- Sin historial, imposible auditar discrepancias
- Una corrupción silenciosa es irrecuperable
- No hay forma de responder "¿cuándo y por qué bajó a este nivel?"

**Por qué la tabla doble:**
- Historial completo e inmutable en `stock_movements`
- Lectura rápida sin recalcular en `stocks`
- Consistencia garantizada por la transacción PostgreSQL
- Patrón usado en sistemas reales de producción (no es over-engineering)

---

## 003 — Transferencia genera dos movimientos atómicos

**Decisión:** toda transferencia DEP_A → DEP_B genera OUTBOUND en origen + INBOUND en destino, con `transaction_id` compartido  
**Descartado:** movimiento único de tipo "transfer" con dos warehouse IDs

**Por qué:**
- Mantiene la simetría del modelo: cada movimiento pertenece a un único depósito
- El `transaction_id` agrupa los dos lados para trazabilidad y rollback mental
- Facilita queries por depósito sin condiciones especiales para transferencias
- Si la transacción falla, ninguno de los dos movimientos queda registrado

---

## 004 — Tipos de movimiento definidos desde el inicio

**Decisión:** enum `MovementType` con INBOUND, OUTBOUND, TRANSFER, ADJUSTMENT desde el día uno  
**Descartado:** agregar tipos incrementalmente según necesidad

**Por qué:**
- Los tipos adicionales aparecen inevitablemente: devoluciones, roturas, correcciones, mermas
- Migrar el modelo de movimientos después de tener datos en producción es costoso
- ADJUSTMENT cubre inventarios físicos, correcciones manuales y ajustes por diferencias
- Diseñar el enum temprano no agrega complejidad pero evita deuda técnica seria

---

## 005 — Concurrencia con SELECT FOR UPDATE

**Decisión:** lock a nivel fila en `stocks` con `SELECT ... FOR UPDATE` dentro de cada transacción  
**Descartado:** optimistic locking, manejo a nivel aplicación

**Por qué:**
- El stock roto destruye la confianza en el sistema mucho más rápido que cualquier bug visual
- PostgreSQL maneja el lock correctamente a nivel fila: no hay impacto en otras filas
- Es la solución estándar para este caso; no requiere infraestructura adicional
- Optimistic locking agrega complejidad de retry que no se justifica aquí

---

## 006 — Prisma como ORM

**Decisión:** Prisma  
**Descartado:** TypeORM, query builder directo, Drizzle

**Por qué:**
- Schema declarativo como fuente de verdad: legible, versionado, fácil de onboardear
- Migraciones generadas automáticamente desde el schema
- Type-safety completo en queries: menos errores en runtime
- Para transacciones complejas: `prisma.$transaction()` con client interactivo

---

## 007 — Sin AFIP ni integraciones externas en fase 1

**Decisión:** sin AFIP, sin MercadoLibre, sin APIs externas en MVP  
**Descartado:** integrar desde el inicio

**Por qué:**
- AFIP consume tiempo desproporcionado al valor que agrega al portfolio inicial
- El objetivo de fase 1 es demostrar arquitectura sólida, no integraciones
- Las integraciones son aditivas: pueden sumarse después sin cambiar el core
- Terminar el MVP sin distracciones es más valioso que un MVP con todo a medias

---

## 008 — Sin mobile app en fase 1

**Decisión:** responsive web como interfaz para operadores  
**Descartado:** React Native, app móvil separada

**Por qué:**
- Responsive web cubre el caso de uso operativo en campo sin stack adicional
- React Native duplica la superficie de mantenimiento para un solo desarrollador
- La interfaz operativa no requiere capacidades nativas del dispositivo
- Es una adición natural en fase 3 si hay demanda real

---

## 009 — Docker Compose para deploy inicial

**Decisión:** Docker Compose con api + postgres + redis  
**Descartado:** Kubernetes, cloud-native desde el inicio

**Por qué:**
- Un solo archivo `docker-compose.yml` es suficiente para demostrar deploy real
- Reproducible en cualquier máquina con Docker instalado
- El portfolio necesita un sistema que funcione y pueda demostrarse, no infraestructura de escala
- Migrar a k8s o a un servicio cloud es trivial una vez que el sistema está containerizado

---

## 010 — JwtStrategy stateless (sin consulta a base de datos)

**Decisión:** Validar el JWT de forma puramente criptográfica en el `JwtStrategy`, retornando el payload decodificado sin consultar la base de datos por cada request.  
**Descartado:** Hacer un `prisma.user.findUnique()` en el método `validate()` de la estrategia.

**Por qué:**
- **Performance:** Evitamos un hit a la base de datos en absolutamente todos los requests que recibe la API.
- **Escalabilidad:** El backend se mantiene verdaderamente stateless en la capa de autenticación.
- **Trade-off consciente:** Si un usuario es desactivado (`isActive: false`), su token sigue vivo hasta que expire. Como definimos un `JWT_EXPIRATION` corto (15m), esta ventana de riesgo operativo es aceptable para el scope de Fase 1.
- **Evolución:** Si en Fase 2+ el negocio exige invalidación inmediata (ej. botón de pánico o ban de operador), se implementará una blacklist de tokens en Redis, manteniendo la base de datos principal liberada de esta carga.

---

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

---

## 012 - Arquitectura Frontend y Workarounds de Base de Datos (Semana 3)

**Fecha:** 2026-06-24  
**Contexto:** Despliegue de las interfaces operativas (Dashboard, Stock, Movimientos y Alertas) para el MVP, integrando el flujo de autorización y sorteando limitaciones estructurales del ORM en queries complejas.

**Decisiones:**
1. **Frontend en Repositorio Separado:**
   - **Decisión:** Repositorio propio (`stockflow-web`) usando Vite + React + TypeScript + shadcn/ui.
   - **Por qué:** Permite despliegues independientes (backend en contenedores, frontend como estático) y desacopla el ciclo de vida de desarrollo de la UI y la API, reduciendo fricciones futuras de CI/CD. Para la persistencia de sesión del MVP, se optó por `localStorage` priorizando velocidad sobre complejidad de cookies `httpOnly`.

2. **Workaround a Limitaciones de Prisma (lowStock):**
   - **Contexto:** Prisma no soporta comparar valores inter-tablas en un `findMany` (ej. `stocks.quantity <= products.min_stock`) sin caer en ineficientes operaciones de filtrado en memoria o pesados AST de bloques `OR` masivos.
   - **Decisión:** Se implementó una estrategia en dos pasos: primero se ejecuta un `prisma.$queryRaw` ultra rápido aprovechando los índices nativos de PostgreSQL para obtener únicamente las claves foráneas afectadas. Luego, se inyectan dichos pares dinámicamente de vuelta al motor nativo de Prisma usando la tupla de la clave compuesta (`where.productId_warehouseId = { in: ... }` ignorando temporalmente la rigidez del tipado local).
   - **Por qué:** Mantiene intacto todo el ecosistema de paginación e `includes` de Prisma, protegiendo al planificador de queries de PostgreSQL de desbordes por miles de parámetros generados por inyecciones `OR`.

3. **Paginación por Cursor para la Auditoría (Movimientos):**
   - **Decisión:** El ledger de `stock_movements` se consulta vía paginación por cursor. El frontend (`Movements.tsx`) lo implementó a través del patrón "Cargar Más".
   - **Por qué:** Al ser un registro inmutable que puede crecer rápidamente, la paginación por offset puede omitir o duplicar registros en UI si ocurren inserciones simultáneas. El cursor garantiza consistencia cronológica auditable.

4. **Role-Based Access Control (RBAC) dual:**
   - **Decisión:** En vistas mutacionales (como resolver alertas), el frontend parsea y consume activamente el rol inyectado del payload JWT para ocultar proactivamente botones de acción al rol `VIEWER`.
   - **Por qué:** Mantiene la UI limpia e intuitiva. Es exclusivamente una mejora de User Experience (UX), asumiendo que la seguridad real, ineludible y obligatoria corre por cuenta de los decoradores (`@Roles`) en los Guard de NestJS.

---

## 013 - Preparación para Despliegue en Producción (Semana 3)

**Fecha:** 2026-06-25  
**Contexto:** Necesitábamos containerizar el backend (`stockflow-api`) para subirlo a un entorno Cloud (Railway) de forma segura y liviana, asegurando que pudiera comunicarse exclusivamente con el frontend en un dominio distinto.

**Decisiones:**
1. **Dockerfile Multi-Stage:**
   - **Decisión:** Se creó un Dockerfile de dos etapas (`builder` y `production`) partiendo de `node:20-alpine`. La imagen final copia únicamente `/dist`, `/node_modules` y la carpeta `/prisma`.
   - **Por qué:** Reduce drásticamente el peso de la imagen y la superficie de ataque, lo cual acelera los tiempos de deploy (spin-up de contenedores) en entornos Serverless/PaaS.
2. **Migraciones Automatizadas en el Arranque:**
   - **Decisión:** El comando principal del contenedor (`CMD`) ejecuta obligatoriamente `npx prisma migrate deploy` antes de invocar a `node dist/main`.
   - **Por qué:** Asegura que antes de que el servidor NestJS acepte una sola request de tráfico, la base de datos ya haya actualizado su estructura y schema, evitando crasheos o desincronización de modelos en producción.
3. **CORS Condicional por Entorno:**
   - **Decisión:** Se habilitó el CORS en `main.ts` utilizando como restricción de origen la variable `FRONTEND_URL`. Si esta no existe, se mantiene `origin: '*'`.
   - **Por qué:** Es un approach pragmático: blinda la seguridad en producción (Railway) forzando estrictamente el handshake de orígenes, pero mantiene retrocompatibilidad y fricción nula para desarrollo local.

---

### 014 — Proyección materializada separada para Lotes (`batch_stocks`)
**Decisión:** Crear la tabla `batch_stocks` como proyección separada de `stocks`, actualizada dentro de la misma transacción del movimiento.
**Descartado:** Agrupar los saldos recalculando `stock_movements` on-the-fly, o modificar la tabla `stocks` original para incluir el `batchId`.
**Por qué:** 
- Modificar `stocks` habría roto la retrocompatibilidad con la Fase 1.
- Recalcular al vuelo destruye la performance en lecturas intensivas.
- Aplicar el mismo patrón de `SELECT FOR UPDATE` sobre `batch_stocks` nos permite prevenir deadlocks y mantener concurrencia segura (Lock Hierarchy) sin introducir herramientas externas.

---

### 015 — Arquitectura UI de Trazabilidad y Validación Frontend Delegada (Fase 3)
**Fecha:** 2026-07-02
**Contexto:** Se desarrolló la interfaz para trazabilidad de lotes y series en el repositorio `stockflow-web`.
**Decisiones:**
1. **Validación de Reglas de Negocio en Backend:** 
   - **Decisión:** El frontend no valida la exclusividad ni los formatos de los Números de Serie. Recopila los inputs (separados por coma o salto de línea en un `<textarea>`), los mapea a un array de strings y se los envía al servidor de stock.
   - **Por qué:** El Backend es la fuente de verdad ("Backend is King"). Delegar el manejo de duplicados (Prisma `P2002`) y consistencia al backend simplifica enormemente la lógica del frontend. El cliente se limita a parsear los `ConflictException` (HTTP 409) y `BadRequestException` (HTTP 400) para mostrar notificaciones (toasts).
2. **Carga de Datos (Data Fetching):**
   - **Decisión:** Se mantuvieron los hooks tradicionales (`useEffect` y `useState`) y Axios.
   - **Por qué:** Para no acoplar nuevas dependencias (ej. SWR o React Query) que aumenten el bundle size, respetando la directiva estricta de "mantener el cliente vainilla y sin librerías externas superfluas" de la Fase 1.
3. **Sugerencia FEFO Asíncrona (Non-Blocking UI):**
   - **Decisión:** Cuando un operador abre el cajón de Movimientos (Outbound), el frontend ejecuta `GET /stock/fefo-suggestion` de forma asíncrona y, al resolverse, inyecta visualmente un badge `(Recomendado FEFO)` sobre el lote candidato en el `<select>`.
   - **Por qué:** La UI no se bloquea esperando cálculos del backend, permitiendo operaciones rápidas pero ofreciendo un guardrail inteligente contra el vencimiento.

---

### 016 — Webhooks Frontend y Bugfix de Concurrencia de Prisma (Fase 2 - Continuación)
**Fecha:** 2026-07-08
**Contexto:** Despliegue de la interfaz de administración para Webhooks y resolución de error interno de Prisma en el conteo de registros filtrados por múltiples columnas.
**Decisiones:**
1. **Paginación por Cursor en UI sin librerías adicionales:** 
   - **Decisión:** El frontend de entregas de Webhooks implementa el botón "Cargar Más" usando un hook vanilla (`useWebhooks`) con un *functional state update* (`prev => [...prev, ...nuevos]`).
   - **Por qué:** Evita la complejidad de *stale closures* en React y mantiene el peso del bundle al mínimo (sin Zustand/ReactQuery), siguiendo la decisión original (012 y 015).
2. **Revelado Único del Secret de Webhook (BR-22):**
   - **Decisión:** El *Secret* se revela en texto plano mediante un Modal en la UI **únicamente una vez** post-creación, con un botón que usa `navigator.clipboard.writeText()` (envuelto en `try/catch` para entornos sin HTTPS estricto). Nunca se envía devuelta al servidor y el servidor nunca lo expone en posteriores GET.
   - **Por qué:** Maximizamos la seguridad y limitamos el radio de explosión. Al encriptarse con AES-256-GCM en base de datos, ni el administrador del sistema puede recuperar un token perdido.
3. **Filtros Compuestos en Prisma `count()` (Workaround Temporal):**
   - **Decisión:** Ante la limitación de Prisma de no soportar `where.field_field: { in: [...] }` en la operación `count()`, se modificó la lógica en el backend (`StockService.getStocks`) para inyectar dinámicamente un array de bloques en `where.OR`.
   - **Por qué:** Soluciona el bug `Invalid prisma.stock.count()` a corto plazo para cerrar el ticket.
   - **Luz Amarilla (Trade-off):** Inyectar bloques `OR` masivos genera un AST pesado que puede colapsar el planificador de queries de PostgreSQL. Como se documentó en la **Decisión 012**, esto es un riesgo. Si el filtro de stock bajo devuelve cientos o miles de tuplas, esto degradará la latencia.
   - **Solución Definitiva (Futuro):** Si se detecta degradación, se reescribirá este `count()` específico usando `$queryRaw` para que PostgreSQL haga el conteo nativo aprovechando los índices, salteándose la capa de agregación de Prisma.

---

### 017 — Webhooks configurables vs fijos
**Decisión:** Webhooks con suscripción a eventos configurables por el usuario.
**Descartado:** Webhooks fijos hardcodeados.
**Por qué:** Aporta valor real de integración B2B. Permite al usuario definir qué le interesa (ej. solo stock.low). Sigue el modelo estándar de la industria (Stripe, GitHub).

---

### 018 — Firma de payloads con HMAC-SHA256
**Decisión:** Todo payload de webhook se firma usando HMAC-SHA256 con el secret de la suscripción, enviando el hash en el header `X-StockFlow-Signature`.
**Descartado:** Envío de payloads sin firma o validación por IP.
**Por qué:** Permite al receptor verificar matemáticamente que el evento fue originado por StockFlow y que el cuerpo del mensaje no fue manipulado en tránsito (Man-in-the-Middle).

---

### 019 — Separación transaccional entre Estado de OC y Motor de Stock (Semana 7)
**Contexto:** La recepción de Órdenes de Compra debe actualizar la OC y automáticamente generar movimientos de INBOUND en el motor de stock.
**Decisión:** La actualización de los saldos de la Orden de Compra y la inyección de movimientos (INBOUND) se realizan en transacciones a base de datos completamente separadas e independientes de forma secuencial.
**Descartado:** Macro-transacción de Prisma que envuelva la actualización de la OC y el método `StockService.createMovement()`.
**Por qué:**
- **Prevención de Deadlocks:** `StockService` utiliza `SELECT FOR UPDATE` para bloquear filas específicas de stock y garantizar concurrencia segura. Envolver este proceso en una transacción más grande (la de la OC) incrementa exponencialmente el tiempo que la tabla `stocks` permanece bloqueada, degradando la performance y provocando deadlocks bajo carga.
- **Aislamiento Core (Guardrails):** La arquitectura dicta que los módulos satélite no pueden inmiscuirse en las transacciones del módulo core de inventario.
- **Tolerancia a fallos:** Si bien se pierde la atomicidad absoluta entre la OC y el movimiento de stock, una divergencia aquí (ej. OC recibida pero INBOUND fallido por error de red/servidor) deja la OC como evidencia auditable, mientras que un bloqueo de base de datos interrumpe todo el sistema de manera global.
