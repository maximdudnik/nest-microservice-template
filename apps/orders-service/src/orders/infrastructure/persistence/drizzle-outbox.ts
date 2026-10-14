import {
  ORDERS_EXCHANGE,
  OrdersRoutingKeys,
  type OrderCreatedV1,
  type OrderPaidV1,
} from '@org/contracts';
import { randomUUID } from 'node:crypto';
import type { OrderEvent } from '../../domain';
import type { Outbox } from '../../application/ports/outbound';
import { CorrelationContext } from '../../../shared/infrastructure/correlation/correlation-context';
import type { DbOrTx } from './drizzle-order.repository';
import { outbox } from './schema';

const PRODUCER = 'orders-service';

/** Maps domain events -> versioned contract messages (@org/contracts) and stores them in the outbox. */
export class DrizzleOutbox implements Outbox {
  constructor(private readonly db: DbOrTx) {}

  async append(events: readonly OrderEvent[]): Promise<void> {
    if (events.length === 0) return;
    const correlationId = CorrelationContext.get() ?? null;
    await this.db.insert(outbox).values(
      events.map((event) => {
        const message = toContract(event);
        return {
          messageId: message.messageId,
          exchange: ORDERS_EXCHANGE,
          routingKey: routingKeyFor(event),
          messageType: message.type,
          payload: message,
          correlationId,
        };
      }),
    );
  }
}

function routingKeyFor(event: OrderEvent): string {
  switch (event.type) {
    case 'OrderCreated':
      return OrdersRoutingKeys.orderCreatedV1;
    case 'OrderPaid':
      return OrdersRoutingKeys.orderPaidV1;
  }
}

function toContract(event: OrderEvent): OrderCreatedV1 | OrderPaidV1 {
  const base = {
    messageId: randomUUID(),
    version: 1 as const,
    occurredAt: event.occurredAt.toISOString(),
    producer: PRODUCER,
  };
  switch (event.type) {
    case 'OrderCreated':
      return {
        ...base,
        type: 'OrderCreated',
        data: {
          orderId: event.aggregateId,
          customerId: event.customerId,
          total: { amountMinor: event.total.amountMinor, currency: event.total.currency },
          lines: event.lines.map((l) => ({
            sku: l.sku,
            quantity: l.quantity,
            unitPrice: { amountMinor: l.unitPrice.amountMinor, currency: l.unitPrice.currency },
          })),
        },
      };
    case 'OrderPaid':
      return {
        ...base,
        type: 'OrderPaid',
        data: { orderId: event.aggregateId, paymentId: event.paymentId },
      };
  }
}
