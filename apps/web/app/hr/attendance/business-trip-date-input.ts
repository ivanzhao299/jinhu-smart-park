/** Shanghai business inputs must not depend on the operator's system timezone. */
export function tripDateInput(value: unknown): string {
  if (typeof value !== "string") return "";
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || instant % 60000 !== 0) return "";
  return new Date(instant + 8 * 3600000).toISOString().slice(0, 16);
}

export function tripDateInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const instant = Date.parse(`${value}:00+08:00`);
  if (!Number.isFinite(instant)) return null;
  const iso = new Date(instant).toISOString();
  return tripDateInput(iso) === value ? iso : null;
}

export function tripEndBound(start: string, offsetMinutes: number): string | undefined {
  const instant = tripDateInstant(start);
  return instant ? tripDateInput(new Date(Date.parse(instant) + offsetMinutes * 60000).toISOString()) : undefined;
}

export function tripDateWindow(start: string, end: string) {
  const startAt = tripDateInstant(start), endAt = tripDateInstant(end);
  if (!startAt || !endAt) return null;
  const durationMinutes = (Date.parse(endAt) - Date.parse(startAt)) / 60000;
  return durationMinutes > 0 && durationMinutes <= 31 * 1440 ? { startAt, endAt, durationMinutes } : null;
}

export function tripDateLabel(value: string | null): string {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
    : "未登记";
}
