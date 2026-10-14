import { z } from 'zod';
import { envelopeSchema } from './envelope';

export const ORDERS_EXCHANGE = 'orders.events';

export const OrdersRoutingKeys = {
  orderCreatedV1: 'order.created.v1',
  orderPaidV1: 'order.paid.v1',
} as const;

const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

export const orderCreatedV1Schema = envelopeSchema(
  'OrderCreated',
  z.object({
    orderId: z.uuid(),
    customerId: z.string().min(1),
    total: moneySchema,
    lines: z.array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: moneySchema,
      }),
    ),
  }),
);
export type OrderCreatedV1 = z.infer<typeof orderCreatedV1Schema>;

export const orderPaidV1Schema = envelopeSchema(
  'OrderPaid',
  z.object({
    orderId: z.uuid(),
    paymentId: z.string().min(1),
  }),
);
export type OrderPaidV1 = z.infer<typeof orderPaidV1Schema>;
