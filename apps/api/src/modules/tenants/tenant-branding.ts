export interface TenantBrandingView {
  systemName: string;
  shortName: string;
  logoAlt: string;
  configured: boolean;
}

export const DEFAULT_TENANT_BRANDING: TenantBrandingView = {
  systemName: "园区数字运营平台",
  shortName: "金湖科创产业园",
  logoAlt: "金湖科创产业园",
  configured: false
};

export function normalizeTenantBranding(value: unknown): TenantBrandingView {
  const branding = isRecord(value) ? value : {};
  return {
    systemName: normalizedText(branding.systemName, DEFAULT_TENANT_BRANDING.systemName),
    shortName: normalizedText(branding.shortName, DEFAULT_TENANT_BRANDING.shortName),
    logoAlt: normalizedText(branding.logoAlt, DEFAULT_TENANT_BRANDING.logoAlt),
    configured: hasConfiguredBranding(branding)
  };
}

export function normalizeBrandingHost(value?: string): string {
  const candidate = value?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!candidate) return "";
  try {
    return new URL(candidate.includes("://") ? candidate : `http://${candidate}`).hostname.toLowerCase();
  } catch {
    return candidate.replace(/:\d+$/, "");
  }
}

export function tenantMatchesBrandingHost(
  host: string,
  domains: string[] = [],
  websites: string[] = []
): boolean {
  const normalizedHost = normalizeBrandingHost(host);
  if (!normalizedHost) return false;
  return [...domains, ...websites].some((candidate) => normalizeBrandingHost(candidate) === normalizedHost);
}

function normalizedText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hasConfiguredBranding(value: Record<string, unknown>): boolean {
  return ["systemName", "shortName", "logoAlt"].every(
    (key) => typeof value[key] === "string" && Boolean((value[key] as string).trim())
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
