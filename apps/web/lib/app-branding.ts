import { apiRequest } from "./api-client";

export interface AppBranding {
  systemName: string;
  shortName: string;
  logoAlt: string;
  logoFileId: string | null;
  logoUrl: string | null;
  configured?: boolean;
  runtime_mode?: "integrated" | "hr_enterprise";
}

export const BRANDING_STORAGE_KEY = "jinhu_branding";

export const defaultAppBranding: AppBranding = {
  systemName: "企业数字运营平台",
  shortName: "金湖科创产业园",
  logoAlt: "金湖科创产业园",
  logoFileId: null,
  logoUrl: null
};

export function normalizeBranding(value?: Partial<AppBranding> | null): AppBranding {
  return {
    systemName: value?.systemName?.trim() || defaultAppBranding.systemName,
    shortName: value?.shortName?.trim() || defaultAppBranding.shortName,
    logoAlt: value?.logoAlt?.trim() || defaultAppBranding.logoAlt,
    logoFileId: value?.logoFileId?.trim() || null,
    logoUrl: value?.logoUrl?.trim() || null,
    configured: value?.configured === true,
    runtime_mode: value?.runtime_mode === "hr_enterprise" ? "hr_enterprise" : "integrated"
  };
}

export function resolveBrandLogo(branding: AppBranding, fallback: string): string {
  return branding.logoUrl || (branding.runtime_mode === "hr_enterprise" ? "/brand/hr-symbol.svg" : fallback);
}

export function readStoredBranding(): AppBranding {
  if (typeof window === "undefined") {
    return defaultAppBranding;
  }

  try {
    const rawValue = window.localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!rawValue) {
      return defaultAppBranding;
    }
    return normalizeBranding(JSON.parse(rawValue) as Partial<AppBranding>);
  } catch {
    return defaultAppBranding;
  }
}

export function writeStoredBranding(value: Partial<AppBranding>): AppBranding {
  const nextBranding = normalizeBranding(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(nextBranding));
    window.dispatchEvent(new CustomEvent<AppBranding>("jinhu:branding-change", { detail: nextBranding }));
  }
  return nextBranding;
}

export async function fetchPublicBranding(): Promise<AppBranding> {
  const response = await apiRequest<AppBranding>("/tenants/public/branding", { cache: "no-store" });
  const branding = response.data.configured ? response.data : readStoredBranding();
  return writeStoredBranding({ ...branding, runtime_mode: response.data.runtime_mode ?? "integrated" });
}

export async function fetchCurrentBranding(token: string): Promise<AppBranding> {
  const response = await apiRequest<AppBranding>("/tenants/current/branding", {
    cache: "no-store",
    token
  });
  return response.data.configured ? writeStoredBranding(response.data) : normalizeBranding(response.data);
}

export async function saveCurrentBranding(token: string, value: Partial<AppBranding>): Promise<AppBranding> {
  const response = await apiRequest<AppBranding>("/tenants/current/branding", {
    method: "PATCH",
    token,
    body: normalizeBranding(value)
  });
  return writeStoredBranding({ ...response.data, configured: true });
}
