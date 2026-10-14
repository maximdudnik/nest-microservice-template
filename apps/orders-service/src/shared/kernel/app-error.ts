/**
 * Framework-free error base (standards §3). Carries a stable `code` and a `kind`;
 * the HTTP exception filter and the AMQP consumer map `kind` to status / ack decisions.
 * No HTTP knowledge here.
 */
export type ErrorKind =
  | 'validation' // bad input -> 400
  | 'not_found' // -> 404
  | 'conflict' // concurrency / state conflicts -> 409
  | 'rule_violation' // business rule rejected -> 422
  | 'unavailable' // dependency down, retryable -> 503
  | 'internal'; // programmer error -> 500

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly kind: ErrorKind;
  /** Operational = expected (log warn/info). Non-operational = bug (log error + alert). */
  readonly isOperational: boolean = true;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.details = options?.details;
  }

  get retryable(): boolean {
    return this.kind === 'unavailable';
  }
}
