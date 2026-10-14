/** Inbox/dedup store for idempotent consumers. */
export interface ProcessedMessages {
  /** Returns false if (messageId, consumer) was already processed. Must run inside the UoW. */
  tryMarkProcessed(messageId: string, consumer: string): Promise<boolean>;
}
