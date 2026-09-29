# PostgreSQL Migration Architecture & Procedure
## Siva Wholesale & Pharmacy ERP — Next.js Replica

> **Target Version**: Next.js 16.3.6 (Turbopack)  
> **ORM**: Drizzle ORM (`drizzle-orm`)  
> **Source Engine**: SQLite (`better-sqlite3`) in WAL mode (`data/siva_erp.db`)  
> **Target Engine**: PostgreSQL 15+ (Local, Neon, Supabase, or AWS RDS / Aurora)  

---

## 1. Architectural Portability Principles

The Siva Pharmacy ERP database layer is architecturally decoupled from the underlying SQL engine:

1. **Agnostic Application Query Builder**:
   All business logic queries (`src/lib/business-engine/`, server actions, API routes, and UI components) utilize Drizzle ORM's unified query builder (`db.select()`, `db.query.*`, `db.insert()`, `db.update()`, `db.transaction()`) and relational operators (`eq`, `and`, `or`, `inArray`, `desc`, `sql`). Because Drizzle transpiles these expressions into dialect-specific SQL at runtime, **not a single line of application business logic needs to change when moving from SQLite to PostgreSQL**.

2. **Normalized 3rd-Normal-Form Relations**:
   Legacy FoxPro denormalized structures (such as the 9 fixed batch slots `BAT1..9`, `EXP1..9`, `PRATE1..9` in `MEDIMAST.DAT`) have been normalized into clean 1-to-many tables (`products` $\to$ `product_batches`). Both SQLite and PostgreSQL natively enforce foreign keys (`ON DELETE RESTRICT`, `ON DELETE CASCADE`), indexes, and unique constraints.

3. **Topological Ingestion Order**:
   All tables follow strict parent-before-child topological dependency hierarchies, allowing batch data transfer from SQLite to PostgreSQL without constraint violation errors.

---

## 2. Dialect Mapping Matrix (SQLite vs. PostgreSQL)

The table below documents the exact equivalence between SQLite primitives used in `src/lib/db/schema/*.ts` and their PostgreSQL counterparts:

| Domain Concept | TypeScript Type | SQLite (`drizzle-orm/sqlite-core`) | PostgreSQL (`drizzle-orm/pg-core`) | Portability Notes |
|---|---|---|---|---|
| **Primary Keys (UUID / Code)** | `string` | `text('id').primaryKey()` | `text('id').primaryKey()` or `uuid('id').defaultRandom().primaryKey()` | UUID string representation is 100% identical across engines. |
| **Unique Codes** | `string` | `text('code').notNull().unique()` | `varchar('code', { length: 50 }).notNull().unique()` or `text('code')` | PostgreSQL handles `text` and `varchar` with equal speed. |
| **Monetary Amounts & Rates** | `number` | `real('rate').notNull()` | `numeric('rate', { precision: 12, scale: 2 }).notNull()` | In SQLite, `real` stores IEEE 754 floats. In PostgreSQL, `numeric` stores exact fixed-point currency decimals. Both serialize to JS numbers. |
| **Physical Quantities** | `number` | `integer('quantity').notNull()` | `integer('quantity').notNull()` | Exact 1-to-1 syntax match. |
| **Booleans** | `boolean` | `integer('is_active', { mode: 'boolean' })` | `boolean('is_active').notNull()` | Drizzle's SQLite `{ mode: 'boolean' }` uses `0/1` integers in SQLite and native booleans in PostgreSQL. In TS, both are `boolean`. |
| **Calendar Dates** | `string` (`YYYY-MM-DD`) | `text('invoice_date').notNull()` | `date('invoice_date').notNull()` or `text('invoice_date').notNull()` | Standard ISO-8601 strings work identically in both engines. |
| **Timestamps** | `string` | `text('created_at').default(sql\`CURRENT_TIMESTAMP\`)` | `timestamp('created_at').defaultNow()` | Both produce standard ISO timestamp strings. |
| **JSON Metadata** | `Record<string, unknown>` | `text('metadata', { mode: 'json' })` | `jsonb('metadata')` | Both serialize and deserialize standard JS objects. |
| **Foreign Keys** | `string` | `.references(() => parentTable.id, { onDelete: 'cascade' })` | `.references(() => parentTable.id, { onDelete: 'cascade' })` | 100% Identical Drizzle syntax. |
| **Table Relations** | `Relations` | `relations(table, ({ one, many }) => (...))` | `relations(table, ({ one, many }) => (...))` | 100% Identical Drizzle syntax. |

---

## 3. Concrete Schema Comparison

### 3.1 Master Products & Batches

#### SQLite (`drizzle-orm/sqlite-core`):
```typescript
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  code: text('code', { length: 10 }).notNull().unique(),
  name: text('name', { length: 100 }).notNull(),
  companyId: text('company_id').notNull().references(() => companies.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const productBatches = sqliteTable('product_batches', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  batchNo: text('batch_no', { length: 30 }).notNull(),
  expiryDate: text('expiry_date').notNull(),
  purchaseRate: real('purchase_rate').notNull(),
  sellingRate: real('selling_rate').notNull(),
  mrp: real('mrp').notNull(),
  stockQty: integer('stock_qty').notNull().default(0),
});
```

#### PostgreSQL (`drizzle-orm/pg-core`):
```typescript
import { pgTable, text, numeric, integer, boolean } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  companyId: text('company_id').notNull().references(() => companies.id),
  isActive: boolean('is_active').notNull().default(true),
});

export const productBatches = pgTable('product_batches', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  batchNo: text('batch_no').notNull(),
  expiryDate: text('expiry_date').notNull(),
  purchaseRate: numeric('purchase_rate', { precision: 12, scale: 2 }).notNull(),
  sellingRate: numeric('selling_rate', { precision: 12, scale: 2 }).notNull(),
  mrp: numeric('mrp', { precision: 12, scale: 2 }).notNull(),
  stockQty: integer('stock_qty').notNull().default(0),
});
```

---

## 4. Step-by-Step PostgreSQL Migration Procedure

### Step 1: Install PostgreSQL Driver
```bash
npm install pg @types/pg
```

### Step 2: Update `drizzle.config.ts`
Modify `drizzle.config.ts` to switch the dialect to `postgresql`:
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle/pg-migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_PG_URL || 'postgresql://postgres:postgres@localhost:5432/siva_erp',
  },
  verbose: true,
  strict: true,
});
```

### Step 3: Switch Schema Imports
Change table declarations in `src/lib/db/schema/*.ts` from `drizzle-orm/sqlite-core` to `drizzle-orm/pg-core` using the dialect mapping matrix in Section 2.

### Step 4: Generate PostgreSQL DDL Migrations
```bash
npx drizzle-kit generate
```
This generates standard PostgreSQL DDL scripts (with native sequences, schemas, and constraints).

### Step 5: Execute Data Migration Script
Execute the provided automated data migration script:
```bash
DATABASE_PG_URL=postgresql://user:password@localhost:5432/siva_erp npx tsx src/lib/db/migrate-to-pg.ts
```
The migration script automatically streams all existing records from `data/siva_erp.db` into PostgreSQL in topological dependency order.

### Step 6: Switch Database Connection Singleton
Update `src/lib/db/index.ts` to instantiate Drizzle using the PostgreSQL pool driver:
```typescript
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_PG_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });
export default db;
```

---

## 5. Automated Data Migration Script (`src/lib/db/migrate-to-pg.ts`)

An automated data pipeline is included in `src/lib/db/migrate-to-pg.ts` which:
1. Reads all tables directly from `data/siva_erp.db` via `better-sqlite3`.
2. Connects to PostgreSQL using `pg.Pool`.
3. Ingests data in topological order (Tax slabs $\to$ Companies $\to$ Salesmen $\to$ Areas $\to$ Doctors $\to$ Suppliers $\to$ Customers $\to$ Products $\to$ Batches $\to$ Invoices $\to$ Invoice Items $\to$ Purchases $\to$ Ledgers).
4. Handles conflict resolution via `ON CONFLICT DO NOTHING`.
