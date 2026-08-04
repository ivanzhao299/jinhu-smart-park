export interface FileIdInputProjection {
  available: boolean;
  value: string;
}

export interface RecordArrayProjection<T> {
  available: boolean;
  value: T[];
}

export type InspectTaskExecutionEntry = "start" | "resume" | "hidden";

export function resolveInspectTaskExecutionEntry(status: string): InspectTaskExecutionEntry {
  if (status === "10" || status === "40") return "start";
  if (status === "20") return "resume";
  return "hidden";
}

export function isCurrentRequestGeneration(requestGeneration: number, activeGeneration: number): boolean {
  return requestGeneration === activeGeneration;
}

export function normalizeRecordArrayProjection<T extends object>(
  value: unknown,
  requiredStringKeys: string[]
): RecordArrayProjection<T> {
  if (!Array.isArray(value)) return { available: false, value: [] };

  const valid = value.every((item): item is T => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return requiredStringKeys.every((key) => typeof record[key] === "string" && record[key].trim().length > 0);
  });
  return valid ? { available: true, value } : { available: false, value: [] };
}

export function normalizeFileIdProjection(value: unknown): FileIdInputProjection {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return { available: false, value: "" };
  }

  return {
    available: true,
    value: value
      .map((item) => item.trim())
      .filter(Boolean)
      .join(",")
  };
}

export function normalizeFileIdInput(value: unknown): string {
  return normalizeFileIdProjection(value).value;
}

export function buildFileIdReplacement(
  value: string,
  available: boolean
): { photo_file_ids?: string[] } {
  if (!available) return {};

  return {
    photo_file_ids: value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  };
}

export function normalizeNumericInput(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value !== "string") return "";

  const normalized = value.trim();
  if (!normalized) return "";
  return Number.isFinite(Number(normalized)) ? normalized : "";
}
