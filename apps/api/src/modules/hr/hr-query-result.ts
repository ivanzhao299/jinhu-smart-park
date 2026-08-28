/**
 * TypeORM's PostgreSQL QueryRunner returns INSERT rows as `Row[]`, but wraps
 * UPDATE/DELETE `RETURNING` results as `[Row[], affectedCount]`.
 * Normalize both shapes at the HR service/database boundary.
 */
export function firstHrMutationRow<T>(result: unknown): T | undefined {
  if (!Array.isArray(result)) return undefined;
  const rows = Array.isArray(result[0]) ? result[0] : result;
  return rows[0] as T | undefined;
}
