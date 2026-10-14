export interface IdGenerator {
  /** Opaque, time-ordered id (UUIDv7). */
  next(): string;
}
