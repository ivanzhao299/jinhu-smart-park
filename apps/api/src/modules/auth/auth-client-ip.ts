import type { Request } from "express";

export function isAuthTrustedProxyEnabled(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return Boolean(normalized) && !["0", "false", "no", "off"].includes(normalized);
}

export function resolveAuthClientIp(request: Request, trustProxySetting: string | undefined): string | null {
  if (isAuthTrustedProxyEnabled(trustProxySetting)) {
    const forwardedFor = request.headers["x-forwarded-for"];
    const firstForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const clientIp = firstForwarded?.split(",")[0]?.trim();
    if (clientIp) {
      return clientIp;
    }
  }
  return request.ip ?? null;
}
