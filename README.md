<div align="center">

# StockFlow

**Sistema de control de inventario multi-depósito con trazabilidad inmutable, automatización y arquitectura de nivel producción.**

Proyecto de portfolio técnico diseñado para tolerar alta concurrencia, prevenir Race Conditions y proteger la integridad absoluta de los datos transaccionales, resolviendo el problema clásico de las discrepancias de inventario en entornos B2B.

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

[Decisiones de Arquitectura](./.ai-context/DECISIONS.md)

</div>

---

## 🎯 El Problema a Resolver

En empresas de distribución o retail, el inventario físico rara vez coincide con el del sistema debido a **condiciones de carrera** (dos operadores retirando el último ítem a la vez), **falta de trazabilidad** (mutaciones directas sobre el balance actual) y **errores de importación masiva** sin validaciones. 

**La Solución StockFlow:** El stock nunca se modifica directamente (`UPDATE stock SET quantity = ...`). Todo cambio de inventario es un **movimiento registrado, inmutable y ordenado algorítmicamente**.

---

## ✨ Características Principales

- **Arquitectura Inmutable (Ledger Double-Entry):** Las operaciones se registran como inmutables y se proyectan sobre balances mediante transacciones ACID strictas.
- **Concurrencia Cero Fallos (Pessimistic Locking):** Manejo nativo de `SELECT ... FOR UPDATE`. En operaciones complejas (transferencias multi-depósito), el motor adquiere *Locks* ordenados alfanuméricamente para eliminar la posibilidad de Deadlocks.
- **Webhooks Asíncronos (BullMQ):** Motor de integración *Event-Driven* con reintentos exponenciales y firmas criptográficas HMAC-SHA256 para comunicación segura entre microservicios o sistemas legacy.
- **Auth & RBAC Dual:** Autenticación por JWT (Stateless) con guardias de permisos a nivel Endpoint y Field.
- **Swagger / OpenAPI:** API completamente documentada e interactiva.
- **ETL Idempotente:** Ingesta masiva segura de archivos que absorbe errores fila por fila y evita inserciones duplicadas (Idempotencia `O(1)` con Maps).
- **Trazabilidad de Lote (FEFO):** Seguimiento extremo por Lotes de Vencimiento y Números de Serie unitarios.

---

## 💻 Stack Tecnológico

| Tecnología | Rol en el Ecosistema |
|------------|----------------------|
| **NestJS** | Inyección de Dependencias, Módulos, Interceptors y Guardias. |
| **Prisma ORM**| Acceso tipado de extremo a extremo, delegando bloqueos pesimistas nativos a la BD. |
| **PostgreSQL**| Fuente de verdad absoluta (Transaccional, ACID). |
| **Redis** | Cola en memoria ultra-rápida administrando jobs (BullMQ). |
| **Jest** | Unit Testing mockeado comprobando la consistencia transaccional y prevención de quiebres. |

---

## 🚀 Guía de Instalación y Uso (Local)

### Requisitos
- Docker y Docker Compose
- Node.js (v20+)

### Pasos

1. **Clonar e Iniciar Infraestructura:**
   ```bash
   git clone https://github.com/tu-usuario/stockflow.git
   cd stockflow
   cp .env.example .env
   docker-compose up -d
   ```

2. **Instalar Dependencias y Sincronizar Prisma:**
   ```bash
   npm install
   npx prisma migrate dev
   ```

3. **Ejecutar Tests y Seed de Base de Datos:**
   ```bash
   npm test
   npm run seed
   ```
   *(El Seed creará al admin: `admin@stockflow.local` / `admin123`)*

4. **Levantar el Servidor:**
   ```bash
   npm run start:dev
   ```

---

## 📚 Documentación Interactiva (Swagger)

Una vez que la aplicación esté corriendo, toda la documentación interactiva de la API, junto con los schemas (DTOs) y autenticación, está disponible en:

👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

*(Para probar endpoints protegidos, loguéate en `/auth/login` con las credenciales admin, copiá el Token, y pegalo en el botón "Authorize" superior del Swagger).*

---

## 🩺 Monitoreo

El sistema incluye un endpoint estandarizado para Kubernetes u Orquestadores en `GET /health` que verifica en tiempo real la conexión con PostgreSQL y el ping del driver de Redis de BullMQ.
