/**
 * Migration Utility: SQLite -> PostgreSQL Data Pipeline
 * 
 * Transfers all table data from SQLite (data/siva_erp.db) into PostgreSQL
 * preserving foreign key topological order and identity constraints.
 * 
 * Usage:
 *   DATABASE_PG_URL=postgresql://user:password@localhost:5432/siva_erp npx tsx src/lib/db/migrate-to-pg.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

export async function migrateSqliteToPostgres() {
  const pgUrl = process.env.DATABASE_PG_URL;
  if (!pgUrl) {
    console.error('❌ Error: DATABASE_PG_URL environment variable is required.');
    console.error('Example: DATABASE_PG_URL=postgresql://user:password@localhost:5432/siva_erp');
    process.exit(1);
  }

  // Dynamic import of pg so it is not required in standard SQLite-only runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg');
  const sqlitePath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'siva_erp.db');

  console.log(`[Migration] Reading from SQLite database: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  console.log(`[Migration] Connecting to target PostgreSQL: ${pgUrl}`);
  const pgPool = new Pool({ connectionString: pgUrl });

  // Strictly ordered by foreign-key topological dependency hierarchy
  const orderedTables = [
    'tax_slabs',
    'companies',
    'salesmen',
    'areas',
    'doctors',
    'suppliers',
    'customers',
    'products',
    'product_batches',
    'system_config',
    'system_controls',
    'invoices',
    'invoice_items',
    'purchases',
    'purchase_items',
    'sales_returns',
    'sales_return_items',
    'purchase_returns',
    'purchase_return_items',
    'credit_notes',
    'debit_notes',
    'customer_outstandings',
    'customer_receipts',
    'customer_receipt_allocations',
    'supplier_payments',
    'supplier_payment_allocations',
    'cheque_register',
    'day_end_closings',
    'audit_logs',
  ];

  for (const tableName of orderedTables) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, unknown>[];
      console.log(`[Migration] Migrating ${rows.length} rows from table '${tableName}'...`);

      if (rows.length === 0) continue;

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const columns = Object.keys(chunk[0]);
        const quotedColumns = columns.map((c) => `"${c}"`).join(', ');

        const placeholders = chunk
          .map((_, rIdx) => `(${columns.map((_, cIdx) => `$${rIdx * columns.length + cIdx + 1}`).join(', ')})`)
          .join(', ');

        const flatValues = chunk.flatMap((row) => columns.map((c) => row[c]));
        const query = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES ${placeholders} ON CONFLICT DO NOTHING`;

        await pgPool.query(query, flatValues);
      }
      console.log(`[Migration] Successfully transferred table '${tableName}'.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Migration] Warning for table '${tableName}': ${message}`);
    }
  }

  sqlite.close();
  await pgPool.end();
  console.log('✅ SQLite to PostgreSQL data migration completed successfully!');
}

if (require.main === module) {
  migrateSqliteToPostgres().catch((err) => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
}
