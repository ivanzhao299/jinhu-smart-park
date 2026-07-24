"use client";

import { useEffect, useState } from "react";
import { fetchPublicBranding, type AppBranding, readStoredBranding } from "../../lib/app-branding";

export function useAppBranding() {
  const [branding, setBranding] = useState<AppBranding>(() => readStoredBranding());

  useEffect(() => {
    let active = true;
    const applyBranding = (nextBranding: AppBranding) => {
      if (!active) return;
      setBranding(nextBranding);
      document.title = nextBranding.systemName;
    };

    applyBranding(readStoredBranding());
    void fetchPublicBranding().then(applyBranding).catch(() => undefined);

    const handleChange = (event: Event) => {
      const customEvent = event as CustomEvent<AppBranding>;
      applyBranding(customEvent.detail ?? readStoredBranding());
    };

    window.addEventListener("jinhu:branding-change", handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      active = false;
      window.removeEventListener("jinhu:branding-change", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  return branding;
}
