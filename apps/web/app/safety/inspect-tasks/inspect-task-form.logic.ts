export interface FileIdInputProjection {
  available: boolean;
  value: string;
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
