import { Injectable, type BeforeApplicationShutdown, Inject, Logger } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';

/**
 * Graceful shutdown (standards §2): on SIGTERM readiness flips to failing first so the
 * load balancer stops routing, then we wait a short grace period before Nest closes
 * the HTTP server, consumers, and finally DB/AMQP connections.
 */
@Injectable()
export class ShutdownState implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ShutdownState.name);
  private shuttingDown = false;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.shuttingDown = true;
    // Let readiness probes observe the failure before we stop accepting connections.
    const drainMs = Math.min(5_000, this.config.SHUTDOWN_GRACE_MS);
    this.logger.log(
      `Received ${signal ?? 'shutdown'}; readiness failing, draining for ${drainMs}ms`,
    );
    await sleep(drainMs);
  }
}
