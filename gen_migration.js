const fs = require('fs');
const cp = require('child_process');

const url = "postgresql://user:password@localhost:5432/stockflow";
const schema = "prisma/schema.prisma";

try {
  const diff = cp.execSync(`npx prisma migrate diff --from-url "${url}" --to-schema-datamodel "${schema}" --script`, { encoding: 'utf8' });
  const finalSql = diff + '\nALTER TABLE "batch_stocks" ADD CONSTRAINT "batch_stocks_quantity_non_negative" CHECK (quantity >= 0);\n';
  fs.writeFileSync('prisma/migrations/20260627124300_add_batches_and_batch_stocks/migration.sql', finalSql, 'utf8');
  console.log("migration.sql created successfully");
} catch(e) {
  console.error("Error:", e.stdout || e.message);
}
