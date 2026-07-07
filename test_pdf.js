const fs = require('fs');

async function run() {
  const API_URL = 'http://localhost:3000';
  console.log('0. Autenticando (admin@stockflow.com)...');
  try {
    let res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stockflow.com', password: 'password123' })
    });
    if (!res.ok) throw new Error(`Fallo login: ${res.status} ${res.statusText}`);
    const authData = await res.json();
    const token = authData.accessToken || authData.token;
    if (!token) throw new Error('Token is missing');
    const headers = { 'Authorization': `Bearer ${token}` };
    console.log('✅ Autenticado.');

    console.log('1. Descargando reporte...');
    const reportRes = await fetch(`${API_URL}/reports/stock-valuation`, { headers });
    if (!reportRes.ok) throw new Error(`Fallo reporte: ${reportRes.status} ${reportRes.statusText}`);
    
    const buffer = await reportRes.arrayBuffer();
    fs.writeFileSync('reporte_prueba.pdf', Buffer.from(buffer));
    console.log('✅ PDF guardado exitosamente como reporte_prueba.pdf');
    console.log('Tamaño del archivo:', buffer.byteLength, 'bytes');
  } catch (e) {
    console.error('❌ ERROR:', e.message);
  }
}
run();
