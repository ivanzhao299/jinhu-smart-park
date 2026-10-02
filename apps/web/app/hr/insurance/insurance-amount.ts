/** API amounts are decimal strings in cents. Missing values never imply zero. */
export function loadedEmployeeAmount(rows: ReadonlyArray<{ employeeAmount?: string | null }>): string {
  let total = 0n;
  for (const row of rows) {
    const value = row.employeeAmount;
    if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return "—";
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
    total += negative ? -cents : cents;
  }
  const magnitude = total < 0n ? -total : total;
  return `${total < 0n ? "-" : ""}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, "0")}`;
}
