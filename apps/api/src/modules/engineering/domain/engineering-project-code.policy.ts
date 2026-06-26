const PROJECT_CODE_PREFIX = "GC";
const PROJECT_CODE_SEQUENCE_LENGTH = 3;

export function formatEngineeringProjectCodeDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function buildEngineeringProjectCodePrefix(date: Date): string {
  return `${PROJECT_CODE_PREFIX}${formatEngineeringProjectCodeDate(date)}`;
}

export function parseEngineeringProjectCodeSequence(projectCode: string, prefix: string): number | null {
  if (!projectCode.startsWith(prefix)) return null;
  const sequenceText = projectCode.slice(prefix.length);
  if (!/^\d+$/.test(sequenceText)) return null;
  return Number(sequenceText);
}

export function buildEngineeringProjectCode(date: Date, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Engineering project code sequence must be a positive integer");
  }
  return `${buildEngineeringProjectCodePrefix(date)}${String(sequence).padStart(PROJECT_CODE_SEQUENCE_LENGTH, "0")}`;
}

export function nextEngineeringProjectCode(date: Date, latestProjectCode: string | null | undefined): string {
  const prefix = buildEngineeringProjectCodePrefix(date);
  const latestSequence = latestProjectCode ? parseEngineeringProjectCodeSequence(latestProjectCode, prefix) : null;
  return buildEngineeringProjectCode(date, latestSequence === null ? 1 : latestSequence + 1);
}
