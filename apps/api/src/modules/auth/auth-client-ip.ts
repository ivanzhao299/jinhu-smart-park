import type { Request } from "express";

export function parseTrustProxySetting(value: string | undefined): boolean | number | string | undefined {
  const normalized = (value ?? "").trim();
  const lowered = normalized.toLowerCase();
  if (!normalized || ["0", "false", "no", "off"].includes(lowered)) {
    return undefined;
  }
  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  if (["true", "yes", "on"].includes(lowered)) {
    return true;
  }
  return normalized;
}

export function resolveAuthClientIp(request: Request): string | null {
  return request.ip ?? null;
}
