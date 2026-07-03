const API_URL = 'http://localhost:3000';
let adminToken = '';
let productId = '';
let depAId = '';
let depBId = '';

async function runTest() {
  console.log('--- Iniciando QA Smoke Test ---');

  try {
    // 0. Autenticación
    console.log('0. Autenticando (admin@stockflow.local)...');
    let res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@stockflow.local', password: 'admin123' })
    });
    let data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error login');
    adminToken = data.accessToken;
    console.log('✅ Autenticado.');

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };

    // Pre-requisito: Obtener IDs de Productos y Depósitos
    console.log('-> Obteniendo catálogo...');
    res = await fetch(`${API_URL}/products?limit=100`, { headers });
    data = await res.json();
    console.log('Products response:', data);
    let productList = Array.isArray(data) ? data : (data.data || []);
    let notebookPro = productList.find(p => p.name.includes('Notebook Pro'));
    
    if (!notebookPro) {
      console.log('⚠️ Producto no encontrado, creando "Notebook Pro"...');
      res = await fetch(`${API_URL}/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sku: 'TEST-NOTEBOOK-PRO',
          name: 'Notebook Pro QA',
          category: 'QA-Electronics',
          description: 'Test Product',
          price: 1500,
          costPrice: 1000,
          minStock: 5,
          targetStock: 20
        })
      });
      data = await res.json();
      if (!res.ok) throw new Error(`Error creando producto: ${JSON.stringify(data)}`);
      notebookPro = data;
    }
    productId = notebookPro.id;
    console.log(`✅ Producto OK: ${notebookPro.name} (${productId})`);

    res = await fetch(`${API_URL}/warehouses?limit=100`, { headers });
    data = await res.json();
    let whList = Array.isArray(data) ? data : data.data;
    let depA = whList.find(w => w.name.includes('DEP-A'));
    let depB = whList.find(w => w.name.includes('DEP-B'));

    if (!depA) {
      console.log('⚠️ DEP-A no encontrado, creando...');
      res = await fetch(`${API_URL}/warehouses`, { method: 'POST', headers, body: JSON.stringify({ name: 'DEP-A QA', code: 'DEP-A-QA', location: 'Loc A', capacity: 1000 }) });
      data = await res.json();
      if (!res.ok) throw new Error(`Error creando DEP-A: ${JSON.stringify(data)}`);
      depA = data;
    }
    if (!depB) {
      console.log('⚠️ DEP-B no encontrado, creando...');
      res = await fetch(`${API_URL}/warehouses`, { method: 'POST', headers, body: JSON.stringify({ name: 'DEP-B QA', code: 'DEP-B-QA', location: 'Loc B', capacity: 1000 }) });
      data = await res.json();
      if (!res.ok) throw new Error(`Error creando DEP-B: ${JSON.stringify(data)}`);
      depB = data;
    }
    depAId = depA.id;
    depBId = depB.id;
    console.log(`✅ Depósitos OK: DEP-A (${depAId}) | DEP-B (${depBId})`);

    // Paso 1: Creación del Lote
    console.log('\n--- Paso 1: Creación del Lote ---');
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 10);
    
    res = await fetch(`${API_URL}/batches`, {
      method: 'POST', headers,
      body: JSON.stringify({
        batchNumber: `LOTE-QA-${Date.now().toString().slice(-4)}`,
        productId: productId,
        initialQuantity: 3,
        expiryDate: expiryDate.toISOString(),
        manufacturingDate: new Date().toISOString()
      })
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Error creando lote: ${JSON.stringify(data)}`);
    const batchId = data.id;
    const batchNumber = data.batchNumber;
    console.log(`✅ Lote creado: ${batchNumber} (${batchId})`);

    res = await fetch(`${API_URL}/batches`, { headers });
    data = await res.json();
    const batchList = data.find(b => b.id === batchId);
    if (!batchList) throw new Error('El lote no aparece en la lista');
    const diffDays = Math.ceil((new Date(batchList.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    console.log(`✅ Vencimiento a ${diffDays} días (Debe ser <= 15 para Crítico)`);

    // Paso 2: Ingreso (Inbound) Atómico con Series
    console.log('\n--- Paso 2: Ingreso Atómico con Series ---');
    const snPrefix = Date.now().toString().slice(-4);
    const sn1 = `SN-${snPrefix}-1`;
    const sn2 = `SN-${snPrefix}-2`;
    const sn3 = `SN-${snPrefix}-3`;

    res = await fetch(`${API_URL}/stock/movement`, {
      method: 'POST', headers,
      body: JSON.stringify({
        type: 'INBOUND',
        productId: productId,
        warehouseId: depAId,
        quantity: 3,
        batchId: batchId,
        reference: 'QA-INBOUND-001',
        serialNumbers: [sn1, sn2, sn3]
      })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error INBOUND');
    console.log('✅ INBOUND exitoso con series.');

    // Paso 3: Auditoría Bidireccional
    console.log('\n--- Paso 3: Auditoría Bidireccional ---');
    res = await fetch(`${API_URL}/batches/${batchId}`, { headers });
    const batchDetail = await res.json();
    console.log('Batch Detail:', JSON.stringify(batchDetail, null, 2));
    const stockDepA = batchDetail.batchStocks.find(s => s.warehouseId === depAId);
    if (!stockDepA || Number(stockDepA.quantity) !== 3) throw new Error(`Stock no refleja 3 unidades en DEP-A para el lote. Cantidad real: ${stockDepA ? stockDepA.quantity : 'No encontrado'}`);
    console.log('✅ Stock actual en DEP-A correcto (3 unidades).');

    res = await fetch(`${API_URL}/batches/${batchId}/movements`, { headers });
    data = await res.json();
    if (data.data.length < 1) throw new Error('No se reflejan movimientos en el lote.');
    console.log('✅ Tabla de movimientos refleja el INBOUND.');

    res = await fetch(`${API_URL}/batches/${batchId}/serial-numbers`, { headers });
    data = await res.json();
    console.log('Serial Numbers API Response:', JSON.stringify(data, null, 2));
    const availableSns = data.data.filter(s => s.status.toLowerCase() === 'available');
    if (availableSns.length !== 3) throw new Error(`Series en status AVAILABLE: ${availableSns.length}, esperado 3`);
    console.log('✅ Tabla de series refleja las 3 series como AVAILABLE.');

    // Paso 4: Fallo de Integridad
    console.log('\n--- Paso 4: Fallo de Integridad (Escudo Backend) ---');
    res = await fetch(`${API_URL}/stock/movement`, {
      method: 'POST', headers,
      body: JSON.stringify({
        type: 'INBOUND',
        productId: productId,
        warehouseId: depAId,
        quantity: 1,
        batchId: batchId,
        reference: 'QA-INBOUND-DUPLICATE',
        serialNumbers: [sn1] // ya existe
      })
    });
    data = await res.json();
    if (res.status === 409 || res.status === 400) {
      console.log(`✅ Backend atajó el error correctamente: ${res.status} - ${data.message}`);
    } else {
      throw new Error(`El backend PERMITIÓ registrar un SN duplicado! O error inesperado: ${res.status} ${data.message}`);
    }

    // Paso 5: Transferencia Lógica de Series
    console.log('\n--- Paso 5: Transferencia Lógica de Series ---');
    res = await fetch(`${API_URL}/stock/transfer`, {
      method: 'POST', headers,
      body: JSON.stringify({
        productId: productId,
        fromWarehouseId: depAId,
        toWarehouseId: depBId,
        quantity: 1,
        batchId: batchId,
        reference: 'QA-TRANSFER-001',
        serialNumbers: [sn3]
      })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error en TRANSFER');
    console.log('✅ TRANSFER ejecutada.');
    
    // Consultar ubicación de SN3
    res = await fetch(`${API_URL}/serial-numbers/${sn3}/history`, { headers });
    data = await res.json();
    if (data.warehouseId !== depBId) throw new Error('La serie SN3 no se movió a DEP-B');
    console.log('✅ SN3 verificado en DEP-B.');

    // Paso 6: FEFO y Salida (Outbound)
    console.log('\n--- Paso 6: FEFO y Salida (Outbound) ---');
    res = await fetch(`${API_URL}/stock/fefo-suggestion?productId=${productId}&warehouseId=${depAId}&quantity=1`, { headers });
    data = await res.json();
    console.log(`Sugerencia FEFO: Lote ID ${data.suggestedBatch?.id || 'Ninguna'}`);
    
    res = await fetch(`${API_URL}/stock/movement`, {
      method: 'POST', headers,
      body: JSON.stringify({
        type: 'OUTBOUND',
        productId: productId,
        warehouseId: depAId,
        quantity: 1,
        batchId: batchId,
        reference: 'QA-OUTBOUND-001',
        serialNumbers: [sn1]
      })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error en OUTBOUND');
    console.log('✅ OUTBOUND exitoso.');

    // Paso 7: Trazabilidad Final de Serie
    console.log('\n--- Paso 7: Trazabilidad Final de Serie ---');
    res = await fetch(`${API_URL}/serial-numbers/${sn1}/history`, { headers });
    data = await res.json();
    if (data.status.toLowerCase() !== 'consumed') throw new Error(`El estado de SN1 es ${data.status}, esperado consumed`);
    if (!data.outboundMovementId) throw new Error('No se registró movimiento de salida para SN1');
    console.log('✅ SN1 marcado como CONSUMED y refleja movimiento de salida.');

    console.log('\n🎉 SMOKE TEST COMPLETADO CON ÉXITO! TODO FUNCIONA COMO LA SEDA.');
  } catch (error) {
    console.error('\n❌ ERROR EN EL SMOKE TEST:', error.message);
    process.exit(1);
  }
}

runTest();
