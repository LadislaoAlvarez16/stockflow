const fs = require('fs');
const cp = require('child_process');

const url = "postgresql://user:password@localhost:5432/stockflow";
const schema = "prisma/schema.prisma";

try {
  const diff = cp.execSync(`npx prisma migrate diff --from-url "${url}" --to-schema-datamodel "${schema}" --script`, { encoding: 'utf8' });
  const finalSql = diff;
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0,14);
  const dir = `prisma/migrations/${timestamp}_add_serial_numbers`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/migration.sql`, finalSql, 'utf8');
  console.log("migration.sql created successfully in " + dir);
} catch(e) {
  console.error("Error:", e.stdout || e.message);
}
