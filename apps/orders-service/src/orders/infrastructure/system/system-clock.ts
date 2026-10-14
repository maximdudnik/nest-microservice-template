import type { Clock } from '../../application/ports/outbound';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
