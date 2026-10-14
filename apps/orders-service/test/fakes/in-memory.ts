import type { Order, OrderEvent } from '../../src/orders/domain';
import { Order as OrderAggregate } from '../../src/orders/domain';
import {
  ConcurrencyConflictError,
  IdempotencyKeyConflictError,
} from '../../src/orders/application/errors';
import type {
  Clock,
  IdGenerator,
  OrderRepository,
  Outbox,
  ProcessedMessages,
  RiskAssessment,
  RiskDecision,
  TransactionalRepositories,
  UnitOfWork,
} from '../../src/orders/application/ports/outbound';

/** Snapshot-based store so the fake behaves like a DB (no shared object references). */
export class InMemoryOrderRepository implements OrderRepository {
  readonly rows = new Map<string, Order>();

  async findById(id: string): Promise<Order | null> {
    const o = this.rows.get(id);
    return o ? clone(o) : null;
  }
  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const o = [...this.rows.values()].find((r) => r.idempotencyKey === key);
    return o ? clone(o) : null;
  }
  async add(order: Order): Promise<void> {
    if (order.idempotencyKey && (await this.findByIdempotencyKey(order.idempotencyKey))) {
      throw new IdempotencyKeyConflictError('duplicate key');
    }
    this.rows.set(order.id, clone(order));
  }
  async update(order: Order): Promise<void> {
    const current = this.rows.get(order.id);
    if (!current || current.version !== order.version) throw new ConcurrencyConflictError('stale');
    this.rows.set(order.id, clone(order, order.version + 1));
  }
}

function clone(o: Order, version = o.version): Order {
  return OrderAggregate.rehydrate({
    id: o.id,
    customerId: o.customerId,
    currency: o.currency,
    lines: [...o.lines],
    status: o.status,
    paymentId: o.paymentId,
    idempotencyKey: o.idempotencyKey,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    version,
  });
}

export class InMemoryOutbox implements Outbox {
  readonly events: OrderEvent[] = [];
  async append(events: readonly OrderEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

export class InMemoryProcessedMessages implements ProcessedMessages {
  readonly seen = new Set<string>();
  async tryMarkProcessed(messageId: string, consumer: string): Promise<boolean> {
    const k = `${consumer}:${messageId}`;
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }
}

/** Simulates atomicity: outbox/processed writes are discarded if work throws. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(
    readonly orders = new InMemoryOrderRepository(),
    readonly outbox = new InMemoryOutbox(),
    readonly processed = new InMemoryProcessedMessages(),
  ) {}

  async run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    const ordersSnapshot = new Map(this.orders.rows);
    const outboxLen = this.outbox.events.length;
    const processedSnapshot = new Set(this.processed.seen);
    try {
      return await work({
        orders: this.orders,
        outbox: this.outbox,
        processedMessages: this.processed,
      });
    } catch (err) {
      this.orders.rows.clear();
      ordersSnapshot.forEach((v, k) => this.orders.rows.set(k, v));
      this.outbox.events.length = outboxLen;
      this.processed.seen.clear();
      processedSnapshot.forEach((v) => this.processed.seen.add(v));
      throw err;
    }
  }
}

export class FakeRiskAssessment implements RiskAssessment {
  decision: RiskDecision = { outcome: 'approved' };
  error: Error | null = null;
  calls = 0;
  async assessOrder(): Promise<RiskDecision> {
    this.calls++;
    if (this.error) throw this.error;
    return this.decision;
  }
}

export class FixedClock implements Clock {
  constructor(public current = new Date('2026-01-01T00:00:00.000Z')) {}
  now(): Date {
    return this.current;
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  next(): string {
    this.n++;
    return `00000000-0000-7000-8000-${String(this.n).padStart(12, '0')}`;
  }
}
