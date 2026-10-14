import { randomBytes } from 'node:crypto';
import type { IdGenerator } from '../../application/ports/outbound';

/** RFC 9562 UUIDv7: 48-bit unix ms timestamp + random bits. Time-ordered => index friendly. */
export class UuidV7Generator implements IdGenerator {
  next(): string {
    const bytes = randomBytes(16);
    const ts = BigInt(Date.now());
    for (let i = 0; i < 6; i++) bytes[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
    bytes[6] = (bytes[6]! & 0x0f) | 0x70;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const h = bytes.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}
