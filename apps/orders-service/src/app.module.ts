import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { OrdersModule } from './orders/orders.module';
import { ConfigModule } from './shared/infrastructure/config/config.module';
import { DatabaseModule } from './shared/infrastructure/database/database.module';
import { HealthModule } from './shared/infrastructure/health/health.module';
import { ProblemDetailsFilter } from './shared/infrastructure/http/problem-details.filter';
import { LifecycleModule } from './shared/infrastructure/lifecycle/lifecycle.module';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';
import { MessagingModule } from './shared/infrastructure/messaging/messaging.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    LifecycleModule,
    DatabaseModule,
    MessagingModule,
    HealthModule,
    // Bounded contexts:
    OrdersModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
