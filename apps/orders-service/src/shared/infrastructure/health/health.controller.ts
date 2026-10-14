import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module';
import { ShutdownState } from '../lifecycle/shutdown-state';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly shutdown: ShutdownState,
    private readonly amqp: AmqpConnection,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Liveness: the process is up and the event loop responds. No dependency checks. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable and not shutting down. */
  @Get('ready')
  @HealthCheck()
  ready() {
    if (this.shutdown.isShuttingDown) throw new ServiceUnavailableException('Shutting down');
    return this.health.check([
      async () => {
        const i = this.indicator.check('postgres');
        try {
          await this.db.execute(sql`select 1`);
          return i.up();
        } catch (err) {
          return i.down({ message: err instanceof Error ? err.message : 'unreachable' });
        }
      },
      () => {
        const i = this.indicator.check('rabbitmq');
        return this.amqp.connected ? i.up() : i.down({ message: 'disconnected' });
      },
    ]);
  }
}
