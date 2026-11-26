/**
 * Names of the columns or constraint behind a P2002 unique violation.
 *
 * Prisma 6 put them in `meta.target`. Prisma 7 with the `pg` driver adapter leaves `target` unset and
 * reports the constraint under `meta.driverAdapterError.cause.constraint` instead: `{ index }` for an
 * index such as `User_username_lower_key`, or `{ fields }` when it can name the columns. Both shapes
 * are read so callers can match on either.
 */
export function uniqueViolationTargets(meta: unknown): string[] {
  if (!isRecord(meta)) return [];
  const constraint = pick(pick(pick(meta, 'driverAdapterError'), 'cause'), 'constraint');
  return [meta.target, pick(constraint, 'index'), pick(constraint, 'fields')]
    .flat()
    .filter((value): value is string => typeof value === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pick(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}
