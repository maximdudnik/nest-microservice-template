import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface CorrelationStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

export const REQUEST_ID_HEADER = 'x-request-id';

export const CorrelationContext = {
  run<T>(correlationId: string, fn: () => T): T {
    return storage.run({ correlationId }, fn);
  },
  /** Use in Fastify onRequest hooks: binds the rest of the request lifecycle to the store. */
  enterWith(correlationId: string): void {
    storage.enterWith({ correlationId });
  },
  get(): string | undefined {
    return storage.getStore()?.correlationId;
  },
  getOrCreate(): string {
    return storage.getStore()?.correlationId ?? randomUUID();
  },
};

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Accept a client-provided id only if it looks sane (avoid log injection); otherwise generate. */
export function sanitizeCorrelationId(value: unknown): string {
  const v: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
  return typeof v === 'string' && SAFE_ID.test(v) ? v : randomUUID();
}
