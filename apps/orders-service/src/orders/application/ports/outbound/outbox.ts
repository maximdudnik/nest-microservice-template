import type { OrderEvent } from '../../../domain';

/** Writes domain events to the transactional outbox (same transaction as the aggregate). */
export interface Outbox {
  append(events: readonly OrderEvent[]): Promise<void>;
}
