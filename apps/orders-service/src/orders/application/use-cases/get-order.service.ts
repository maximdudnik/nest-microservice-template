import { Inject, Injectable } from '@nestjs/common';
import { OrderNotFoundError } from '../errors';
import { type GetOrderUseCase, type OrderView, toOrderView } from '../ports/inbound';
import type { OrderRepository } from '../ports/outbound';
import { ORDER_REPOSITORY } from '../ports/tokens';

@Injectable()
export class GetOrderService implements GetOrderUseCase {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  async execute({ orderId }: { orderId: string }): Promise<OrderView> {
    // TODO(auth): object-level authorization check (BOLA, standards §8) once auth is wired.
    const order = await this.orders.findById(orderId);
    if (!order) throw new OrderNotFoundError('Order not found', { details: { orderId } });
    return toOrderView(order);
  }
}
