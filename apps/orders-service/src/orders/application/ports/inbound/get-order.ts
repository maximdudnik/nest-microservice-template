import type { OrderView } from './order-view';

export interface GetOrderUseCase {
  execute(query: { orderId: string }): Promise<OrderView>;
}
