import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@stockflow.com';
  
  // Verificamos si el admin ya existe
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const saltOrRounds = 10;
    const passwordHash = await bcrypt.hash('admin123', saltOrRounds);

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('✅ Admin user created successfully');
  } else {
    console.log('⚡ Admin user already exists');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
