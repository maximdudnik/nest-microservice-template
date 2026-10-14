/** Marker shape for domain events. Pure TS, no transport concerns. */
export interface DomainEvent {
  readonly type: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
}
