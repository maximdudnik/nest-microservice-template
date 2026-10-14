import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DEAD_LETTER_EXCHANGE } from './topology';

/** Declares DLQs and binds them to the DLX. Register queue names via `DlqSetup.register`. */
@Injectable()
export class DlqSetup implements OnApplicationBootstrap {
  private static readonly queues = new Set<string>();

  static register(dlq: string): void {
    DlqSetup.queues.add(dlq);
  }

  constructor(private readonly amqp: AmqpConnection) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const dlq of DlqSetup.queues) {
      await this.amqp.channel.assertQueue(dlq, {
        durable: true,
        arguments: { 'x-queue-type': 'quorum' },
      });
      await this.amqp.channel.bindQueue(dlq, DEAD_LETTER_EXCHANGE, dlq);
    }
  }
}
