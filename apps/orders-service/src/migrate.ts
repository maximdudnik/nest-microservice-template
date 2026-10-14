/**
 * Applies committed drizzle-kit migrations. Run as a separate pipeline step / k8s Job
 * BEFORE rolling out the new version:  node dist/migrate.js
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("SET lock_timeout = '5s'");
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: process.env['MIGRATIONS_DIR'] ?? join(__dirname, '..', 'drizzle'),
      migrationsSchema: 'orders_migrations', // must differ from 'orders' (migration 0000 creates it)
      migrationsTable: '__drizzle_migrations',
    });
    process.stdout.write('{"level":"info","msg":"migrations applied"}\n');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', msg: 'migration failed', err: String(err) })}\n`,
  );
  process.exit(1);
});
