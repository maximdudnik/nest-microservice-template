import type { OrderView } from './order-view';

export interface CreateOrderCommand {
  customerId: string;
  currency: string;
  lines: ReadonlyArray<{ sku: string; quantity: number; unitPriceMinor: number }>;
  idempotencyKey?: string | undefined;
}

export interface CreateOrderResult {
  order: OrderView;
  /** false when an existing order was returned for a replayed Idempotency-Key. */
  created: boolean;
}

export interface CreateOrderUseCase {
  execute(command: CreateOrderCommand): Promise<CreateOrderResult>;
}
