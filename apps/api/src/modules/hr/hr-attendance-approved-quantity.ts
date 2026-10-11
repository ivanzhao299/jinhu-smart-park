export type ApprovedQuantityRequest = Readonly<{
  id: string;
  version: number;
  requestType: string;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
}>;

export type ApprovedQuantityAvailability = "known" | "unknown";

export type ApprovedQuantityResult = Readonly<{
  availability: ApprovedQuantityAvailability;
  durationMs: number | null;
  sources: ReadonlyArray<Readonly<{ id: string; version: number }>>;
  unknownSources: ReadonlyArray<Readonly<{ id: string; version: number; reason: "missing_start" | "invalid_start" | "missing_end" | "invalid_end" | "non_increasing_interval" }>>;
}>;

const isValidDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());

/**
 * Return the exact-millisecond union of approved overtime or business-trip
 * intervals intersecting a half-open window. Empty valid input is known zero;
 * malformed approved source intervals make the whole fact unknown.
 */
export function approvedQuantityForWindow(
  requests: ReadonlyArray<ApprovedQuantityRequest>,
  requestType: "overtime" | "business_trip",
  start: Date,
  end: Date,
): ApprovedQuantityResult {
  const windowWidth = end.getTime() - start.getTime();
  if (!isValidDate(start) || !isValidDate(end) || !Number.isSafeInteger(windowWidth) || windowWidth <= 0) {
    throw new RangeError("Approved quantity window must contain valid increasing instants");
  }

  const approved = requests.filter(row => row.requestType === requestType && row.status === "approved");
  const unknownSources: Array<{ id: string; version: number; reason: ApprovedQuantityResult["unknownSources"][number]["reason"] }> = [];
  const intervals: Array<{ from: number; to: number; id: string; version: number }> = [];

  for (const row of approved) {
    if (row.startAt === null || row.startAt === undefined) {
      unknownSources.push({ id: row.id, version: row.version, reason: "missing_start" });
      continue;
    }
    if (!isValidDate(row.startAt)) {
      unknownSources.push({ id: row.id, version: row.version, reason: "invalid_start" });
      continue;
    }
    if (row.endAt === null || row.endAt === undefined) {
      unknownSources.push({ id: row.id, version: row.version, reason: "missing_end" });
      continue;
    }
    if (!isValidDate(row.endAt)) {
      unknownSources.push({ id: row.id, version: row.version, reason: "invalid_end" });
      continue;
    }
    const rawStart = row.startAt.getTime();
    const rawEnd = row.endAt.getTime();
    if (rawEnd <= rawStart) {
      unknownSources.push({ id: row.id, version: row.version, reason: "non_increasing_interval" });
      continue;
    }
    const from = Math.max(start.getTime(), rawStart);
    const to = Math.min(end.getTime(), rawEnd);
    if (to > from) intervals.push({ from, to, id: row.id, version: row.version });
  }

  const sortSources = <T extends { id: string; version: number }>(rows: T[]) => rows.sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version);
  if (unknownSources.length) {
    return { availability: "unknown", durationMs: null, sources: sortSources(intervals.map(({ id, version }) => ({ id, version }))), unknownSources: sortSources(unknownSources) };
  }

  intervals.sort((a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id) || a.version - b.version);
  let total = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;
  for (const interval of intervals) {
    if (currentStart === null) {
      currentStart = interval.from;
      currentEnd = interval.to;
    } else if (interval.from > currentEnd) {
      total += currentEnd - currentStart;
      currentStart = interval.from;
      currentEnd = interval.to;
    } else {
      currentEnd = Math.max(currentEnd, interval.to);
    }
  }
  if (currentStart !== null) total += currentEnd - currentStart;

  return {
    availability: "known",
    durationMs: total,
    sources: sortSources(intervals.map(({ id, version }) => ({ id, version }))),
    unknownSources: [],
  };
}
