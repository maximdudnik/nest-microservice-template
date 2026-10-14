import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable } from '@nestjs/common';
import { PAYMENTS_EXCHANGE, PaymentsRoutingKeys, paymentCapturedV1Schema } from '@org/contracts';
import type { ConsumeMessage } from 'amqplib';
import { handleMessage } from '../../../shared/infrastructure/messaging/consumer-context';
import { DlqSetup } from '../../../shared/infrastructure/messaging/dlq-setup';
import { queueWithDlq } from '../../../shared/infrastructure/messaging/topology';
import type { MarkOrderPaidUseCase } from '../../application/ports/inbound';
import { MARK_ORDER_PAID_USE_CASE } from '../../application/ports/tokens';

const topology = queueWithDlq('orders-service.payment-captured');
DlqSetup.register(topology.dlq);

/** Inbound adapter: PaymentCaptured (payments-service) -> MarkOrderPaid use case. */
@Injectable()
export class PaymentCapturedConsumer {
  constructor(@Inject(MARK_ORDER_PAID_USE_CASE) private readonly markPaid: MarkOrderPaidUseCase) {}

  @RabbitSubscribe({
    exchange: PAYMENTS_EXCHANGE,
    routingKey: PaymentsRoutingKeys.paymentCapturedV1,
    queue: topology.queue,
    queueOptions: topology.queueOptions,
    createQueueIfNotExists: true,
  })
  handle(message: unknown, amqpMsg?: ConsumeMessage) {
    return handleMessage(message, amqpMsg, paymentCapturedV1Schema, (msg) =>
      this.markPaid.execute({
        messageId: msg.messageId,
        orderId: msg.data.orderId,
        paymentId: msg.data.paymentId,
      }),
    );
  }
}
