import { z } from 'zod';
import { envelopeSchema } from './envelope';

/** Owned by the payments service; consumed by orders-service. */
export const PAYMENTS_EXCHANGE = 'payments.events';

export const PaymentsRoutingKeys = {
  paymentCapturedV1: 'payment.captured.v1',
} as const;

export const paymentCapturedV1Schema = envelopeSchema(
  'PaymentCaptured',
  z.object({
    paymentId: z.string().min(1),
    orderId: z.uuid(),
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
);
export type PaymentCapturedV1 = z.infer<typeof paymentCapturedV1Schema>;
