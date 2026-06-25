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
