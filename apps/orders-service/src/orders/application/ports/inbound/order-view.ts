import type { Order, OrderStatus } from '../../../domain';

/** Read model returned by use cases; never the entity itself. */
export interface OrderView {
  id: string;
  customerId: string;
  status: OrderStatus;
  currency: string;
  totalMinor: number;
  lines: Array<{ sku: string; quantity: number; unitPriceMinor: number }>;
  paymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toOrderView = (order: Order): OrderView => ({
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
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});
