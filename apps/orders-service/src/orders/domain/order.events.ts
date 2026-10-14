import type { DomainEvent } from '../../shared/kernel/domain-event';
import type { OrderLine } from './order-line';
import type { Money } from './money';

export interface OrderCreated extends DomainEvent {
  readonly type: 'OrderCreated';
  readonly customerId: string;
  readonly total: Money;
  readonly lines: readonly OrderLine[];
}

export interface OrderPaid extends DomainEvent {
  readonly type: 'OrderPaid';
  readonly paymentId: string;
}

export type OrderEvent = OrderCreated | OrderPaid;
