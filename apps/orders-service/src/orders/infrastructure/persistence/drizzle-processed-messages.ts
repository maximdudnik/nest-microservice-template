import type { ProcessedMessages } from '../../application/ports/outbound';
import type { DbOrTx } from './drizzle-order.repository';
import { processedMessages } from './schema';

export class DrizzleProcessedMessages implements ProcessedMessages {
  constructor(private readonly db: DbOrTx) {}

  async tryMarkProcessed(messageId: string, consumer: string): Promise<boolean> {
    const inserted = await this.db
      .insert(processedMessages)
      .values({ messageId, consumer })
      .onConflictDoNothing()
      .returning({ messageId: processedMessages.messageId });
    return inserted.length === 1;
  }
}
