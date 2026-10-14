/** Dead-letter topology (standards: DLX/DLQ per consumer queue). */
export const DEAD_LETTER_EXCHANGE = 'orders-service.dlx';

/** Queue options for a consumer queue whose rejected messages go to `<queue>.dlq`. */
export function queueWithDlq(queue: string) {
  return {
    queue,
    queueOptions: {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
        'x-dead-letter-routing-key': `${queue}.dlq`,
        // Quorum queues: poison-message protection if a handler crashes the process mid-message.
        'x-delivery-limit': 10,
      },
    },
    dlq: `${queue}.dlq`,
  } as const;
}
