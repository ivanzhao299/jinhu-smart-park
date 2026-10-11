/** Accurate interval facts stay distinct from payable units and declared days. */
export const MAX_ATTENDANCE_MONTH_MS = 31 * 86400000;

export function sumApprovedIntervalMilliseconds(
  traces: readonly Record<string, unknown>[],
  kind: "overtime" | "businessTrip",
): string | null {
  if (!traces.length || traces.length > 31) return null;
  const dates = new Set<string>();
  let total = 0;
  for (const trace of traces) {
    if (typeof trace.workDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(trace.workDate) || dates.has(trace.workDate)) return null;
    dates.add(trace.workDate);
    const start = new Date(`${trace.workDate}T00:00:00+08:00`);
    if (!Number.isFinite(start.getTime()) || new Date(start.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== trace.workDate) return null;
    const value = trace.approvedIntervalQuantities;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const fact = value as Record<string, unknown>;
    if (fact.basis !== "shanghai-calendar-interval-v1" || fact.windowStart !== start.toISOString() || fact.windowEnd !== new Date(start.getTime() + 86400000).toISOString()) return null;
    const raw = fact[kind];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const quantity = raw as Record<string, unknown>;
    if (quantity.availability !== "known" || typeof quantity.durationMs !== "number" || !Number.isSafeInteger(quantity.durationMs) || quantity.durationMs < 0 || quantity.durationMs > 86400000 || !Array.isArray(quantity.sources) || !Array.isArray(quantity.unknownSources) || quantity.unknownSources.length) return null;
    if (quantity.sources.some(source => !source || typeof source !== "object" || typeof source.id !== "string" || !source.id || !Number.isSafeInteger(source.version) || source.version < 1)) return null;
    if (quantity.durationMs > 0 && !quantity.sources.length) return null;
    total += quantity.durationMs;
    if (!Number.isSafeInteger(total) || total > MAX_ATTENDANCE_MONTH_MS) return null;
  }
  return String(total);
}

/** Unknown differences cannot be manufactured as zero. */
export function approvedIntervalDifference(current: string | null, previous: string | null) {
  if (previous === null) return { delta: null, availability: "previous_unknown" } as const;
  if (current === null) return { delta: null, availability: "current_unknown" } as const;
  return { delta: String(BigInt(current) - BigInt(previous)), availability: "known" } as const;
}
