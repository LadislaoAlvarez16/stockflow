<div align="center">

# StockFlow

**Sistema de control de inventario multi-depósito con trazabilidad inmutable, automatización y arquitectura de nivel producción.**

Proyecto de portfolio técnico — no es un tutorial de CRUD, es un sistema diseñado para tolerar alta concurrencia y proteger la integridad de los datos como lo usaría una distribuidora real.

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

[Decisiones de arquitectura](./.ai-context/DECISIONS.md)

</div>

---

## 🎯 ¿Qué es StockFlow?

StockFlow es un backend y motor transaccional construido para resolver el problema clásico de las distribuidoras: la discrepancia entre el stock físico y el del sistema. 

**Su principio no negociable:** El stock nunca se modifica directamente (no hay `UPDATE stock SET quantity = ...`). Todo cambio de inventario es un **movimiento registrado e inmutable**. 

---

## ✨ Características (Fase 3 Completada)

- **Sistema de webhooks asíncronos con colas de reintentos (BullMQ) y firmas criptográficas HMAC-SHA256 — Arquitectura de integración de nivel producción.**
- **Trazabilidad bidireccional por lote (FEFO) y número de serie con proyecciones materializadas concurrentes.**
- **Auth & RBAC Dual:** Autenticación sin estado (Stateless JWT) con tres roles estrictos (`ADMIN`, `OPERATOR`, `VIEWER`). Los permisos se chequean criptográficamente sin asediar a la base de datos por cada request.
- **Motor de Stock Inmutable:** Las operaciones de inventario se gestionan a través de transacciones ACID.
- **ABM de Catálogos:** Gestión integral de Productos y Depósitos con "soft-deletes" para proteger la integridad referencial.
- **Motor ETL Masivo e Inventario Físico:** Endpoint optimizado para ingesta masiva (Excel/CSV) con procesamiento ultra-rápido en memoria para carga inicial y reconciliación de inventarios físicos.
- **Motor de Reportes PDF:** Generación nativa de comprobantes y listados (Puppeteer + HTML/CSS inyectado dinámicamente) sin degradar la memoria del servidor.
- **Dashboard Operativo:** Endpoints de métricas preparadas para dashboards analíticos.

---

## 🏗️ Decisiones Arquitectónicas Clave

Este proyecto está construido para demostrar madurez en la toma de decisiones técnicas (trade-offs):

### 1. Ledger Inmutable (Tabla Doble)
En lugar de mutar un campo `quantity`, StockFlow escribe en `stock_movements` (el historial inmutable) y proyecta el resultado en `stocks` (tabla materializada para lecturas rápidas) dentro de la **misma transacción de PostgreSQL**. Si ocurre un fallo, no queda nada a medias. Esto garantiza auditorías perfectas.

### 2. Transacciones Atómicas y Concurrencia
Se utiliza **Pessimistic Locking** (`SELECT ... FOR UPDATE`) a nivel fila en PostgreSQL durante las mutaciones de stock. Esto elimina de raíz las condiciones de carrera (Race Conditions) que ocurren cuando dos operadores intentan retirar la última unidad de un producto al mismo tiempo. Además, en operaciones multi-depósito (Transferencias), los locks se adquieren en orden alfanumérico para evitar *Deadlocks*.

### 3. Procesamiento ETL Seguro
El importador masivo no lanza miles de queries a la base de datos ni carga a memoria arrays insostenibles. Utiliza un `Map` (HashMap) para resolver SKUs en tiempo constante `O(1)`, implementa un límite estricto de seguridad (1000 filas) y controla la **Idempotencia** (si subes el mismo remito dos veces, el sistema omite el segundo ingreso silenciosamente en lugar de duplicar el stock).

---

## 💻 Stack Tecnológico

| Tecnología | Rol en el ecosistema |
|------------|----------------------|
| **NestJS** | Framework core, aportando Inyección de Dependencias y arquitectura modular estricta. |
| **Prisma** | ORM con tipado fuerte de extremo a extremo y gestión determinística de transacciones. |
| **PostgreSQL** | Fuente de verdad absoluta. Transacciones ACID y bloqueos a nivel fila. |
| **Docker** | Infraestructura reproducible. Despliegue de DB y API mediante `docker-compose`. |

---

## 🚀 Guía de Inicio Rápido (Local)

### Requisitos previos
- Docker y Docker Compose instalados.
- Node.js (v20+ recomendado).

### Pasos de instalación

1. **Clonar el repositorio y preparar el entorno:**
   ```bash
   git clone https://github.com/tu-usuario/stockflow.git
   cd stockflow
   cp .env.example .env
   ```

2. **Levantar la infraestructura de base de datos:**
   ```bash
   docker-compose up -d
   ```

3. **Instalar dependencias y preparar la base de datos:**
   ```bash
   npm install
   npx prisma migrate dev
   ```

4. **Ejecutar el Seed (Datos de prueba iniciales):**
   ```bash
   npm run seed
   ```
   *Credenciales del usuario Administrador generadas por defecto:*
   - **Email:** `admin@stockflow.local`
   - **Password:** `admin123`

5. **Iniciar el servidor en modo desarrollo:**
   ```bash
   npm run start:dev
   ```
   La API estará respondiendo en `http://localhost:3000`.

---

## 📁 Estructura del Proyecto

StockFlow sigue una arquitectura modular en **NestJS**. Cada dominio de negocio tiene su propio directorio autocontenido, facilitando a futuro una eventual extracción hacia microservicios:

- `/src/auth` — Lógica de generación y validación de tokens Stateless.
- `/src/stock` — El motor central de movimientos inmutables.
- `/src/imports` — El pipeline ETL de procesamiento CSV masivo.
- `/src/products` & `/src/warehouses` — ABM de catálogos maestros.
- `/src/alerts` — Colas y notificaciones (BullMQ - Fase 2).

---

## 🗺️ Roadmap (Próximas Fases)
- **Fase 4:** Frontend Final. Implementación completa de componentes (shadcn/ui), ruteo (React Router), estado y UX completa de todas las entidades y reportes (React, Vite).
