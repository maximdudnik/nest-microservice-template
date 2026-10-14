import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BrokenCircuitError,
  ConsecutiveBreaker,
  ExponentialBackoff,
  TaskCancelledError,
  TimeoutStrategy,
  circuitBreaker,
  handleWhen,
  retry,
  timeout,
  wrap,
} from 'cockatiel';
import { APP_CONFIG } from '../../../../shared/infrastructure/config/config.module';
import type { AppConfig } from '../../../../shared/infrastructure/config/env.schema';
import {
  CorrelationContext,
  REQUEST_ID_HEADER,
} from '../../../../shared/infrastructure/correlation/correlation-context';
import {
  ProviderContractViolationError,
  ProviderUnavailableError,
} from '../../../application/errors';
import type { RiskAssessment, RiskDecision } from '../../../application/ports/outbound';
import type { Money } from '../../../domain';
import { riskApiAssessmentResponse } from './risk-api.schemas';

/** Transient = worth retrying: 5xx, 429. */
class TransientHttpError extends Error {
  constructor(readonly status: number) {
    super(`Transient HTTP ${status}`);
  }
}

/** fetch() network failures surface as TypeError. */
const isTransient = (err: Error): boolean =>
  err instanceof TransientHttpError ||
  err instanceof TaskCancelledError ||
  err.name === 'TypeError';

/**
 * Sample third-party adapter (anti-corruption layer) implementing the RiskAssessment port.
 * Policy (outer -> inner): retry (3 attempts, exponential backoff w/ jitter) -> circuit breaker -> timeout.
 * Provider types never leave this folder.
 */
@Injectable()
export class RiskApiClient implements RiskAssessment {
  private readonly logger = new Logger(RiskApiClient.name);
  private readonly policy;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const retryPolicy = retry(handleWhen(isTransient), {
      maxAttempts: 2, // + initial call = 3 attempts
      backoff: new ExponentialBackoff({ initialDelay: 100, maxDelay: 1_000 }),
    });
    const breaker = circuitBreaker(handleWhen(isTransient), {
      halfOpenAfter: 10_000,
      breaker: new ConsecutiveBreaker(5),
    });
    breaker.onStateChange((state) =>
      this.logger.warn({ provider: 'risk-api', state }, 'Circuit breaker state changed'),
    );
    const timeoutPolicy = timeout(config.RISK_API_TIMEOUT_MS, TimeoutStrategy.Aggressive);
    this.policy = wrap(retryPolicy, breaker, timeoutPolicy);
  }

  async assessOrder(input: {
    orderId: string;
    customerId: string;
    total: Money;
  }): Promise<RiskDecision> {
    let body: unknown;
    try {
      body = await this.policy.execute(({ signal }) => this.post(input, signal));
    } catch (err) {
      if (err instanceof BrokenCircuitError || (err instanceof Error && isTransient(err))) {
        throw new ProviderUnavailableError('Risk provider unavailable', { cause: err });
      }
      throw err;
    }

    const parsed = riskApiAssessmentResponse.safeParse(body);
    if (!parsed.success) {
      throw new ProviderContractViolationError('Unexpected risk provider response', {
        cause: parsed.error,
      });
    }
    // Provider vocabulary -> ours. REVIEW treated as approved (business decision; record as ADR).
    return parsed.data.verdict === 'DENY'
      ? { outcome: 'rejected', reason: parsed.data.reason_code ?? 'RISK_DENIED' }
      : { outcome: 'approved' };
  }

  private async post(
    input: { orderId: string; customerId: string; total: Money },
    signal: AbortSignal,
  ): Promise<unknown> {
    const res = await fetch(new URL('/v1/assessments', this.config.RISK_API_URL), {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.RISK_API_KEY}`,
        // Derived from OUR operation id => retries never double-assess.
        'idempotency-key': `order-${input.orderId}`,
        [REQUEST_ID_HEADER]: CorrelationContext.getOrCreate(),
      },
      body: JSON.stringify({
        reference: input.orderId,
        customer_ref: input.customerId,
        amount: input.total.amountMinor,
        currency: input.total.currency,
      }),
    });
    if (res.status === 429 || res.status >= 500) throw new TransientHttpError(res.status);
    if (!res.ok)
      throw new ProviderContractViolationError(`Risk provider returned HTTP ${res.status}`);
    return res.json();
  }
}
