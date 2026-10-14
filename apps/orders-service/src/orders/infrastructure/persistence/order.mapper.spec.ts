import { Order } from '../../domain';
import { OrderMapper } from './order.mapper';

describe('OrderMapper', () => {
  it('round-trips entity -> row -> entity', () => {
    const order = Order.place({
      id: '00000000-0000-7000-8000-000000000001',
      customerId: 'c',
      currency: 'EUR',
      lines: [{ sku: 'A', quantity: 3, unitPriceMinor: 199 }],
      idempotencyKey: 'k-12345678',
      now: new Date('2026-01-01T00:00:00Z'),
    });
    const row = OrderMapper.toPersistence(order);
    expect(row.totalMinor).toBe(597);

    const back = OrderMapper.toDomain({
      ...row,
      paymentId: row.paymentId ?? null,
      idempotencyKey: row.idempotencyKey ?? null,
    });
    expect(OrderMapper.toPersistence(back)).toEqual(row);
  });
});
