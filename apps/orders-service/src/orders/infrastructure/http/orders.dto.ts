import { z } from 'zod';

export const createOrderBody = z.strictObject({
  customerId: z.string().min(1).max(64),
  currency: z.string().regex(/^[A-Z]{3}$/),
  lines: z
    .array(
      z.strictObject({
        sku: z.string().min(1).max(64),
        quantity: z.number().int().positive().max(10_000),
        unitPriceMinor: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(100),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderIdParam = z.uuid();
export const idempotencyKeyHeader = z.string().min(8).max(128).optional();

/** API response shape (camelCase, ISO timestamps). Mapped from OrderView, never from the entity. */
export interface OrderResponse {
  id: string;
  customerId: string;
  status: string;
  currency: string;
  totalMinor: number;
  lines: Array<{ sku: string; quantity: number; unitPriceMinor: number }>;
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
}
