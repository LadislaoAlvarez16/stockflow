# E2E Smoke Tests and QA Guidelines

Este documento registra los guiones de prueba end-to-end (Smoke Tests) críticos utilizados para validar las funcionalidades del sistema. Estos tests actúan como guardrails para asegurar que las fases subsiguientes no rompan el comportamiento core de la aplicación (Backend is King).

## Smoke Test: Trazabilidad de Lote y Serie (Fase 3)

Este test asegura que el motor de inventario atómico FEFO funcione de punta a punta.

**Pre-requisito:**
Tener al menos un Producto (`QA-Electronics`) y dos Depósitos creados en el sistema (`DEP-A` y `DEP-B`).

### Paso 1: Creación del Lote
Se crea un lote para el producto indicando una cantidad inicial.
- **Validación esperada:** El lote se crea exitosamente. En el frontend, el badge debe verse Rojo (Crítico) si está a menos de 15 días de vencer.

### Paso 2: Ingreso (Inbound) Atómico con Series
Se registra un movimiento `INBOUND` para el depósito `DEP-A` con la cantidad exacta de unidades asociadas al lote creado.
Se envían explícitamente los arrays de números de serie (ej: `['SN-01', 'SN-02', 'SN-03']`).
- **Validación esperada:** Movimiento exitoso. El backend guarda atómicamente el movimiento, el stock en depósito, el stock en lote y los registros de las series individuales marcadas como `available`.

### Paso 3: Auditoría Bidireccional
- **Validación de Lote (`/batches/:id`):** El detalle de `batchStocks` debe reflejar la cantidad ingresada.
- **Validación de Movimientos (`/batches/:id/movements`):** Debe reflejar el movimiento `INBOUND`.
- **Validación de Series (`/batches/:id/serial-numbers`):** Deben aparecer todas las series registradas con estado `available`.

### Paso 4: Fallo de Integridad (Escudo Backend)
Se intenta ejecutar un movimiento con una serie que ya fue registrada previamente en el sistema.
- **Validación esperada:** El motor (vía `Prisma P2002`) debe atajar el error y rechazar la transacción, devolviendo un HTTP `409 Conflict`. El backend **no** debe permitir registrar series duplicadas.

### Paso 5: Transferencia Lógica de Series
Se transfiere (`TRANSFER`) 1 unidad desde `DEP-A` hacia `DEP-B`, enviando como payload la serie específica que se desea mover.
- **Validación esperada:** La serie debe cambiar su ubicación al nuevo depósito (`DEP-B`) manteniendo su estado en `available`. Su historial de trazabilidad debe registrar el evento.

### Paso 6: Motor FEFO y Salida (Outbound)
Se consulta al motor por el lote más próximo a vencer para un producto (`/stock/fefo-suggestion`). Luego, se ejecuta una salida (`OUTBOUND`) de 1 unidad consumiendo una de las series que quedó en `DEP-A`.
- **Validación esperada:** El backend ejecuta exitosamente la deducción de stock general y de stock del lote (FEFO asíncrono).

### Paso 7: Trazabilidad Final de Serie
Se revisa el historial de la serie despachada en el paso anterior (`/serial-numbers/:serialNumber/history`).
- **Validación esperada:** La serie debe figurar con el estado `consumed` y su `outboundMovementId` debe apuntar al ID del movimiento de salida registrado en el Paso 6.

---

> **Nota:** La automatización en NodeJS de esta prueba reside en el script `e2e_qa.js` de la raíz del proyecto. Si alguna vez se toca el motor de transacciones de stock (`StockService` o `SerialNumbersService`), se **DEBE** correr `node e2e_qa.js` para asegurar que el Smoke Test de la Fase 3 sigue pasando exitosamente.
