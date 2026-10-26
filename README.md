# Medisys

A 1:1 modern web port of the legacy FoxPro wholesale pharmaceutical and distribution ERP. Built with Next.js App Router, SQLite (via `better-sqlite3` and Drizzle ORM in WAL mode), Tailwind CSS, and a zero-radius DOS terminal interface designed for rapid keyboard-only data entry.

---

## Quick Start

### Prerequisites
- Node.js 20.x or later
- npm (or pnpm / yarn)
- Python / C++ build tools (required automatically by `better-sqlite3` on some platforms)

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/devsanthoshmk/siva-erp.git
   cd siva-erp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Initialize and seed the SQLite database**
   ```bash
   npm run db:seed
   ```
   This automatically creates `data/siva_erp.db`, applies all Drizzle migrations, and populates master records (statutory GST tax slabs, sample products with batch schemes, customers, suppliers, and initial transactions).

4. **Start the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Default System Credentials

When prompted in supervisor gates, operator logins, or day-end closing:

| Role | Password / PIN | Description |
|------|----------------|-------------|
| **Supervisor / Admin** | `SPM` | Full administrative bypass, back-date overrides, price locks |
| **Manager** | `SPM` | Rate overrides and collection edits |
| **Billing Operator** | `SIVA` | Standard POS counter entry |

---

## Key Scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Starts Next.js development server with Turbopack |
| `npm run build` | Compiles the production build and type-checks routes |
| `npm start` | Runs the compiled production server |
| `npm test` | Runs the full Vitest suite (550+ tests) |
| `npm run db:seed` | Runs migrations and seeds the SQLite database |
| `npm run db:migrate` | Applies Drizzle migrations from `drizzle/migrations/` |
| `npm run db:generate` | Generates new migrations from schema definitions |
| `npm run db:push` | Pushes schema changes directly to the SQLite database |

---

## System Architecture

```text
├── src/
│   ├── app/                    # 51 Next.js App Router pages & server actions
│   │   ├── accounts/           # Collections, payments, cheques, ageing, on-account FIFO
│   │   ├── billing/            # POS invoicing, returns, delivery challans, credit/debit notes
│   │   ├── masters/            # Products, customers, suppliers, auxiliary, price lists
│   │   ├── reports/            # Daily sales, stock valuation, GST exports, salesman commissions
│   │   ├── stock/              # Inward purchase GRN, transfers, adjustments, rack management
│   │   └── system/             # Day/month/year-end closing, backup, Tally export, diagnostics
│   ├── components/
│   │   ├── layout/             # Header, Sidebar, StatusBar navigation components
│   │   ├── print/              # Dot-matrix 80-col & Thermal 40-col ESC/P preview modals
│   │   └── ui/                 # DOS-style windows, modals, datagrids, and form inputs
│   └── lib/
│       ├── business-engine/    # FoxPro calculation engine (V01-V28 vectors, tax split, FIFO)
│       ├── db/                 # Drizzle schemas, SQLite connection singleton, and seeder
│       ├── keyboard/           # Global keyboard listeners, Enter-key focus progression, F-keys
│       ├── print/              # ESC/POS and ESC/P formatting utilities for receipts & invoices
│       └── reports/            # SQL aggregation queries for statutory and audit reporting
├── drizzle/                    # SQL migration files and schema snapshots
├── data/                       # Local SQLite storage (siva_erp.db created on seed)
└── tests/                      # Vitest test suites (calculations, transactions, masters, UI)
```

---

## Core Features & Workflow

### 1. Point of Sale & Invoicing (`/billing/pos`)
- Scheme formula engine (e.g. 10+1 free bonus calculation)
- Automatic tax breakdown (CGST + SGST for intra-state, IGST for inter-state)
- Cash and trade discount tiered calculations
- Real-time stock reservation and batch expiry warnings
- Customer credit limit and drug license expiry enforcement

### 2. Purchase Inward & Inventory (`/stock/purchase`)
- GRN inward entry with batch allocation, MRP, purchase rate, and selling rates
- Multi-batch tracking with shelf-life / expiry surveillance
- Inter-depot stock transfers and discrepancy adjustments

### 3. Accounts & Ledger Engine (`/accounts`)
- Customer receipt vouchers with FIFO outstanding bill allocation
- Supplier payment vouchers with cheque printing register
- Overdue ageing analysis (0-30, 31-60, 61-90, 90+ days)
- On-account advance settlement

### 4. Statutory Reports & Exports (`/reports`, `/system`)
- GSTR-1 and GSTR-3B compliant JSON and CSV exports
- Daily sales summary and salesman commission ledger
- Expiry list tracking for slow-moving or nearing-expiry batches
- Tally Prime XML voucher and ledger synchronization

### 5. Hardware & Printing Integration
- Native dot-matrix 80-column invoice printing (Epson ESC/P)
- 40-column thermal slip printer formatting
- Browser print preview modal with monospace text alignment

---

## Keyboard Navigation

Designed for continuous 10-key numeric pad and keyboard-only operation:
- **`Enter`**: Advances focus to the next input field or submits modal actions
- **`Esc`**: Cancels entry, closes active modal, or steps back
- **`F1`–`F12`**: Triggers module shortcuts (e.g., F1 for Help/Search, F2 for Batch Picker, F8 for Print)
- **`Arrow Up / Down`**: Navigates rows inside data tables and batch selection grids

---

## Database Storage & Backup

- **Storage Engine**: SQLite with Write-Ahead Logging (WAL) and memory temp store for low-latency concurrent reads.
- **Database File**: Stored at `./data/siva_erp.db` (override with `DATABASE_URL` environment variable if needed).
- **Snapshot Backups**: Automated and manual snapshots are written to `./data/backups/` from `/system/backup`.
