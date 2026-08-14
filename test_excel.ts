import * as ExcelJS from 'exceljs';

async function test() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');
  
  // Add some data
  worksheet.addRow(['sku', 'counted_quantity', 'notes']);
  worksheet.addRow(['PROD-1', 10, 'Some note']);
  
  type InventoryRowRaw = Record<string, string | number | null>;
  const rawRows: InventoryRowRaw[] = [];
  let headers: string[] = [];

  worksheet.eachRow({ includeEmpty: true }, (row: ExcelJS.Row, rowNumber: number) => {
    const values = row.values as any[];
    console.log(`Row ${rowNumber} values:`, values);
    console.log(`Row ${rowNumber} length:`, values.length);
    if (rowNumber === 1) {
      headers = values.map(v => (v ? v.toString() : ''));
      console.log('Headers generated:', headers);
    } else {
      const rowData: InventoryRowRaw = {};
      for (let i = 1; i < headers.length; i++) {
        if (headers[i]) {
          rowData[headers[i]] = values[i] === undefined ? null : values[i];
        }
      }
      rawRows.push(rowData);
    }
  });

  console.log('Final rawRows:', rawRows);
}

test().catch(console.error);
