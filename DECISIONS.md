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
