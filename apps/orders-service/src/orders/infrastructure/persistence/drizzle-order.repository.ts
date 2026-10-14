import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Order } from '../../domain';
import { ConcurrencyConflictError, IdempotencyKeyConflictError } from '../../application/errors';
import type { OrderRepository } from '../../application/ports/outbound';
import { OrderMapper } from './order.mapper';
import { isUniqueViolation } from './pg-errors';
import { orders } from './schema';

/** Works with the root db OR a transaction (both expose the same query API). */
export type DbOrTx = Pick<NodePgDatabase, 'select' | 'insert' | 'update' | 'execute'>;

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: DbOrTx) {}

  async findById(id: string): Promise<Order | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return row ? OrderMapper.toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, key))
      .limit(1);
    return row ? OrderMapper.toDomain(row) : null;
  }

  async add(order: Order): Promise<void> {
    try {
      await this.db.insert(orders).values(OrderMapper.toPersistence(order));
    } catch (err) {
      if (isUniqueViolation(err, 'orders_idempotency_key_uq')) {
        throw new IdempotencyKeyConflictError('Idempotency-Key already used', { cause: err });
      }
      throw err;
    }
  }

  async update(order: Order): Promise<void> {
    const { id, version, createdAt: _createdAt, ...changes } = OrderMapper.toPersistence(order);
    const updated = await this.db
      .update(orders)
      .set({ ...changes, version: version + 1 })
      .where(and(eq(orders.id, id), eq(orders.version, version)))
      .returning({ id: orders.id });
    if (updated.length === 0) {
      throw new ConcurrencyConflictError('Order was modified concurrently', {
        details: { orderId: id },
      });
    }
  }
}
