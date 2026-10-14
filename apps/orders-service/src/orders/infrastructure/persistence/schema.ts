import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** The orders bounded context owns the `orders` Postgres schema. Nobody else reads these tables. */
export const ordersSchema = pgSchema('orders');

export const orderStatus = ordersSchema.enum('order_status', [
  'PENDING_PAYMENT',
  'PAID',
  'CANCELLED',
]);

export interface OrderLineRow {
  sku: string;
  quantity: number;
  unitPriceMinor: number;
}

export const orders = ordersSchema.table(
  'orders',
  {
    id: uuid().primaryKey(),
    customerId: text().notNull(),
    status: orderStatus().notNull(),
    currency: text().notNull(),
    totalMinor: integer().notNull(),
    lines: jsonb().$type<OrderLineRow[]>().notNull(),
    paymentId: text(),
    idempotencyKey: text(),
    version: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [
    uniqueIndex('orders_idempotency_key_uq').on(t.idempotencyKey),
    index('orders_customer_id_idx').on(t.customerId),
  ],
);

/** Transactional outbox: written in the same transaction as the aggregate, relayed to RabbitMQ. */
export const outbox = ordersSchema.table(
  'outbox',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    messageId: uuid().notNull().unique(),
    exchange: text().notNull(),
    routingKey: text().notNull(),
    messageType: text().notNull(),
    payload: jsonb().$type<unknown>().notNull(),
    correlationId: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    attempts: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true, mode: 'date' }),
    publishedAt: timestamp({ withTimezone: true, mode: 'date' }),
    lastError: text(),
  },
  (t) => [
    index('outbox_unpublished_idx')
      .on(t.id)
      .where(sql`${t.publishedAt} is null`),
  ],
);

/** Idempotent-consumer dedup table (inbox). */
export const processedMessages = ordersSchema.table(
  'processed_messages',
  {
    messageId: uuid().notNull(),
    consumer: text().notNull(),
    processedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.consumer] })],
);
