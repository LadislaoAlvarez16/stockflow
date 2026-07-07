const fs = require('fs');

async function run() {
  const API_URL = 'http://localhost:3000';
  let token = '';

  try {
    console.log('--- Iniciando Test ETL Inventario Físico ---');
    
    // 0. Autenticación
    console.log('0. Autenticando (admin@stockflow.local)...');
    let res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stockflow.com', password: 'password123' })
    });
    if (!res.ok) throw new Error('Fallo login');
    const authData = await res.json();
    console.log('AUTH DATA:', authData);
    token = authData.accessToken || authData.token;
    if (!token) throw new Error('Token is missing');
    const headers = { 'Authorization': `Bearer ${token}` };
    console.log('✅ Autenticado.');

    // 1. Preparar Entorno (Depósito y Productos)
    console.log('\n1. Preparando entorno de pruebas con datos existentes...');
    const whRes = await fetch(`${API_URL}/warehouses`, { headers });
    const whsData = await whRes.json();
    console.log('WHSDATA:', whsData);
    const whs = whsData.items || whsData;
    const warehouseId = whs[0].id;
    console.log(`✅ Depósito seleccionado: ${whs[0].name} (${warehouseId})`);

    const pRes = await fetch(`${API_URL}/products`, { headers });
    const prodsData = await pRes.json();
    const allProds = prodsData.data || prodsData;
    
    // Necesitamos al menos 4 productos para la prueba.
    const createdProds = allProds.slice(0, 4);
    console.log(`✅ ${createdProds.length} productos seleccionados.`);

    // Setear el 4to producto como serializado
    await fetch(`${API_URL}/products/${createdProds[3].id}`, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasSerialNumbers: true })
    });

    // Agregar stock inicial a prod 0 y 2
    console.log('-> Agregando stock inicial...');
    await fetch(`${API_URL}/stock/adjustment`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: createdProds[0].id, warehouseId, operation: 'ADD', quantity: 5, notes: 'Init' })
    });
    await fetch(`${API_URL}/stock/adjustment`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: createdProds[2].id, warehouseId, operation: 'ADD', quantity: 5, notes: 'Init' })
    });

    // 2. Generar archivo CSV
    console.log('\n2. Generando archivo CSV...');
    const csvLines = [
      'sku,counted_quantity,batch_number,notes',
      `${createdProds[0].sku},5,,coincide exacto`, // MATCH (system=5, counted=5)
      `${createdProds[1].sku},10,,sobran 10`,      // ADD (system=0, counted=10)
      `${createdProds[2].sku},3,,faltan 2`,        // SUB (system=5, counted=3)
      `SKU-FANTASMA-999,99,,no existe`,// SKIP (SKU no existe)
      `SKU-MAL-CANTIDAD, -5,,cantidad negativa`,   // ERROR ZOD
      `${createdProds[3].sku},1,,serializado`,     // SKIP (hasSerialNumbers: true)
    ];
    const csvContent = csvLines.join('\n');
    fs.writeFileSync('inventario.csv', csvContent);
    console.log('✅ Archivo inventario.csv generado.');

    // 3. Subir archivo (multipart/form-data)
    console.log('\n3. Ejecutando ETL (POST /physical-inventory)...');
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    formData.append('file', blob, 'inventario.csv');
    formData.append('warehouseId', warehouseId);

    const uploadRes = await fetch(`${API_URL}/physical-inventory`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // IMPORTANTE: NO mandar Content-Type, fetch lo pone automáticamente con el boundary
      },
      body: formData
    });

    const uploadResult = await uploadRes.json();
    console.log('Respuesta:', JSON.stringify(uploadResult, null, 2));

    if (!uploadRes.ok) throw new Error('Fallo la carga');

    // 4. Auditoría
    console.log('\n4. Auditoría de sesión...');
    const sessionId = uploadResult.session.id;
    const sessionRes = await fetch(`${API_URL}/physical-inventory/${sessionId}`, { headers });
    const sessionData = await sessionRes.json();
    
    console.log('Estado Final de Sesión:', sessionData.status);
    console.log('Matched:', sessionData.matchedItems, '(Esperado: 1)');
    console.log('Adjusted:', sessionData.adjustedItems, '(Esperado: 2)');
    console.log('Skipped:', sessionData.skippedItems, '(Esperado: 2)'); // fantasma y serializado
    console.log('Error Log Length:', sessionData.errorLog ? sessionData.errorLog.length : 0, '(Esperado: 3)'); 

    const adjRes = await fetch(`${API_URL}/physical-inventory/${sessionId}/adjustments`, { headers });
    const adjData = await adjRes.json();
    console.log(`\n✅ ${adjData.length} movimientos de ADJUSTMENT generados y vinculados a la sesión.`);

    console.log('\n🎉 TEST ETL COMPLETADO CON ÉXITO');

  } catch (error) {
    console.error('\n❌ ERROR EN EL TEST:', error);
    process.exit(1);
  }
}

run();
