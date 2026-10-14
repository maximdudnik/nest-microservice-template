import { Inject, Injectable } from '@nestjs/common';
import { OrderNotFoundError } from '../errors';
import type {
  MarkOrderPaidCommand,
  MarkOrderPaidResult,
  MarkOrderPaidUseCase,
} from '../ports/inbound';
import type { Clock, UnitOfWork } from '../ports/outbound';
import { CLOCK, UNIT_OF_WORK } from '../ports/tokens';

export const MARK_ORDER_PAID_CONSUMER = 'orders.mark-order-paid';

/** Idempotent: dedupe by bus message id inside the same transaction as the state change. */
@Injectable()
export class MarkOrderPaidService implements MarkOrderPaidUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(command: MarkOrderPaidCommand): Promise<MarkOrderPaidResult> {
    return this.uow.run(async ({ orders, outbox, processedMessages }) => {
      const firstTime = await processedMessages.tryMarkProcessed(
        command.messageId,
        MARK_ORDER_PAID_CONSUMER,
      );
      if (!firstTime) return 'duplicate';

      const order = await orders.findById(command.orderId);
      if (!order) {
        throw new OrderNotFoundError('Order not found', { details: { orderId: command.orderId } });
      }
      order.markPaid(command.paymentId, this.clock.now());
      const events = order.pullEvents();
      if (events.length > 0) {
        await orders.update(order);
        await outbox.append(events);
      }
      return 'applied';
    });
  }
}
