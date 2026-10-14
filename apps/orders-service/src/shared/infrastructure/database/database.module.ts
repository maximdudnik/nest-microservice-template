import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';

export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');
export type Database = NodePgDatabase;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const pool = new Pool({
          connectionString: config.DATABASE_URL,
          max: config.DATABASE_POOL_MAX,
          statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          application_name: config.SERVICE_NAME,
        });
        pool.on('error', (err) => new Logger('PgPool').error({ err }, 'Idle client error'));
        return pool;
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle({ client: pool, casing: 'snake_case' }),
    },
  ],
  exports: [PG_POOL, DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Runs after consumers/HTTP have drained (Nest calls shutdown hooks after module destroy).
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
