import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { propagation, context } from '@opentelemetry/api';
import { AMQP_HEADERS } from '@org/contracts';

export interface OutgoingMessage {
  exchange: string;
  routingKey: string;
  messageId: string;
  type: string;
  body: unknown;
  correlationId: string | null;
}

/** Thin publisher: persistent messages, correlation + W3C trace headers, publisher confirms. */
@Injectable()
export class AmqpPublisher {
  constructor(private readonly amqp: AmqpConnection) {}

  async publish(msg: OutgoingMessage): Promise<void> {
    const headers: Record<string, string> = { [AMQP_HEADERS.messageType]: msg.type };
    if (msg.correlationId) headers[AMQP_HEADERS.correlationId] = msg.correlationId;
    propagation.inject(context.active(), headers);

    await this.amqp.publish(msg.exchange, msg.routingKey, msg.body, {
      messageId: msg.messageId,
      type: msg.type,
      correlationId: msg.correlationId ?? undefined,
      contentType: 'application/json',
      persistent: true,
      headers,
    });
  }
}
