import { Money } from './money';
import { InvalidOrderError, OrderStateError } from './order.errors';
import type { OrderLine } from './order-line';
import type { OrderEvent } from './order.events';

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';

export interface OrderProps {
  readonly id: string;
  readonly customerId: string;
  readonly currency: string;
  readonly lines: readonly OrderLine[];
  status: OrderStatus;
  paymentId: string | null;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
  /** Optimistic-concurrency version; incremented by the repository on every update. */
  readonly version: number;
}

export interface PlaceOrderInput {
  id: string;
  customerId: string;
  currency: string;
  lines: ReadonlyArray<{ sku: string; quantity: number; unitPriceMinor: number }>;
  idempotencyKey?: string | undefined;
  now: Date;
}

const MAX_LINES = 100;

/** Order aggregate root. Pure TypeScript: no Nest, no Drizzle, no I/O. */
export class Order {
  private readonly pendingEvents: OrderEvent[] = [];

  private constructor(private readonly props: OrderProps) {}

  static place(input: PlaceOrderInput): Order {
    if (input.customerId.trim() === '') {
      throw new InvalidOrderError('customerId is required');
    }
    if (input.lines.length === 0 || input.lines.length > MAX_LINES) {
      throw new InvalidOrderError(`An order must have between 1 and ${MAX_LINES} lines`);
    }
    const skus = new Set<string>();
    const lines = input.lines.map((l): OrderLine => {
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
        throw new InvalidOrderError('Quantity must be a positive integer', {
          details: { sku: l.sku },
        });
      }
      if (skus.has(l.sku)) {
        throw new InvalidOrderError('Duplicate SKU in order lines', { details: { sku: l.sku } });
      }
      skus.add(l.sku);
      return {
        sku: l.sku,
        quantity: l.quantity,
        unitPrice: Money.of(l.unitPriceMinor, input.currency),
      };
    });

    const order = new Order({
      id: input.id,
      customerId: input.customerId,
      currency: input.currency,
      lines,
      status: 'PENDING_PAYMENT',
      paymentId: null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: input.now,
      updatedAt: input.now,
      version: 0,
    });
    order.pendingEvents.push({
      type: 'OrderCreated',
      aggregateId: order.id,
      occurredAt: input.now,
      customerId: order.customerId,
      total: order.total,
      lines,
    });
    return order;
  }

  /** Rebuild from persistence. Never emits events. */
  static rehydrate(props: OrderProps): Order {
    return new Order({ ...props, lines: [...props.lines] });
  }

  /** Idempotent: paying an already-paid order with the same payment is a no-op. */
  markPaid(paymentId: string, now: Date): void {
    if (this.props.status === 'PAID') {
      if (this.props.paymentId === paymentId) return;
      throw new OrderStateError('Order already paid by a different payment', {
        details: {
          orderId: this.id,
          paymentId,
        },
      });
    }
    if (this.props.status !== 'PENDING_PAYMENT') {
      throw new OrderStateError(`Cannot pay an order in status ${this.props.status}`, {
        details: {
          orderId: this.id,
        },
      });
    }
    this.props.status = 'PAID';
    this.props.paymentId = paymentId;
    this.props.updatedAt = now;
    this.pendingEvents.push({
      type: 'OrderPaid',
      aggregateId: this.id,
      occurredAt: now,
      paymentId,
    });
  }

  /** Returns and clears events raised since load; the use case writes them to the outbox. */
  pullEvents(): OrderEvent[] {
    return this.pendingEvents.splice(0, this.pendingEvents.length);
  }

  get id(): string {
    return this.props.id;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get currency(): string {
    return this.props.currency;
  }
  get status(): OrderStatus {
    return this.props.status;
  }
  get lines(): readonly OrderLine[] {
    return this.props.lines;
  }
  get paymentId(): string | null {
    return this.props.paymentId;
  }
  get idempotencyKey(): string | null {
    return this.props.idempotencyKey;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get version(): number {
    return this.props.version;
  }
  get total(): Money {
    return this.props.lines.reduce(
      (sum, l) => sum.add(l.unitPrice.multiply(l.quantity)),
      Money.zero(this.props.currency),
    );
  }
}
