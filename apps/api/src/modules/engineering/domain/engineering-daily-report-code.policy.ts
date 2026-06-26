function dateParts(date: Date): { year: string; month: string; day: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { year, month, day };
}

export function buildEngineeringDailyReportCodePrefix(date: Date): string {
  const { year, month, day } = dateParts(date);
  return `GCRB${year}${month}${day}`;
}

export function buildEngineeringDailyReportCode(date: Date, sequence: number): string {
  return `${buildEngineeringDailyReportCodePrefix(date)}${String(sequence).padStart(3, "0")}`;
}

export function parseEngineeringDailyReportCodeSequence(reportCode: string | null | undefined, prefix: string): number | null {
  if (!reportCode?.startsWith(prefix)) return null;
  const suffix = reportCode.slice(prefix.length);
  if (!/^\d{3}$/.test(suffix)) return null;
  return Number(suffix);
}

export function nextEngineeringDailyReportCode(date: Date, latestReportCode: string | null | undefined): string {
  const prefix = buildEngineeringDailyReportCodePrefix(date);
  const latestSequence = parseEngineeringDailyReportCodeSequence(latestReportCode, prefix);
  return buildEngineeringDailyReportCode(date, (latestSequence ?? 0) + 1);
}
