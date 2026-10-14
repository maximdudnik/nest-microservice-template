import { Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from '@nestjs/common';
import { AMQP_HEADERS } from '@org/contracts';
import type { ConsumeMessage } from 'amqplib';
import type { ZodType } from 'zod';
import { AppError } from '../../kernel/app-error';
import { CorrelationContext, sanitizeCorrelationId } from '../correlation/correlation-context';

const logger = new Logger('AmqpConsumer');

/**
 * Wraps a consumer handler:
 * - restores correlation id from AMQP headers into AsyncLocalStorage (logs carry it),
 * - validates the payload with zod (invalid = poison -> DLQ, never requeue),
 * - maps errors to ack/nack: retryable (`unavailable`/`conflict`) -> requeue once via redelivery,
 *   everything else -> Nack(false) => dead-lettered to the DLQ.
 */
export async function handleMessage<T>(
  raw: unknown,
  amqpMsg: ConsumeMessage | undefined,
  schema: ZodType<T>,
  handler: (message: T) => Promise<unknown>,
): Promise<void | Nack> {
  const headers = amqpMsg?.properties.headers ?? {};
  const correlationId = sanitizeCorrelationId(headers[AMQP_HEADERS.correlationId]);

  return CorrelationContext.run(correlationId, async () => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'Invalid message; dead-lettering');
      return new Nack(false);
    }
    try {
      await handler(parsed.data);
      return undefined;
    } catch (err) {
      const redelivered = amqpMsg?.fields.redelivered ?? false;
      if (
        err instanceof AppError &&
        (err.kind === 'unavailable' || err.kind === 'conflict') &&
        !redelivered
      ) {
        logger.warn({ err }, 'Transient failure; requeueing once');
        return new Nack(true);
      }
      const operational = err instanceof AppError && err.isOperational;
      if (operational) logger.warn({ err }, 'Message rejected; dead-lettering');
      else logger.error({ err }, 'Unexpected consumer error; dead-lettering');
      return new Nack(false);
    }
  });
}
