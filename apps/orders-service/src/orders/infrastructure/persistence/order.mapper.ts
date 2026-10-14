import { Money, Order } from '../../domain';
import type { orders } from './schema';

type OrderRow = typeof orders.$inferSelect;
type OrderInsert = typeof orders.$inferInsert;

export const OrderMapper = {
  toDomain(row: OrderRow): Order {
    return Order.rehydrate({
      id: row.id,
      customerId: row.customerId,
      currency: row.currency,
      status: row.status,
      lines: row.lines.map((l) => ({
        sku: l.sku,
        quantity: l.quantity,
        unitPrice: Money.of(l.unitPriceMinor, row.currency),
      })),
      paymentId: row.paymentId,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    });
  },

  toPersistence(order: Order): OrderInsert & { version: number } {
    return {
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      currency: order.currency,
      totalMinor: order.total.amountMinor,
      lines: order.lines.map((l) => ({
        sku: l.sku,
        quantity: l.quantity,
        unitPriceMinor: l.unitPrice.amountMinor,
      })),
      paymentId: order.paymentId,
      idempotencyKey: order.idempotencyKey,
      version: order.version,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  },
};
