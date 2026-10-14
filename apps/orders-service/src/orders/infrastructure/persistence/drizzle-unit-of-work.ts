import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type Database } from '../../../shared/infrastructure/database/database.module';
import type { TransactionalRepositories, UnitOfWork } from '../../application/ports/outbound';
import { DrizzleOrderRepository } from './drizzle-order.repository';
import { DrizzleOutbox } from './drizzle-outbox';
import { DrizzleProcessedMessages } from './drizzle-processed-messages';

@Injectable()
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      work({
        orders: new DrizzleOrderRepository(tx),
        outbox: new DrizzleOutbox(tx),
        processedMessages: new DrizzleProcessedMessages(tx),
      }),
    );
  }
}
