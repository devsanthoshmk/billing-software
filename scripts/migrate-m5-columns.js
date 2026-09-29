const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'siva_erp.db');
const db = new Database(dbPath);

const newCols = [
  { name: 'cash_sales_amount', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'credit_sales_amount', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'cheque_sales_amount', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'total_payments_cash', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'total_payments_cheque', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'total_payments_bank', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'opening_cash_balance', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'closing_cash_balance', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'physical_cash_count', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'cash_difference', type: 'REAL NOT NULL DEFAULT 0' },
  { name: 'denomination_breakdown', type: 'TEXT' },
];

const existingCols = new Set(
  db.pragma('table_info(day_end_closings)').map(c => c.name)
);

for (const col of newCols) {
  if (!existingCols.has(col.name)) {
    console.log(`Adding column ${col.name} to day_end_closings...`);
    db.exec(`ALTER TABLE day_end_closings ADD COLUMN ${col.name} ${col.type}`);
  } else {
    console.log(`Column ${col.name} already exists.`);
  }
}

console.log('Migration complete. Columns:', db.pragma('table_info(day_end_closings)').map(c => c.name));
db.close();
process.exit(0);
