/** Postgres unique_violation, unwrapping drizzle's DrizzleQueryError cause chain. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const e = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (e.code === '23505') return constraint === undefined || e.constraint === constraint;
    cur = e.cause;
  }
  return false;
}
