import { z } from 'zod';

/**
 * Every message on the bus is wrapped in this envelope.
 * - `messageId` is the idempotency key consumers dedupe on (processed_messages table).
 * - `type` + `version` identify the schema; breaking changes = new version + new routing key.
 * Correlation id and traceparent travel in AMQP headers, not in the body.
 */
export const envelopeSchema = <TType extends string, TData extends z.ZodType>(
  type: TType,
  data: TData,
) =>
  z.object({
    messageId: z.uuid(),
    type: z.literal(type),
    version: z.literal(1),
    occurredAt: z.iso.datetime(),
    producer: z.string().min(1),
    data,
  });

export const AMQP_HEADERS = {
  correlationId: 'x-correlation-id',
  traceparent: 'traceparent',
  messageType: 'x-message-type',
} as const;
