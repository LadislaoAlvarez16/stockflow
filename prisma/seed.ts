import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@stockflow.local';
  const plainPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
  
  const saltOrRounds = 10;
  const passwordHash = await bcrypt.hash(plainPassword, saltOrRounds);

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {}, // Empty update ensures idempotency without overwriting manual user modifications
    create: {
      email,
      passwordHash,
      name: 'Administrador Maestro',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log(`[Seed] Admin user created/verified: ${adminUser.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
