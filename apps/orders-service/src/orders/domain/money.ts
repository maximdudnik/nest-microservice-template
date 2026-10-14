import { InvalidOrderError } from './order.errors';

/** Money as integer minor units + ISO-4217 code (standards §4). Immutable value object. */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: string,
  ) {}

  static of(amountMinor: number, currency: string): Money {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw new InvalidOrderError('Amount must be a non-negative integer in minor units', {
        details: {
          amountMinor,
        },
      });
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new InvalidOrderError('Currency must be an ISO-4217 code', { details: { currency } });
    }
    return new Money(amountMinor, currency);
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor + other.amountMinor, this.currency);
  }

  multiply(factor: number): Money {
    return Money.of(this.amountMinor * factor, this.currency);
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new InvalidOrderError('Currency mismatch', {
        details: {
          expected: this.currency,
          actual: other.currency,
        },
      });
    }
  }
}
