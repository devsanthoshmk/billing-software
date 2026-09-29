import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || './data/siva_erp.db',
  },
  verbose: true,
  strict: true,
});
