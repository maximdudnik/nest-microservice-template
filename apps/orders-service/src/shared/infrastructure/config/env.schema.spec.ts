import { loadConfig } from './env.schema';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  RISK_API_URL: 'http://localhost:4010',
  RISK_API_KEY: 'secret',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const cfg = loadConfig(valid);
    expect(cfg.PORT).toBe(3000);
    expect(cfg.LOG_PRETTY).toBe(false);
  });

  it('fails fast without leaking values', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'mysql://secret@x' })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'mysql://secret@x' })).not.toThrow(/secret/);
  });
});
