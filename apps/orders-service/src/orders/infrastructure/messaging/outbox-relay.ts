import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { setTimeout as sleep } from 'node:timers/promises';
import { APP_CONFIG } from '../../../shared/infrastructure/config/config.module';
import type { AppConfig } from '../../../shared/infrastructure/config/env.schema';
import { CorrelationContext } from '../../../shared/infrastructure/correlation/correlation-context';
import { DRIZZLE, type Database } from '../../../shared/infrastructure/database/database.module';
import { AmqpPublisher } from '../../../shared/infrastructure/messaging/amqp-publisher';
import { outbox } from '../persistence/schema';

const LEASE_SECONDS = 30;

/**
 * Polls the outbox and publishes to RabbitMQ (at-least-once; consumers dedupe on messageId).
 * Safe with N replicas: rows are leased via FOR UPDATE SKIP LOCKED + locked_until, and the
 * broker publish happens OUTSIDE any DB transaction.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private running = false;
  private loop: Promise<void> | undefined;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly publisher: AmqpPublisher,
  ) {}

  onApplicationBootstrap(): void {
    this.running = true;
    this.loop = this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const processed = await this.relayBatch();
        if (processed < this.config.OUTBOX_BATCH_SIZE) {
          await sleep(this.config.OUTBOX_POLL_INTERVAL_MS);
        }
      } catch (err) {
        this.logger.error({ err }, 'Outbox relay iteration failed');
        await sleep(this.config.OUTBOX_POLL_INTERVAL_MS * 4);
      }
    }
  }

  /** Returns number of rows leased. Public for integration tests. */
  async relayBatch(): Promise<number> {
    const leased = await this.db.transaction(async (tx) => {
      const ids = await tx
        .select({ id: outbox.id })
        .from(outbox)
        .where(
          and(
            isNull(outbox.publishedAt),
            or(isNull(outbox.lockedUntil), lt(outbox.lockedUntil, sql`now()`)),
          ),
        )
        .orderBy(asc(outbox.id))
        .limit(this.config.OUTBOX_BATCH_SIZE)
        .for('update', { skipLocked: true });
      if (ids.length === 0) return [];
      return tx
        .update(outbox)
        .set({
          lockedUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`,
          attempts: sql`${outbox.attempts} + 1`,
        })
        .where(
          inArray(
            outbox.id,
            ids.map((r) => r.id),
          ),
        )
        .returning();
    });

    // Publish in id order; stop at first failure to preserve ordering.
    for (const row of leased.sort((a, b) => a.id - b.id)) {
      try {
        await CorrelationContext.run(row.correlationId ?? CorrelationContext.getOrCreate(), () =>
          this.publisher.publish({
            exchange: row.exchange,
            routingKey: row.routingKey,
            messageId: row.messageId,
            type: row.messageType,
            body: row.payload,
            correlationId: row.correlationId,
          }),
        );
        await this.db
          .update(outbox)
          .set({ publishedAt: sql`now()`, lockedUntil: null, lastError: null })
          .where(eq(outbox.id, row.id));
      } catch (err) {
        this.logger.warn(
          { err, outboxId: row.id },
          'Publish failed; will retry after lease expiry',
        );
        await this.db
          .update(outbox)
          .set({ lastError: err instanceof Error ? err.message.slice(0, 500) : 'unknown' })
          .where(eq(outbox.id, row.id));
        break;
      }
    }
    return leased.length;
  }
}
