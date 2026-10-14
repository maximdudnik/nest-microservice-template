import { AppError } from '../../shared/kernel/app-error';

export class OrderNotFoundError extends AppError {
  readonly code = 'ORDER_NOT_FOUND';
  readonly kind = 'not_found' as const;
}

export class OrderRejectedError extends AppError {
  readonly code = 'ORDER_REJECTED';
  readonly kind = 'rule_violation' as const;
}

export class ConcurrencyConflictError extends AppError {
  readonly code = 'CONCURRENCY_CONFLICT';
  readonly kind = 'conflict' as const;
}

export class IdempotencyKeyConflictError extends AppError {
  readonly code = 'IDEMPOTENCY_KEY_CONFLICT';
  readonly kind = 'conflict' as const;
}

/** Third-party dependency down / timed out / circuit open. Retryable. */
export class ProviderUnavailableError extends AppError {
  readonly code = 'PROVIDER_UNAVAILABLE';
  readonly kind = 'unavailable' as const;
}

/** Provider answered with something we cannot understand. A bug or upstream change: alert. */
export class ProviderContractViolationError extends AppError {
  readonly code = 'PROVIDER_CONTRACT_VIOLATION';
  readonly kind = 'internal' as const;
  override readonly isOperational = false;
}
