export interface FileIdInputProjection {
  available: boolean;
  value: string;
}

export function normalizeFileIdProjection(value: unknown): FileIdInputProjection {
  if (!Array.isArray(value)) {
    return { available: false, value: "" };
  }

  return {
    available: true,
    value: value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(",")
  };
}

export function normalizeFileIdInput(value: unknown): string {
  return normalizeFileIdProjection(value).value;
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
