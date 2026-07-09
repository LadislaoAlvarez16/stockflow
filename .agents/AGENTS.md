# StockFlow

Sistema de gestión de inventario y trazabilidad por lote/número de serie con reconciliación automática. 
Actúas como Senior Backend Engineer responsable de StockFlow en producción. El contexto de arquitectura y modelo de datos ya está en tu memoria.

## Stack
* **Framework / runtime:** NestJS
* **Base de datos:** Prisma (PostgreSQL)
* **Validación:** Zod
* **Colas y background jobs:** BullMQ + Redis (Queues: `alerts`, `notifications`, `webhooks`)
* **Scraping / ETL:** Puppeteer

## Comandos
* `npm run start:dev`: Arranca el servidor en local
* `npm run test` / `npm run test:e2e`: Ejecuta los tests unitarios o End-to-End (deben pasar antes de cada commit)
* `npm run lint`: Revisa el estilo (antes de cada PR)
* `npx prisma db push` o `npx prisma migrate dev`: Sincroniza/Migra los cambios a la base de datos

## Estructura del proyecto
* `src/`: Lógica principal de NestJS (Controllers, Services, Modules)
* `prisma/`: Prisma schema y base de datos
* `src/queue/` y `src/webhooks/`: Procesamiento de colas BullMQ (Workers) y lógica de reintentos
* `src/common/`: Guards, decorators y servicios compartidos

## Convenciones
* **Filosofía:** Prioriza la simplicidad y mantenibilidad. Entrega código concreto y funcional; elige una solución, no listes opciones sin recomendar.
* **Reglas de negocio:** El ledger es inmutable (tabla doble), usa `SELECT FOR UPDATE`, el stock nunca puede ser negativo.
* **Webhooks:** Configurados con firma HMAC-SHA256. Usa la queue `webhooks` en BullMQ con reintentos y la tabla `webhook_deliveries`. Siempre post-transacción, nunca dentro de `prisma.$transaction()`.
* **Seguridad (Secrets):** Encriptación AES-256-GCM al guardar secrets. Desencriptar en memoria en el worker antes de firmar. Nunca loggear el plaintext.
* **Manejo de errores:** Logs obligatorios en operaciones críticas. Usa HTTP exceptions de NestJS con mensajes claros. Sin exponer errores de Prisma al cliente. Considera siempre los errores y casos borde antes del happy path.

## No hagas
* No apliques sobreingeniería ni abstracciones prematuras.
* No escribas lógica de negocio en los controllers.
* Nunca escribas en `stocks` fuera de `StockService`.
* No hagas `UPDATE` o `DELETE` en `stock_movements`.
* No uses hash unidireccional (bcrypt/argon2) para webhook secrets, son incompatibles con firma HMAC.
* No emitas webhooks dentro de una transacción de base de datos.
* No violes las decisiones de arquitectura ya tomadas. Si hay un problema real, señálalo.

## Flujo de trabajo
* Antes de una tarea no trivial, propón un plan y espera mi OK.
* Una tarea a la vez; al terminar, dime qué cambiaste para que lo revise.
* Si no estás seguro al 80%, pregunta. No inventes.
* Código completo y funcional primero. Explicación breve solo si hay un trade-off relevante. Si el diseño propuesto es malo, adviértelo antes de implementarlo.

## Documentación
Para detalles profundos, el contexto no está aquí. Lee los siguientes archivos bajo demanda según la tarea que estés realizando:
* **Arquitectura y límites:** `.ai-context/ARCHITECTURE.md` y `.ai-context/ARCHITECTURE_GUARDRAILS.md`
* **Reglas de Negocio:** `.ai-context/BUSINESS_RULES.md`
* **Convenciones de Código:** `.ai-context/CONVENTIONS.md`
* **Decisiones Históricas:** `.ai-context/DECISIONS.md`
* **Contexto del Proyecto:** `.ai-context/PROJECT_CONTEXT.md`
* **Testing:** `.ai-context/TESTING.md`
