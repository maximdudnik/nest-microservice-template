import { Order } from '../../domain';
import { FixedClock, InMemoryUnitOfWork } from '../../../../test/fakes/in-memory';
import { OrderNotFoundError } from '../errors';
import { MarkOrderPaidService } from './mark-order-paid.service';

const ORDER_ID = '00000000-0000-7000-8000-000000000001';

async function setup() {
  const uow = new InMemoryUnitOfWork();
  const clock = new FixedClock();
  const order = Order.place({
    id: ORDER_ID,
    customerId: 'c',
    currency: 'EUR',
    lines: [{ sku: 'A', quantity: 1, unitPriceMinor: 100 }],
    now: clock.now(),
  });
  order.pullEvents();
  await uow.orders.add(order);
  return { uow, service: new MarkOrderPaidService(uow, clock) };
}

describe('MarkOrderPaidService (idempotent consumer use case)', () => {
  it('marks the order paid and emits OrderPaid once', async () => {
    const { uow, service } = await setup();
    const cmd = { messageId: 'm-1', orderId: ORDER_ID, paymentId: 'p-1' };

    await expect(service.execute(cmd)).resolves.toBe('applied');
    await expect(service.execute(cmd)).resolves.toBe('duplicate');

    expect((await uow.orders.findById(ORDER_ID))?.status).toBe('PAID');
    expect(uow.outbox.events.map((e) => e.type)).toEqual(['OrderPaid']);
  });

  it('rolls back the dedup mark when the order is missing (so a fix + redelivery can succeed)', async () => {
    const { uow, service } = await setup();
    await expect(
      service.execute({ messageId: 'm-2', orderId: 'missing', paymentId: 'p' }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(uow.processed.seen.size).toBe(0);
  });
});
