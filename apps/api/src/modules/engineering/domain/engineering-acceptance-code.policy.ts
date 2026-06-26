const ACCEPTANCE_CODE_PREFIX = "GCYS";

export function buildEngineeringAcceptanceCodePrefix(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${ACCEPTANCE_CODE_PREFIX}${year}${month}${day}`;
}

export function nextEngineeringAcceptanceCode(date: Date, latestCode?: string | null): string {
  const prefix = buildEngineeringAcceptanceCodePrefix(date);
  if (!latestCode?.startsWith(prefix)) {
    return `${prefix}001`;
  }
  const sequence = Number(latestCode.slice(prefix.length));
  const nextSequence = Number.isFinite(sequence) ? sequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(3, "0")}`;
}
