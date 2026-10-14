import type { OrderRepository } from './order.repository';
import type { Outbox } from './outbox';
import type { ProcessedMessages } from './processed-messages';

/** Transaction-bound repositories handed to the work callback. Use cases never see `tx`. */
export interface TransactionalRepositories {
  readonly orders: OrderRepository;
  readonly outbox: Outbox;
  readonly processedMessages: ProcessedMessages;
}

export interface UnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
