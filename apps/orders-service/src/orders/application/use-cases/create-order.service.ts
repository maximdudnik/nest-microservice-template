import { Inject, Injectable } from '@nestjs/common';
import { Order } from '../../domain';
import { IdempotencyKeyConflictError, OrderRejectedError } from '../errors';
import {
  type CreateOrderCommand,
  type CreateOrderResult,
  type CreateOrderUseCase,
  toOrderView,
} from '../ports/inbound';
import type {
  Clock,
  IdGenerator,
  OrderRepository,
  RiskAssessment,
  UnitOfWork,
} from '../ports/outbound';
import {
  CLOCK,
  ID_GENERATOR,
  ORDER_REPOSITORY,
  RISK_ASSESSMENT,
  UNIT_OF_WORK,
} from '../ports/tokens';

@Injectable()
export class CreateOrderService implements CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(RISK_ASSESSMENT) private readonly risk: RiskAssessment,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateOrderCommand): Promise<CreateOrderResult> {
    if (command.idempotencyKey) {
      const existing = await this.orders.findByIdempotencyKey(command.idempotencyKey);
      if (existing) return { order: toOrderView(existing), created: false };
    }

    const order = Order.place({
      id: this.ids.next(),
      customerId: command.customerId,
      currency: command.currency,
      lines: command.lines,
      idempotencyKey: command.idempotencyKey,
      now: this.clock.now(),
    });

    // External call happens OUTSIDE the transaction (standards §5: keep transactions short).
    const decision = await this.risk.assessOrder({
      orderId: order.id,
      customerId: order.customerId,
      total: order.total,
    });
    if (decision.outcome === 'rejected') {
      throw new OrderRejectedError('Order rejected by risk assessment', {
        details: { reason: decision.reason },
      });
    }

    try {
      await this.uow.run(async ({ orders, outbox }) => {
        await orders.add(order);
        await outbox.append(order.pullEvents());
      });
    } catch (err) {
      // Lost a race with a concurrent request using the same Idempotency-Key: return the winner.
      if (err instanceof IdempotencyKeyConflictError && command.idempotencyKey) {
        const winner = await this.orders.findByIdempotencyKey(command.idempotencyKey);
        if (winner) return { order: toOrderView(winner), created: false };
      }
      throw err;
    }

    return { order: toOrderView(order), created: true };
  }
}
