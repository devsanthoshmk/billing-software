import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Resolve database storage path (supports environment override)
const DB_FILE_PATH = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'siva_erp.db');

// Ensure parent directory exists
const dbDir = path.dirname(DB_FILE_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Global declaration for HMR persistence across Next.js reloads
declare global {
  var _sivaSqlite: Database.Database | undefined;
  var _sivaDrizzle: BetterSQLite3Database<typeof schema> | undefined;
}

function initializeDatabase() {
  const sqlite = new Database(DB_FILE_PATH, {
    fileMustExist: false,
    timeout: 5000,
    verbose: process.env.DB_LOGGING === 'true' ? console.log : undefined,
  });

  // Critical SQLite Performance & Integrity PRAGMAs
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('cache_size = -64000'); // 64 MB cache
  sqlite.pragma('temp_store = MEMORY');

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

if (process.env.NODE_ENV === 'production') {
  const conn = initializeDatabase();
  sqlite = conn.sqlite;
  db = conn.db;
} else {
  if (!global._sivaSqlite || !global._sivaDrizzle) {
    const conn = initializeDatabase();
    global._sivaSqlite = conn.sqlite;
    global._sivaDrizzle = conn.db;
  }
  sqlite = global._sivaSqlite;
  db = global._sivaDrizzle;
}

// Clean shutdown hook
function closeDatabase() {
  if (sqlite && sqlite.open) {
    sqlite.close();
  }
}
process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);

// Prepared Statement Cache for custom or high-frequency raw SQL
const statementCache = new Map<string, Database.Statement>();

export function getPreparedStatement(sqlQuery: string): Database.Statement {
  let stmt = statementCache.get(sqlQuery);
  if (!stmt) {
    stmt = sqlite.prepare(sqlQuery);
    statementCache.set(sqlQuery, stmt);
  }
  return stmt;
}

export { db, sqlite, schema };
export type DatabaseInstance = typeof db;
export default db;
