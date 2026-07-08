const express = require('express');
const crypto = require('crypto');

const app = express();
const port = 3001;

// Obtenemos el secret crudo que le dimos a la suscripcion de prueba
// (Lo definiremos al crear la suscripcion en el script de test)
const SECRET = 'mi-secret-super-seguro-123'; 

let attemptCount = 0;

// Middleware para capturar el raw body exacto para la validacion HMAC
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.post('/webhook-receiver', (req, res) => {
  attemptCount++;
  console.log(`\n[Mock Server] 📥 Webhook recibido (Intento ${attemptCount})`);
  console.log(`[Mock Server] Headers:`, {
    signature: req.headers['x-stockflow-signature'],
    event: req.headers['x-stockflow-event'],
    delivery: req.headers['x-stockflow-delivery'],
    timestamp: req.headers['x-stockflow-timestamp'],
  });

  // Validar firma
  const providedSignature = req.headers['x-stockflow-signature']?.replace('sha256=', '');
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(req.rawBody);
  const expectedSignature = hmac.digest('hex');

  console.log(`[Mock Server] 🔐 Firma esperada : ${expectedSignature}`);
  console.log(`[Mock Server] 🔑 Firma recibida: ${providedSignature}`);

  if (expectedSignature !== providedSignature) {
    console.error(`[Mock Server] ❌ ERROR: Las firmas no coinciden!`);
    return res.status(401).send('Invalid signature');
  } else {
    console.log(`[Mock Server] ✅ EXITO: La firma HMAC-SHA256 coincide perfectamente.`);
  }

  // Forzar error en el primer intento para probar el backoff de BullMQ
  if (attemptCount === 1) {
    console.log(`[Mock Server] 💥 Forzando HTTP 500 para probar reintentos...`);
    return res.status(500).json({ error: 'Internal Server Error (Simulado)' });
  }

  console.log(`[Mock Server] 🟢 Respondiendo HTTP 200 OK.`);
  res.status(200).json({ message: 'Recibido correctamente' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`[Mock Server] Escuchando en http://127.0.0.1:\${port}`);
});
