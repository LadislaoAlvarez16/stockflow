import { PrismaClient, UserRole, MovementType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning database...');
  // Limpiamos en orden para evitar conflictos o usamos TRUNCATE CASCADE para más seguridad
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users", "categories", "products", "warehouses", "stock_movements", "stocks" CASCADE;`);

  console.log('Seeding users...');
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@stockflow.com',
      name: 'Admin Maestro',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const operator = await prisma.user.create({
    data: {
      email: 'operator@stockflow.com',
      name: 'Operador Depósito',
      passwordHash,
      role: UserRole.OPERATOR,
    },
  });

  const viewer = await prisma.user.create({
    data: {
      email: 'viewer@stockflow.com',
      name: 'Auditor Externo',
      passwordHash,
      role: UserRole.VIEWER,
    },
  });

  console.log('Seeding categories...');
  const catBebidas = await prisma.category.create({ data: { name: 'Bebidas' } });
  const catSnacks = await prisma.category.create({ data: { name: 'Snacks' } });
  const catLimpieza = await prisma.category.create({ data: { name: 'Limpieza' } });

  console.log('Seeding warehouses...');
  const wCentro = await prisma.warehouse.create({
    data: { name: 'Depósito Central', code: 'DEP-CEN', location: 'Centro' },
  });
  const wNorte = await prisma.warehouse.create({
    data: { name: 'Sucursal Norte', code: 'SUC-NOR', location: 'Norte' },
  });
  const wSur = await prisma.warehouse.create({
    data: { name: 'Sucursal Sur', code: 'SUC-SUR', location: 'Sur' },
  });

  const warehouses = [wCentro, wNorte, wSur];

  console.log('Seeding products...');
  const productsData = [
    { sku: 'BEB-COL-2L', name: 'Bebida Cola 2L', category: catBebidas.name, costPrice: 1500, minStock: 50 },
    { sku: 'BEB-COL-1L', name: 'Bebida Cola 1L', category: catBebidas.name, costPrice: 900, minStock: 50 },
    { sku: 'BEB-LIM-2L', name: 'Bebida Limón 2L', category: catBebidas.name, costPrice: 1400, minStock: 40 },
    { sku: 'BEB-NAR-2L', name: 'Bebida Naranja 2L', category: catBebidas.name, costPrice: 1400, minStock: 40 },
    { sku: 'BEB-AGU-1L', name: 'Agua Mineral 1L', category: catBebidas.name, costPrice: 500, minStock: 100 },
    { sku: 'SNA-PAP-150G', name: 'Papas Fritas Clásicas 150g', category: catSnacks.name, costPrice: 800, minStock: 30 },
    { sku: 'SNA-PAP-QUE-150G', name: 'Papas Fritas Queso 150g', category: catSnacks.name, costPrice: 850, minStock: 20 },
    { sku: 'SNA-MAN-100G', name: 'Maní Salado 100g', category: catSnacks.name, costPrice: 400, minStock: 50 },
    { sku: 'SNA-PAL-200G', name: 'Palitos Salados 200g', category: catSnacks.name, costPrice: 600, minStock: 40 },
    { sku: 'SNA-NACH-200G', name: 'Nachos de Maíz 200g', category: catSnacks.name, costPrice: 900, minStock: 30 },
    { sku: 'LIM-LAV-1L', name: 'Lavandina 1L', category: catLimpieza.name, costPrice: 700, minStock: 60 },
    { sku: 'LIM-DET-500ML', name: 'Detergente Vajilla 500ml', category: catLimpieza.name, costPrice: 500, minStock: 80 },
    { sku: 'LIM-DES-1L', name: 'Desodorante de Pisos 1L', category: catLimpieza.name, costPrice: 600, minStock: 50 },
    { sku: 'LIM-ESP-1U', name: 'Esponja Multiuso 1u', category: catLimpieza.name, costPrice: 150, minStock: 100 },
    { sku: 'LIM-TRA-1U', name: 'Trapo de Piso 1u', category: catLimpieza.name, costPrice: 800, minStock: 40 },
  ];

  const createdProducts = [];
  for (const p of productsData) {
    const product = await prisma.product.create({ 
      data: {
        sku: p.sku,
        name: p.name,
        costPrice: p.costPrice,
        minStock: p.minStock,
        category: p.category,
      } 
    });
    createdProducts.push(product);
  }

  console.log('Seeding initial stock...');
  
  for (let i = 0; i < createdProducts.length; i++) {
    const product = createdProducts[i];
    
    for (const warehouse of warehouses) {
      // Definimos la lógica de forma que algunos productos queden bajo el minStock
      const isLowStock = (i + warehouse.name.length) % 3 === 0;
      const quantity = isLowStock ? Number(product.minStock) - 10 : Number(product.minStock) + 50;
      
      if (quantity > 0) {
        await prisma.$transaction(async (tx) => {
          const transactionId = uuidv4();
          
          await tx.stockMovement.create({
            data: {
              productId: product.id,
              warehouseId: warehouse.id,
              type: MovementType.INBOUND,
              quantity: quantity,
              reference: 'SEED-INITIAL',
              notes: 'Stock inicial desde seed',
              transactionId,
              createdById: admin.id,
            }
          });

          await tx.stock.upsert({
            where: {
              productId_warehouseId: {
                productId: product.id,
                warehouseId: warehouse.id,
              }
            },
            create: {
              productId: product.id,
              warehouseId: warehouse.id,
              quantity: quantity,
            },
            update: {
              quantity: { increment: quantity },
            }
          });
        });
      }
    }
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
