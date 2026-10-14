import type { Money } from '../../../domain';

/**
 * Outbound port for a third-party risk/fraud provider, in OUR language (standards §6).
 * Adapters translate provider errors to ProviderUnavailableError / ProviderContractViolationError.
 */
export type RiskDecision = { outcome: 'approved' } | { outcome: 'rejected'; reason: string };

export interface RiskAssessment {
  assessOrder(input: { orderId: string; customerId: string; total: Money }): Promise<RiskDecision>;
}
