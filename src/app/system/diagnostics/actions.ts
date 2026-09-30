'use server';

import { sqlite } from '@/lib/db';

export async function runDatabaseDiagnostics() {
  try {
    // 1. SQLite PRAGMA checks
    const integrityCheck = sqlite.prepare('PRAGMA integrity_check').all();
    const foreignKeyCheck = sqlite.prepare('PRAGMA foreign_key_check').all();

    // 2. Count table records
    const counts = {
      taxSlabs: sqlite.prepare('SELECT count(*) as count FROM tax_slabs').get(),
      companies: sqlite.prepare('SELECT count(*) as count FROM companies').get(),
      salesmen: sqlite.prepare('SELECT count(*) as count FROM salesmen').get(),
      areas: sqlite.prepare('SELECT count(*) as count FROM areas').get(),
      customers: sqlite.prepare('SELECT count(*) as count FROM customers').get(),
      suppliers: sqlite.prepare('SELECT count(*) as count FROM suppliers').get(),
      products: sqlite.prepare('SELECT count(*) as count FROM products').get(),
      batches: sqlite.prepare('SELECT count(*) as count FROM product_batches').get(),
      invoices: sqlite.prepare('SELECT count(*) as count FROM invoices').get(),
      invoiceItems: sqlite.prepare('SELECT count(*) as count FROM invoice_items').get(),
      purchases: sqlite.prepare('SELECT count(*) as count FROM purchases').get(),
      receipts: sqlite.prepare('SELECT count(*) as count FROM customer_receipts').get(),
      payments: sqlite.prepare('SELECT count(*) as count FROM supplier_payments').get(),
    };

    // 3. Check for orphaned batches (batches without a valid product)
    const orphanedBatches = sqlite
      .prepare('SELECT count(*) as count FROM product_batches WHERE product_id NOT IN (SELECT id FROM products)')
      .get() as any;

    return {
      success: true,
      integrityPassed: integrityCheck.length === 1 && (integrityCheck[0] as any).integrity_check === 'ok',
      foreignKeysValid: foreignKeyCheck.length === 0,
      tableCounts: counts,
      orphanedBatchesCount: orphanedBatches?.count || 0,
      timestamp: new Date().toLocaleString(),
    };
  } catch (err: any) {
    console.error('runDatabaseDiagnostics error:', err);
    return { success: false, error: err.message };
  }
}
