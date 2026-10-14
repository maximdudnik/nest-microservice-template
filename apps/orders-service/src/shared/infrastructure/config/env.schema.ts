import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** Single source of truth for configuration. Parsed once at startup; the app refuses to boot if invalid. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1).default('orders-service'),
  SERVICE_VERSION: z.string().min(1).default('0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: bool.default(false),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(20),

  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(1000).default(100),

  RISK_API_URL: z.url(),
  RISK_API_KEY: z.string().min(1),
  RISK_API_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(3000),

  SHUTDOWN_GRACE_MS: z.coerce.number().int().nonnegative().default(25_000),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Do not print values: they may be secrets.
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return Object.freeze(result.data);
}
