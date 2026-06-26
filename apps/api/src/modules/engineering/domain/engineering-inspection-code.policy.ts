function dateParts(date: Date): { year: string; month: string; day: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { year, month, day };
}

export function buildEngineeringInspectionCodePrefix(date: Date): string {
  const { year, month, day } = dateParts(date);
  return `GCXJ${year}${month}${day}`;
}

export function buildEngineeringInspectionCode(date: Date, sequence: number): string {
  return `${buildEngineeringInspectionCodePrefix(date)}${String(sequence).padStart(3, "0")}`;
}

export function parseEngineeringInspectionCodeSequence(inspectionCode: string | null | undefined, prefix: string): number | null {
  if (!inspectionCode?.startsWith(prefix)) return null;
  const suffix = inspectionCode.slice(prefix.length);
  if (!/^\d{3}$/.test(suffix)) return null;
  return Number(suffix);
}

export function nextEngineeringInspectionCode(date: Date, latestInspectionCode: string | null | undefined): string {
  const prefix = buildEngineeringInspectionCodePrefix(date);
  const latestSequence = parseEngineeringInspectionCodeSequence(latestInspectionCode, prefix);
  return buildEngineeringInspectionCode(date, (latestSequence ?? 0) + 1);
}
