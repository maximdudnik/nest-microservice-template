import { Module } from '@nestjs/common';
import { DRIZZLE, type Database } from '../shared/infrastructure/database/database.module';
import { AmqpPublisher } from '../shared/infrastructure/messaging/amqp-publisher';
import {
  CLOCK,
  CREATE_ORDER_USE_CASE,
  GET_ORDER_USE_CASE,
  ID_GENERATOR,
  MARK_ORDER_PAID_USE_CASE,
  ORDER_REPOSITORY,
  RISK_ASSESSMENT,
  UNIT_OF_WORK,
} from './application/ports/tokens';
import { CreateOrderService } from './application/use-cases/create-order.service';
import { GetOrderService } from './application/use-cases/get-order.service';
import { MarkOrderPaidService } from './application/use-cases/mark-order-paid.service';
import { OrdersController } from './infrastructure/http/orders.controller';
import { RiskApiClient } from './infrastructure/integrations/risk-api/risk-api.client';
import { OutboxRelay } from './infrastructure/messaging/outbox-relay';
import { PaymentCapturedConsumer } from './infrastructure/messaging/payment-captured.consumer';
import { DrizzleOrderRepository } from './infrastructure/persistence/drizzle-order.repository';
import { DrizzleUnitOfWork } from './infrastructure/persistence/drizzle-unit-of-work';
import { SystemClock } from './infrastructure/system/system-clock';
import { UuidV7Generator } from './infrastructure/system/uuid-v7.generator';

/** Composition root for the orders bounded context: binds port tokens -> adapters. */
@Module({
  controllers: [OrdersController],
  providers: [
    // outbound ports
    {
      provide: ORDER_REPOSITORY,
      inject: [DRIZZLE],
      useFactory: (db: Database) => new DrizzleOrderRepository(db),
    },
    { provide: UNIT_OF_WORK, useClass: DrizzleUnitOfWork },
    { provide: RISK_ASSESSMENT, useClass: RiskApiClient },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7Generator },
    // inbound ports (use cases)
    { provide: CREATE_ORDER_USE_CASE, useClass: CreateOrderService },
    { provide: GET_ORDER_USE_CASE, useClass: GetOrderService },
    { provide: MARK_ORDER_PAID_USE_CASE, useClass: MarkOrderPaidService },
    // messaging adapters
    AmqpPublisher,
    OutboxRelay,
    PaymentCapturedConsumer,
  ],
})
export class OrdersModule {}
