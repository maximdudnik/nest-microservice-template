import { Order } from '../../domain';
import { InMemoryOrderRepository } from '../../../../test/fakes/in-memory';
import { OrderNotFoundError } from '../errors';
import { GetOrderService } from './get-order.service';

describe('GetOrderService', () => {
  it('returns a view, not the entity', async () => {
    const repo = new InMemoryOrderRepository();
    const order = Order.place({
      id: 'o-1',
      customerId: 'c',
      currency: 'EUR',
      lines: [{ sku: 'A', quantity: 1, unitPriceMinor: 100 }],
      now: new Date(),
    });
    await repo.add(order);
    const view = await new GetOrderService(repo).execute({ orderId: 'o-1' });
    expect(view).toMatchObject({ id: 'o-1', totalMinor: 100, status: 'PENDING_PAYMENT' });
    expect(view).not.toBeInstanceOf(Order);
  });

  it('throws OrderNotFoundError', async () => {
    await expect(
      new GetOrderService(new InMemoryOrderRepository()).execute({ orderId: 'nope' }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
