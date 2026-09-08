/** Legacy session/template identifiers are SQL Server int values. */
export function parseLegacyQueryId(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!/^\d+$/u.test(normalized)) throw new Error("请输入 0 至 2147483647 之间的整数编号。");
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed > 2147483647) {
    throw new Error("请输入 0 至 2147483647 之间的整数编号。");
  }
  return parsed;
}
