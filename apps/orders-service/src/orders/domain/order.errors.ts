import { AppError } from '../../shared/kernel/app-error';

export class InvalidOrderError extends AppError {
  readonly code = 'ORDER_INVALID';
  readonly kind = 'validation' as const;
}

export class OrderStateError extends AppError {
  readonly code = 'ORDER_INVALID_STATE';
  readonly kind = 'conflict' as const;
}
