function dateParts(date: Date): { year: string; month: string; day: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { year, month, day };
}

export function buildEngineeringIssueCodePrefix(date: Date): string {
  const { year, month, day } = dateParts(date);
  return `GCWT${year}${month}${day}`;
}

export function buildEngineeringIssueCode(date: Date, sequence: number): string {
  return `${buildEngineeringIssueCodePrefix(date)}${String(sequence).padStart(3, "0")}`;
}

export function parseEngineeringIssueCodeSequence(issueCode: string | null | undefined, prefix: string): number | null {
  if (!issueCode?.startsWith(prefix)) return null;
  const suffix = issueCode.slice(prefix.length);
  if (!/^\d{3}$/.test(suffix)) return null;
  return Number(suffix);
}

export function nextEngineeringIssueCode(date: Date, latestIssueCode: string | null | undefined): string {
  const prefix = buildEngineeringIssueCodePrefix(date);
  const latestSequence = parseEngineeringIssueCodeSequence(latestIssueCode, prefix);
  return buildEngineeringIssueCode(date, (latestSequence ?? 0) + 1);
}
