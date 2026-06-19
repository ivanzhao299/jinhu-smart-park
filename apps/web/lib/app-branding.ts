export interface AppBranding {
  systemName: string;
  shortName: string;
  logoAlt: string;
}

export const BRANDING_STORAGE_KEY = "jinhu_branding";

export const defaultAppBranding: AppBranding = {
  systemName: "园区数字运营平台",
  shortName: "金湖科创产业园",
  logoAlt: "金湖科创产业园"
};

export function normalizeBranding(value?: Partial<AppBranding> | null): AppBranding {
  return {
    systemName: value?.systemName?.trim() || defaultAppBranding.systemName,
    shortName: value?.shortName?.trim() || defaultAppBranding.shortName,
    logoAlt: value?.logoAlt?.trim() || defaultAppBranding.logoAlt
  };
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
