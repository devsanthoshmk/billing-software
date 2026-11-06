# Medisys billing software

Medisys is an open source point of sale billing software, invoice generator, and retail inventory POS system built with TypeScript, Next.js, and SQLite. It provides wholesale pharmaceutical distribution workflows, batch-level stock management, GST invoicing, accounts receivable tracking, and ESC/P dot-matrix receipt printing.

## Purpose

Medisys gives distributors and retail pharmacies a fast, keyboard-driven billing system for high-volume counter sales. The system replaces legacy FoxPro POS installations with a modern web application while keeping the speed of 10-key numeric keypad data entry.

Key operational capabilities:
- Point of sale invoice generator with batch selection and bonus schemes such as 10+1 free.
- Dual-tax GST engine that calculates CGST, SGST, IGST, trade discounts, cash discount slabs, and TCS.
- Batch inventory tracking with earliest-expiry-first (FEFO) stock deduction and multi-MRP support.
- Bill-by-bill customer accounts receivable with automated FIFO payment settlement.
- Regulatory compliance checks for Drug License Form 20B and 21B expiry dates, DPCO price caps, and customer credit limits.
- Hardware printer support for continuous 80-column dot-matrix printers and 40-column thermal receipt printers.
- Accounting synchronization with Tally Prime XML exports and official GSTR-1 and GSTR-3B tax reports.

## Architecture

Medisys runs as a full-stack Next.js application. All data mutations execute through Next.js Server Actions with direct SQLite transactions.

### System components

- **Application framework.** Next.js 16 App Router with React 19. Server Components render pages on the server, and Server Actions execute database writes without separate REST endpoints.
- **Database engine.** SQLite running through `better-sqlite3` and Drizzle ORM. The connection runs in Write-Ahead Logging (WAL) mode with a 64 MB cache and memory temp store for low latency.
- **Business logic engine.** A pure TypeScript calculation library with 554 automated unit tests. The engine computes line-item taxes, trade discounts, cash discounts, paise rounding, and FIFO stock deductions.
- **Interface design.** A terminal-style DOS interface built with Tailwind CSS and Geist Mono. All interactive screens use zero border radius and support complete keyboard navigation.
- **Hardware printing.** Raw ESC/P 80-column and ESC/POS 40-column formatting modules generate print-ready ASCII text and `.prn` control files.

### Directory structure

```text
├── data/                       # Local SQLite database file (siva_erp.db) and automated backups
├── drizzle/                    # Drizzle migrations and schema snapshots
├── scripts/                    # Maintenance and database migration scripts
├── src/
│   ├── app/                    # 51 Next.js App Router pages and server actions
│   │   ├── accounts/           # Customer collections, supplier payments, cheque register
│   │   ├── billing/            # POS invoicing, credit notes, sales returns, delivery challans
│   │   ├── masters/            # Product catalog, customer directory, suppliers, tax slabs
│   │   ├── reports/            # Daily sales, stock valuation, GST exports, salesman ledgers
│   │   ├── stock/              # Purchase inward (GRN), stock transfers, adjustments
│   │   └── system/             # Day-end audit, backups, Tally export, security controls
│   ├── components/
│   │   ├── layout/             # Header, sidebar, and status bar
│   │   ├── print/              # Dot-matrix and thermal print preview modals
│   │   └── ui/                 # DOS-style inputs, tables, and modal windows
│   └── lib/
│       ├── business-engine/    # Tax calculation, batch allocation, and validation rules
│       ├── db/                 # Drizzle schemas, SQLite connection, and seed scripts
│       ├── keyboard/           # Enter-key progression and global shortcut listeners
│       └── print/              # ESC/P and ESC/POS printer control code formatters
└── tests/                      # 36 Vitest test suites covering business logic and UI
```

## Setup

### Prerequisites

- Node.js 20.x or later
- npm, pnpm, or yarn
- C++ build tools (required by `better-sqlite3` for native compilation)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/devsanthoshmk/billing-software.git
   cd billing-software
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Initialize and seed the SQLite database:
   ```bash
   npm run db:seed
   ```
   This command creates `data/siva_erp.db`, applies all database migrations, and populates statutory GST slabs, sample pharmaceutical products, customers, suppliers, and initial transactions.

4. Start the development server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 in your browser.

### Key scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Starts the Next.js development server with Turbopack |
| `npm run build` | Compiles the production application and verifies route types |
| `npm start` | Starts the compiled production server |
| `npm test` | Runs the Vitest test suite across 36 test files |
| `npm run db:seed` | Applies migrations and seeds the SQLite database |
| `npm run db:generate` | Generates Drizzle migration files from schemas |
| `npm run db:migrate` | Applies pending migrations from `drizzle/migrations/` |
| `npm run db:push` | Pushes schema changes directly to SQLite |
| `npm run lint` | Runs ESLint checks |

## Usage

### Point of sale billing (`/billing/pos`)

The POS counter interface supports rapid order entry:
- Press `Enter` to step through product selection, batch choice, quantity, and discount fields.
- Type product names or drug codes to open the search modal.
- Select batches filtered by shelf life and earliest expiry date.
- Apply trade discounts, cash discount slabs, and scheme quantities automatically.
- Print 80-column invoices or 40-column receipts immediately after saving.

### Stock and purchase inward (`/stock/purchase`)

The inventory management module tracks warehouse stock:
- Record Goods Received Notes (GRN) with supplier bill numbers, dates, and payment due terms.
- Enter batch numbers, expiry dates, purchase rates, and maximum retail prices (MRP).
- Manage rack and bin shelving locations.
- Resolve multi-MRP inventory batches for identical products.
- Process customer sales returns with restocking or quarantine routing.

### Accounts and ledgers (`/accounts`)

The financial module tracks receivables and payables:
- Record customer collection receipts in cash, cheque, NEFT, RTGS, or UPI.
- Allocate receipt amounts to outstanding credit bills using automated FIFO ordering or manual assignment.
- Track cheque deposit, clearance, and dishonor events in the cheque register.
- Review accounts receivable ageing schedules across 0-30, 31-60, 61-90, and 90+ day intervals.
- Record supplier disbursements against inward purchase invoices.

### Statutory reports and compliance (`/reports`, `/system`)

The reporting suite produces statutory tax and accounting records:
- Export GSTR-1 and GSTR-3B data in JSON and CSV formats for tax portal filing.
- Generate Tally Prime XML accounting vouchers for ledger synchronization.
- Inspect daily sales registers, cashier cash drawer reconciliations, and tax summaries.
- Track batches nearing expiry within 30, 60, or 90 days.
- Lock daily transactions with the Day-End closing audit routine to prevent backdated edits.

### Default credentials

| Role | Password / PIN | Permissions |
|------|----------------|-------------|
| Supervisor / Admin | `SPM` | Full administrative access, back-date overrides, price locks |
| Manager | `SPM` | Rate overrides, credit adjustments, collection edits |
| Billing Operator | `SIVA` | Standard counter billing and receipt entry |

### Keyboard shortcuts

The interface is built for numeric keypad and keyboard operation:
- `Enter`: Advances focus to the next input field or confirms the active modal.
- `Esc`: Closes open modals, clears current line input, or exits the current screen.
- `F1`: Opens product and customer search lookup.
- `F2`: Opens the batch selection picker.
- `F3`: Switches billing series.
- `F8`: Saves the transaction and opens the print dialog.
- `Arrow Up / Down`: Moves between table rows and selection grids.

## Configuration

### Environment variables

Create a `.env` file in the project root to adjust runtime settings:

```bash
# Path to the SQLite database file
DATABASE_URL="./data/siva_erp.db"

# Enable verbose SQL query logging (true or false)
DB_LOGGING="false"

# Optional target connection string for PostgreSQL migration
DATABASE_PG_URL="postgres://user:password@localhost:5432/medisys"
```

### System controls

Administrative parameters are managed from `/system/supervisor`:
- **Rate modification.** Locks selling rates during counter billing unless authorized by supervisor PIN.
- **Credit limits.** Restricts billing to customers whose unpaid balances exceed assigned credit limits.
- **Drug license validation.** Prohibits sales when customer Form 20B or 21B drug licenses are expired.
- **Negative margin block.** Rejects invoice line items where selling rates fall below purchase rates.
- **Day-end locking.** Freezes all transactions recorded on or before the closed working date.
