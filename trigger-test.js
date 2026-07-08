require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');
const crypto = require('crypto');

const prisma = new PrismaClient();
const webhooksQueue = new Queue('webhooks', {
  connection: { host: 'localhost', port: 6379 }
});

async function main() {
  console.log('--- Iniciando Prueba E2E de Webhooks ---');

  // 1. Encontrar al admin
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No admin found');

  // 2. Limpiar suscripciones previas de test
  const subs = await prisma.webhookSubscription.findMany({
    where: { url: 'http://127.0.0.1:3001/webhook-receiver' }
  });
  const subIds = subs.map(s => s.id);
  
  if (subIds.length > 0) {
    await prisma.webhookDelivery.deleteMany({
      where: { subscriptionId: { in: subIds } }
    });
    await prisma.webhookSubscription.deleteMany({
      where: { id: { in: subIds } }
    });
  }

  // 3. Crear una suscripcion (simulando el request)
  console.log('1. Creando suscripcion...');
  console.log('KEY loaded?', !!process.env.WEBHOOK_ENCRYPTION_KEY, process.env.WEBHOOK_ENCRYPTION_KEY ? process.env.WEBHOOK_ENCRYPTION_KEY.substring(0, 4) : 'undefined');
  const ENCRYPTION_KEY = Buffer.from(process.env.WEBHOOK_ENCRYPTION_KEY, 'hex');
  const secret = 'mi-secret-super-seguro-123';
  
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedSecret = `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
  console.log('Encrypted secret:', encryptedSecret);

  const sub = await prisma.webhookSubscription.create({
    data: {
      url: 'http://127.0.0.1:3001/webhook-receiver',
      events: ['movement_created', 'stock_low'],
      isActive: true,
      createdById: admin.id,
      encryptedSecret,
    }
  });
  console.log(`   Suscripcion creada: \${sub.id}`);

  console.log('2. Disparando evento de prueba en BullMQ...');
  await webhooksQueue.add('test_event', {
    subscriptionId: sub.id,
    url: sub.url,
    encryptedSecret: sub.encryptedSecret,
    event: 'movement_created',
    payload: { message: 'Ping de prueba desde CLI', timestamp: new Date().toISOString() }
  }, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },
  });
  
  console.log('3. Evento encolado! Observa la terminal de NestJS y del mock-webhook-server.');
  await prisma.$disconnect();
  await webhooksQueue.close();
}

main().catch(console.error);
