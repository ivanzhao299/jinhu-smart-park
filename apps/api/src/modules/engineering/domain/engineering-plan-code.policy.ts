function dateParts(date: Date): { year: string; month: string; day: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { year, month, day };
}

export function buildEngineeringPlanCodePrefix(date: Date): string {
  const { year, month, day } = dateParts(date);
  return `GCJH${year}${month}${day}`;
}

export function buildEngineeringPlanCode(date: Date, sequence: number): string {
  return `${buildEngineeringPlanCodePrefix(date)}${String(sequence).padStart(3, "0")}`;
}

export function parseEngineeringPlanCodeSequence(planCode: string | null | undefined, prefix: string): number | null {
  if (!planCode?.startsWith(prefix)) return null;
  const suffix = planCode.slice(prefix.length);
  if (!/^\d{3}$/.test(suffix)) return null;
  return Number(suffix);
}

export function nextEngineeringPlanCode(date: Date, latestPlanCode: string | null | undefined): string {
  const prefix = buildEngineeringPlanCodePrefix(date);
  const latestSequence = parseEngineeringPlanCodeSequence(latestPlanCode, prefix);
  return buildEngineeringPlanCode(date, (latestSequence ?? 0) + 1);
}
