import { defineConfig } from 'drizzle-kit';

// Workflow (standards §5): edit schema -> `rushx db:generate` -> review + commit SQL -> migrator applies in pipeline.
// `drizzle-kit push` is NEVER used against shared/production databases.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/orders/infrastructure/persistence/schema.ts',
  out: './drizzle',
  schemaFilter: ['orders'],
  casing: 'snake_case',
  strict: true,
  verbose: true,
  migrations: { schema: 'orders_migrations', table: '__drizzle_migrations' },
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://orders:orders@localhost:5432/orders',
  },
});
