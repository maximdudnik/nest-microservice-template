import { Money } from './money';
import { Order } from './order';
import { InvalidOrderError, OrderStateError } from './order.errors';

const now = new Date('2026-01-01T00:00:00Z');
const place = (overrides: Partial<Parameters<typeof Order.place>[0]> = {}) =>
  Order.place({
    id: 'o-1',
    customerId: 'c-1',
    currency: 'EUR',
    lines: [
      { sku: 'A', quantity: 2, unitPriceMinor: 500 },
      { sku: 'B', quantity: 1, unitPriceMinor: 250 },
    ],
    now,
    ...overrides,
  });

describe('Order', () => {
  it('places an order, computes total and raises OrderCreated', () => {
    const order = place();
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.total.equals(Money.of(1250, 'EUR'))).toBe(true);
    const events = order.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'OrderCreated',
      aggregateId: 'o-1',
      customerId: 'c-1',
    });
    expect(order.pullEvents()).toHaveLength(0);
  });

  it.each([
    ['no lines', { lines: [] }],
    ['zero quantity', { lines: [{ sku: 'A', quantity: 0, unitPriceMinor: 1 }] }],
    ['fractional price', { lines: [{ sku: 'A', quantity: 1, unitPriceMinor: 1.5 }] }],
    [
      'duplicate sku',
      {
        lines: [
          { sku: 'A', quantity: 1, unitPriceMinor: 1 },
          { sku: 'A', quantity: 1, unitPriceMinor: 1 },
        ],
      },
    ],
    ['bad currency', { currency: 'eur' }],
    ['blank customer', { customerId: '  ' }],
  ])('rejects %s', (_name, overrides) => {
    expect(() => place(overrides)).toThrow(InvalidOrderError);
  });

  it('markPaid is idempotent for the same payment', () => {
    const order = place();
    order.pullEvents();
    order.markPaid('p-1', now);
    order.markPaid('p-1', now);
    expect(order.status).toBe('PAID');
    expect(order.pullEvents()).toEqual([
      expect.objectContaining({ type: 'OrderPaid', paymentId: 'p-1' }),
    ]);
  });

  it('markPaid with a different payment conflicts', () => {
    const order = place();
    order.markPaid('p-1', now);
    expect(() => order.markPaid('p-2', now)).toThrow(OrderStateError);
  });

  it('cannot pay a cancelled order', () => {
    const order = Order.rehydrate({
      id: 'o-1',
      customerId: 'c',
      currency: 'EUR',
      lines: [],
      status: 'CANCELLED',
      paymentId: null,
      idempotencyKey: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    expect(() => order.markPaid('p-1', now)).toThrow(OrderStateError);
  });

  it('Money rejects currency mismatch', () => {
    expect(() => Money.of(1, 'EUR').add(Money.of(1, 'USD'))).toThrow(InvalidOrderError);
  });
});
