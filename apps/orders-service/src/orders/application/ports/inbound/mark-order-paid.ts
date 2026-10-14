export interface MarkOrderPaidCommand {
  /** Bus message id: idempotency key for the consumer. */
  messageId: string;
  orderId: string;
  paymentId: string;
}

export type MarkOrderPaidResult = 'applied' | 'duplicate';

export interface MarkOrderPaidUseCase {
  execute(command: MarkOrderPaidCommand): Promise<MarkOrderPaidResult>;
}
