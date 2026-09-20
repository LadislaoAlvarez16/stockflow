import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const WEAK = new Set(['admin123', 'password123', 'changeme', '12345678']);

async function main() {
  const prisma = new PrismaClient();
  try {
    const admins = await prisma.user.count({ where: { role: UserRole.ADMIN } });
    if (admins > 0) { console.log('[bootstrap-admin] Ya existe un ADMIN. Nada que hacer.'); return; }
    const email = process.env.INITIAL_ADMIN_EMAIL?.trim();
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!email || !password) {
      console.warn('[bootstrap-admin] No hay ADMIN y faltan INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD.');
      return;
    }
    if (password.length < 12 || WEAK.has(password.toLowerCase())) {
      throw new Error('INITIAL_ADMIN_PASSWORD debe tener al menos 12 caracteres y no ser común.');
    }
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new Error('Ya existe un usuario con ese email y no es ADMIN. No se modifica.');
    }
    await prisma.user.create({
      data: {
        email,
        name: process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrador',
        passwordHash: await bcrypt.hash(password, 10),
        role: UserRole.ADMIN,
      },
    });
    console.log(`[bootstrap-admin] ADMIN creado: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('[bootstrap-admin]', e instanceof Error ? e.message : e); process.exit(1); });
