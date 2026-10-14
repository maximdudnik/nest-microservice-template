import type { Order } from '../../../domain';

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByIdempotencyKey(key: string): Promise<Order | null>;
  /** Insert a new order. Throws IdempotencyKeyConflictError if the key is already used. */
  add(order: Order): Promise<void>;
  /** Update with optimistic concurrency on `version`. Throws ConcurrencyConflictError if stale. */
  update(order: Order): Promise<void>;
}
