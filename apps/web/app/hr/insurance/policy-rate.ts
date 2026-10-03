/** Percentage controls retain strings; four percentage decimals equal six fractional decimals. */
export function insuranceRateFromPercent(value: string): string | null {
  if (!/^\d{1,14}(?:\.\d{1,4})?$/u.test(value)) return null;
  const [whole, fraction=""] = value.split(".");
  const scaled=BigInt(whole!)*10000n+BigInt(fraction.padEnd(4,"0"));
  if (scaled>999999999999999999n) return null;
  return `${scaled/1000000n}.${String(scaled%1000000n).padStart(6,"0")}`;
}
export function insurancePercentFromRate(value: string): string | null {
  if (!/^\d{1,12}(?:\.\d{1,6})?$/u.test(value)) return null;
  const [whole,fraction=""]=value.split(".");
  const scaled=BigInt(whole!)*1000000n+BigInt(fraction.padEnd(6,"0"));
  return `${scaled/10000n}.${String(scaled%10000n).padStart(4,"0")}`;
}
