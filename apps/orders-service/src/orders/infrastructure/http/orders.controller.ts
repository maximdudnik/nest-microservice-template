import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodValidationPipe } from '../../../shared/infrastructure/http/zod-validation.pipe';
import type {
  CreateOrderUseCase,
  GetOrderUseCase,
  OrderView,
} from '../../application/ports/inbound';
import { CREATE_ORDER_USE_CASE, GET_ORDER_USE_CASE } from '../../application/ports/tokens';
import {
  type CreateOrderBody,
  type OrderResponse,
  createOrderBody,
  idempotencyKeyHeader,
  orderIdParam,
} from './orders.dto';

const toResponse = (v: OrderView): OrderResponse => ({
  ...v,
  createdAt: v.createdAt.toISOString(),
  updatedAt: v.updatedAt.toISOString(),
});

/** Inbound HTTP adapter. Calls use cases only, never repositories. */
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(
    @Inject(CREATE_ORDER_USE_CASE) private readonly createOrder: CreateOrderUseCase,
    @Inject(GET_ORDER_USE_CASE) private readonly getOrder: GetOrderUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(createOrderBody)) body: CreateOrderBody,
    @Headers('idempotency-key') rawIdempotencyKey: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<OrderResponse> {
    const idempotencyKey = idempotencyKeyHeader.parse(rawIdempotencyKey);
    const result = await this.createOrder.execute({ ...body, idempotencyKey });
    void reply.header('location', `/v1/orders/${result.order.id}`);
    if (!result.created) void reply.status(200).header('idempotent-replayed', 'true');
    return toResponse(result.order);
  }

  @Get(':id')
  async get(@Param('id', new ZodValidationPipe(orderIdParam)) id: string): Promise<OrderResponse> {
    return toResponse(await this.getOrder.execute({ orderId: id }));
  }
}
