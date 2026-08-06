export function typeormQueryRows<Row>(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  if (!Array.isArray(value[0])) return value as Row[];
  const rows = value[0] as Row[];
  const rowCount = value[1];
  if (value.length !== 2 || !Number.isInteger(rowCount) || rowCount !== rows.length) return [];
  return rows;
}
