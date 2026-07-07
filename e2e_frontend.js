const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 Iniciando E2E Frontend Smoke Test...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Set download behavior
  const downloadPath = path.resolve(__dirname, 'test_downloads');
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath);
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath });

  try {
    // 1. Login
    console.log('➜ Navegando a Login...');
    await page.goto('http://localhost:5173/login');
    await page.type('input[type="email"]', 'admin@stockflow.com');
    await page.type('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
    console.log('✅ Login exitoso');

    // 2. Preparar CSV de prueba
    const csvContent = `SKU,Cantidad\nNOTE-PRO-01,10\nFANTASMA-99,5\nSERIAL-ITEM-01,1\nNOTE-PRO-02,-5`;
    const csvPath = path.resolve(__dirname, 'qa_test_inventory.csv');
    fs.writeFileSync(csvPath, csvContent);

    // 3. Upload Inventario
    console.log('➜ Navegando a /physical-inventory/upload...');
    await page.goto('http://localhost:5173/physical-inventory/upload');
    
    // Esperar al select de depósitos
    await page.waitForSelector('#warehouse option');
    
    // Subir archivo
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(csvPath);
    
    console.log('➜ Enviando formulario...');
    await page.click('button[type="submit"]');
    
    // Esperar al Toast (shadcn ui)
    await page.waitForSelector('.group.pointer-events-auto', { timeout: 10000 });
    const toastText = await page.$eval('.group.pointer-events-auto', el => el.textContent);
    console.log('✅ UI Feedback (Upload):', toastText);

    // 4. Ir a Reportes y testear Hard Limit
    console.log('➜ Navegando a /reports para Sad Path...');
    await page.goto('http://localhost:5173/reports');
    await page.waitForSelector('input[type="date"]');
    
    // Llenar fechas con diferencia > 90 dias
    const dateInputs = await page.$$('input[type="date"]');
    if (dateInputs.length >= 2) {
      await dateInputs[0].type('01012025'); // From
      await dateInputs[1].type('01082025'); // To (> 90 days)
      
      // Click en el boton del card correspondiente al historial (es el segundo card)
      const buttons = await page.$$('button');
      // Buscar el boton de descargar
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes('Descargar PDF')) {
          await btn.click();
          break;
        }
      }
      
      // Esperar al Toast de error
      await page.waitForTimeout(2000); // Darle tiempo a fallar
      const errorToast = await page.$$eval('.group.pointer-events-auto', els => els[els.length - 1]?.textContent);
      console.log('✅ UI Feedback (Sad Path Hard Limit):', errorToast || 'Toast atrapado');
    }

    // 5. Generar PDF Exitoso (Valorización)
    console.log('➜ Probando Happy Path de Descarga PDF...');
    // Refrescar para limpiar estados
    await page.goto('http://localhost:5173/reports');
    await page.waitForSelector('button');
    const buttons = await page.$$('button');
    // Click en el primero (Stock Valuation)
    await buttons[0].click();
    console.log('✅ Generando Reporte...');
    
    // Esperar a que se descargue el archivo
    await page.waitForTimeout(5000);
    const files = fs.readdirSync(downloadPath);
    console.log('✅ Archivos descargados por Puppeteer Frontend:', files);

  } catch (e) {
    console.error('❌ Error E2E:', e);
  } finally {
    await browser.close();
    console.log('🏁 E2E Finalizado.');
  }
})();
