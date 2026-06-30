-- CreateEnum
CREATE TYPE "SerialNumberStatus" AS ENUM ('available', 'reserved', 'consumed');

-- CreateTable
CREATE TABLE "serial_numbers" (
    "id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID,
    "warehouse_id" UUID,
    "status" "SerialNumberStatus" NOT NULL DEFAULT 'available',
    "inbound_movement_id" UUID,
    "outbound_movement_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serial_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "serial_numbers_product_id_status_idx" ON "serial_numbers"("product_id", "status");

-- CreateIndex
CREATE INDEX "serial_numbers_warehouse_id_status_idx" ON "serial_numbers"("warehouse_id", "status");

-- CreateIndex
CREATE INDEX "serial_numbers_batch_id_idx" ON "serial_numbers"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "serial_numbers_product_id_serial_number_key" ON "serial_numbers"("product_id", "serial_number");

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

