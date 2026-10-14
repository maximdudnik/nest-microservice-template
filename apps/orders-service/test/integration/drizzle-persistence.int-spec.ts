/**
 * Integration: Drizzle adapters against a REAL Postgres with the committed migrations applied.
 * Uses Testcontainers (Docker required). Set TEST_DATABASE_URL to reuse an existing DB instead.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { Pool } from 'pg';
import { Order } from '../../src/orders/domain';
import {
  ConcurrencyConflictError,
  IdempotencyKeyConflictError,
} from '../../src/orders/application/errors';
import { CreateOrderService } from '../../src/orders/application/use-cases/create-order.service';
import { MarkOrderPaidService } from '../../src/orders/application/use-cases/mark-order-paid.service';
import { DrizzleOrderRepository } from '../../src/orders/infrastructure/persistence/drizzle-order.repository';
import { DrizzleUnitOfWork } from '../../src/orders/infrastructure/persistence/drizzle-unit-of-work';
import { outbox } from '../../src/orders/infrastructure/persistence/schema';
import { UuidV7Generator } from '../../src/orders/infrastructure/system/uuid-v7.generator';
import { FakeRiskAssessment, FixedClock } from '../fakes/in-memory';

describe('Drizzle persistence (Postgres)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: Pool;
  let db: NodePgDatabase;

  beforeAll(async () => {
    let url = process.env['TEST_DATABASE_URL'];
    if (!url) {
      container = await new PostgreSqlContainer('postgres:17-alpine').start();
      url = container.getConnectionUri();
    }
    pool = new Pool({ connectionString: url, max: 5 });
    db = drizzle({ client: pool, casing: 'snake_case' });
    await db.execute(sql`drop schema if exists orders, orders_migrations cascade`);
    await migrate(db, {
      migrationsFolder: join(__dirname, '..', '..', 'drizzle'),
      migrationsSchema: 'orders_migrations', // must differ from 'orders' (migration 0000 creates it)
      migrationsTable: '__drizzle_migrations',
    });
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate orders.orders, orders.outbox, orders.processed_messages restart identity`,
    );
  });

  const newService = () => {
    const uow = new DrizzleUnitOfWork(db);
    return new CreateOrderService(
      new DrizzleOrderRepository(db),
      uow,
      new FakeRiskAssessment(),
      new FixedClock(),
      new UuidV7Generator(),
    );
  };

  const command = {
    customerId: 'c-1',
    currency: 'EUR',
    lines: [{ sku: 'A', quantity: 2, unitPriceMinor: 500 }],
  };

  it('create order -> persists order and OrderCreated outbox row in one transaction', async () => {
    const { order } = await newService().execute(command);

    const loaded = await new DrizzleOrderRepository(db).findById(order.id);
    expect(loaded?.total.amountMinor).toBe(1000);

    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      routingKey: 'order.created.v1',
      messageType: 'OrderCreated',
      publishedAt: null,
    });
    expect(rows[0]?.payload).toMatchObject({ type: 'OrderCreated', data: { orderId: order.id } });
  });

  it('Idempotency-Key: replay returns the same order; raw duplicate insert is translated', async () => {
    const service = newService();
    const a = await service.execute({ ...command, idempotencyKey: 'idem-key-1' });
    const b = await service.execute({ ...command, idempotencyKey: 'idem-key-1' });
    expect(b).toMatchObject({ created: false, order: { id: a.order.id } });

    const dup = Order.place({
      ...command,
      id: new UuidV7Generator().next(),
      idempotencyKey: 'idem-key-1',
      now: new Date(),
    });
    await expect(new DrizzleOrderRepository(db).add(dup)).rejects.toBeInstanceOf(
      IdempotencyKeyConflictError,
    );
  });

  it('optimistic concurrency: stale update is rejected', async () => {
    const { order } = await newService().execute(command);
    const repo = new DrizzleOrderRepository(db);
    const first = (await repo.findById(order.id))!;
    const second = (await repo.findById(order.id))!;
    first.markPaid('p-1', new Date());
    await repo.update(first);
    second.markPaid('p-1', new Date());
    await expect(repo.update(second)).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('idempotent consumer: same message id applied once, OrderPaid written once', async () => {
    const { order } = await newService().execute(command);
    const markPaid = new MarkOrderPaidService(new DrizzleUnitOfWork(db), new FixedClock());
    const cmd = { messageId: new UuidV7Generator().next(), orderId: order.id, paymentId: 'p-1' };

    expect(await markPaid.execute(cmd)).toBe('applied');
    expect(await markPaid.execute(cmd)).toBe('duplicate');

    const types = (await db.select().from(outbox)).map((r) => r.messageType);
    expect(types).toEqual(['OrderCreated', 'OrderPaid']);
  });
});
