<div align="center">

# StockFlow

**Sistema de control de inventario multi-depósito con trazabilidad inmutable, automatización y arquitectura de nivel producción.**

Proyecto de portfolio técnico — no es un tutorial de CRUD, es un sistema diseñado como lo usaría una distribuidora real.

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

[Demo en vivo](#) · [Documentación técnica](./docs) · [Decisiones de arquitectura](./docs/DECISIONS.md)

</div>

---

## El problema

Las distribuidoras medianas (50–5.000 SKUs, 2–10 depósitos) todavía manejan su inventario en Excel y WhatsApp. El resultado es siempre el mismo: el stock del sistema no coincide con el stock físico, nadie sabe por qué, y un reclamo de faltante no tiene respuesta técnica posible.

**StockFlow resuelve esto con un principio simple y no negociable: el stock nunca se modifica directamente. Todo cambio es un movimiento registrado e inmutable.**

```
stock_movements   →   fuente de verdad, inmutable, nunca se edita ni se borra
stocks             →   proyección materializada, lectura instantánea
```

Ambas tablas se escriben en la **misma transacción de PostgreSQL**. Si algo falla, no queda nada a medias.

---

## Por qué este proyecto es distinto a un CRUD

| Decisión técnica | Lo que demuestra |
|---|---|
| Historial inmutable + proyección materializada en la misma transacción | Entender consistencia de datos sin caer en over-engineering (no es event sourcing completo) |
| `SELECT FOR UPDATE` en operaciones concurrentes de stock | Manejo real de condiciones de carrera, no solo el happy path |
| Transferencias = 2 movimientos atómicos con `transaction_id` compartido | Diseño de dominio correcto: el stock no se teletransporta entre tablas |
| ETL en chunks de 100 filas, nunca una transacción gigante | Conocimiento de cómo un import masivo puede tumbar la API si se hace mal |
| Pipeline de alertas con BullMQ + cron de fallback | Automatización real, con deduplicación y reintentos, no un `setInterval` |
| Cada decisión arquitectónica está documentada con su trade-off | Capacidad de explicar **por qué**, no solo **qué** |

Cada una de estas decisiones está justificada por escrito en [`docs/DECISIONS.md`](./docs/DECISIONS.md), incluyendo las alternativas que se descartaron y por qué.

---

## Stack

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Backend | NestJS + TypeScript strict | Arquitectura modular, DI, sin `any` |
| ORM | Prisma | Type-safety end-to-end, migraciones versionadas |
| Base de datos | PostgreSQL 15 | Transacciones ACID, locks a nivel fila |
| Cache / Queues | Redis + BullMQ | Jobs asíncronos con reintentos y backoff |
| Auth | JWT + refresh rotation | Sin sesiones server-side, stateless |
| Autorización | RBAC (admin / operator / viewer) | Permisos por endpoint, no por pantalla |
| ETL | SheetJS + pipeline de validación por fila | Imports masivos que no fallan todo por un error |
| Infra | Docker Compose | api + postgres + redis + worker, un comando |
| Testing | Jest + Supertest | Unit + integración con DB real |

---

## Arquitectura en una imagen

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     api      │────▶│  postgres    │     │    redis     │
│   (NestJS)   │     │  (fuente de  │     │  (queues +   │
│              │     │   verdad)    │     │   cache)     │
└──────┬───────┘     └──────────────┘     └──────┬───────┘
       │                                          │
       │              ┌──────────────┐            │
       └─────────────▶│    worker    │◀───────────┘
                       │  (BullMQ)    │
                       └──────────────┘
```

Monolito modular. Sin microservicios, sin CQRS, sin event sourcing enterprise — decisiones conscientes documentadas en [`DECISIONS.md`](./docs/DECISIONS.md), no atajos.

---

## El motor de stock — la pieza central

```typescript
// Toda operación de stock pasa por una transacción atómica
await prisma.$transaction(async (tx) => {
  // 1. Lock a nivel fila — previene condiciones de carrera
  await tx.$executeRaw`SELECT quantity FROM stocks 
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId} 
    FOR UPDATE`;

  // 2. Validar stock disponible antes de cualquier egreso
  if (current.quantity < quantity) {
    throw new BadRequestException('Insufficient stock');
  }

  // 3. INSERT inmutable — el historial nunca se edita
  await tx.stockMovement.create({ data: { type, quantity, ...} });

  // 4. UPSERT en la proyección — misma transacción, consistencia garantizada
  await tx.stock.upsert({ where: {...}, update: {...}, create: {...} });
});
```

Una transferencia entre depósitos genera **exactamente dos movimientos atómicos**, nunca uno:

```
DEP_A → DEP_B
  1. OUTBOUND en DEP_A  ┐  misma transacción
  2. INBOUND  en DEP_B  ┘  mismo transaction_id
```

Si cualquiera de los dos falla, ninguno se registra. El stock nunca queda "a medias".

---

## Documentación técnica completa

Este proyecto está documentado como si lo fuera a mantener un equipo, no solo yo:

| Documento | Qué encontrás |
|-----------|----------------|
| [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Capas, módulos, flujo de requests |
| [`DATA_MODEL.md`](./docs/DATA_MODEL.md) | Entidades, relaciones, índices justificados uno por uno |
| [`BUSINESS_RULES.md`](./docs/BUSINESS_RULES.md) | 13 reglas de negocio con contexto, condición y código |
| [`DECISIONS.md`](./docs/DECISIONS.md) | Qué se eligió, qué se descartó, y por qué — con trade-offs explícitos |
| [`API.md`](./docs/API.md) | Todos los endpoints REST con permisos por rol |
| [`AUTOMATION.md`](./docs/AUTOMATION.md) | Queues BullMQ, workers, cron jobs |
| [`GUARDRAILS.md`](./docs/GUARDRAILS.md) | Reglas arquitectónicas que no se negocian |
| [`TESTING.md`](./docs/TESTING.md) | Qué se testea y por qué (no todo, lo que duele si se rompe) |
| [`ROADMAP.md`](./docs/ROADMAP.md) | Fases del proyecto, qué está hecho y qué falta |

---

## Levantar el proyecto localmente

```bash
git clone https://github.com/tu-usuario/stockflow.git
cd stockflow

cp .env.example .env

docker-compose up -d        # postgres + redis + worker

npm install
npx prisma migrate dev
npm run seed                 # datos de demo realistas

npm run start:dev
```

API disponible en `http://localhost:3000/api/v1`  
Panel de queues (Bull Board) en `http://localhost:3000/admin/queues`

---

## Estado del proyecto

- [x] **Fase 1 — Core** — Auth, RBAC, motor de stock, ETL, dashboard básico
- [x] **Fase 2 — Automatización** — BullMQ, alertas automáticas, notificaciones por email, cron jobs
- [ ] **Fase 3 — Trazabilidad avanzada** — Lotes, vencimientos, inventario físico, reportes exportables
- [ ] **Fase 4 — SaaS** — Multi-tenant, billing, integraciones externas

Ver el detalle completo en [`ROADMAP.md`](./docs/ROADMAP.md).

---

## Sobre este proyecto

Lo construí para demostrar cómo pienso un sistema backend cuando el dominio importa: no solo "que funcione", sino que sea auditable, consistente bajo concurrencia, y mantenible por alguien que no sea yo.

Cada decisión técnica relevante está documentada con su alternativa descartada — eso es a propósito. Quiero que se entienda el razonamiento, no solo el resultado.

**Contacto:** [LinkedIn](#) · [Email](#)
