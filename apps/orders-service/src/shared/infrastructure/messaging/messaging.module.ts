import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';
import { ORDERS_EXCHANGE, PAYMENTS_EXCHANGE } from '@org/contracts';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { DlqSetup } from './dlq-setup';
import { DEAD_LETTER_EXCHANGE } from './topology';

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        uri: config.RABBITMQ_URL,
        connectionInitOptions: { wait: true, timeout: 20_000 },
        connectionManagerOptions: { heartbeatIntervalInSeconds: 15, reconnectTimeInSeconds: 5 },
        prefetchCount: config.RABBITMQ_PREFETCH,
        enableControllerDiscovery: false,
        // Handlers return Nack explicitly; anything thrown and unhandled is dead-lettered, never requeued in a hot loop.
        defaultSubscribeErrorBehavior: 'NACK' as never,
        exchanges: [
          { name: ORDERS_EXCHANGE, type: 'topic', options: { durable: true } },
          // Owned by payments-service; asserting is idempotent and keeps local dev working.
          { name: PAYMENTS_EXCHANGE, type: 'topic', options: { durable: true } },
          { name: DEAD_LETTER_EXCHANGE, type: 'topic', options: { durable: true } },
        ],
        channels: { default: { prefetchCount: config.RABBITMQ_PREFETCH, default: true } },
      }),
    }),
  ],
  providers: [DlqSetup],
  exports: [RabbitMQModule],
})
export class MessagingModule {}
