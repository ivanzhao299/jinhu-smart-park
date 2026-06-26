function datePart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function buildEngineeringRectificationCodePrefix(date: Date): string {
  return `GCZG${datePart(date)}`;
}

export function buildEngineeringRectificationCode(date: Date, sequence: number): string {
  return `${buildEngineeringRectificationCodePrefix(date)}${String(sequence).padStart(3, "0")}`;
}

export function parseEngineeringRectificationCodeSequence(rectificationCode: string | null | undefined, prefix: string): number | null {
  if (!rectificationCode?.startsWith(prefix)) return null;
  const suffix = rectificationCode.slice(prefix.length);
  const parsed = Number(suffix);
  return Number.isInteger(parsed) ? parsed : null;
}

export function nextEngineeringRectificationCode(date: Date, latestRectificationCode: string | null | undefined): string {
  const prefix = buildEngineeringRectificationCodePrefix(date);
  const latestSequence = parseEngineeringRectificationCodeSequence(latestRectificationCode, prefix);
  return buildEngineeringRectificationCode(date, (latestSequence ?? 0) + 1);
}
