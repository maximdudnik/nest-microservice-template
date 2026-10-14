import {
  FakeRiskAssessment,
  FixedClock,
  InMemoryUnitOfWork,
  SequentialIds,
} from '../../../../test/fakes/in-memory';
import { OrderRejectedError, ProviderUnavailableError } from '../errors';
import { CreateOrderService } from './create-order.service';

const command = {
  customerId: 'c-1',
  currency: 'EUR',
  lines: [{ sku: 'A', quantity: 2, unitPriceMinor: 500 }],
};

function setup() {
  const uow = new InMemoryUnitOfWork();
  const risk = new FakeRiskAssessment();
  const service = new CreateOrderService(
    uow.orders,
    uow,
    risk,
    new FixedClock(),
    new SequentialIds(),
  );
  return { uow, risk, service };
}

describe('CreateOrderService', () => {
  it('persists the order and writes OrderCreated to the outbox atomically', async () => {
    const { uow, service } = setup();
    const result = await service.execute(command);

    expect(result.created).toBe(true);
    expect(result.order).toMatchObject({ status: 'PENDING_PAYMENT', totalMinor: 1000 });
    expect(uow.orders.rows.size).toBe(1);
    expect(uow.outbox.events).toEqual([
      expect.objectContaining({ type: 'OrderCreated', aggregateId: result.order.id }),
    ]);
  });

  it('returns the existing order for a replayed Idempotency-Key without side effects', async () => {
    const { uow, risk, service } = setup();
    const first = await service.execute({ ...command, idempotencyKey: 'key-12345' });
    const second = await service.execute({ ...command, idempotencyKey: 'key-12345' });

    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
    expect(uow.orders.rows.size).toBe(1);
    expect(uow.outbox.events).toHaveLength(1);
    expect(risk.calls).toBe(1);
  });

  it('rejects when risk assessment denies, persisting nothing', async () => {
    const { uow, risk, service } = setup();
    risk.decision = { outcome: 'rejected', reason: 'HIGH_RISK' };

    await expect(service.execute(command)).rejects.toBeInstanceOf(OrderRejectedError);
    expect(uow.orders.rows.size).toBe(0);
    expect(uow.outbox.events).toHaveLength(0);
  });

  it('propagates provider unavailability', async () => {
    const { risk, service } = setup();
    risk.error = new ProviderUnavailableError('down');
    await expect(service.execute(command)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
