"use client";

import { useEffect, useState } from "react";
import { type AppBranding, readStoredBranding } from "../../lib/app-branding";

export function useAppBranding() {
  const [branding, setBranding] = useState<AppBranding>(() => readStoredBranding());

  useEffect(() => {
    setBranding(readStoredBranding());

    const handleChange = (event: Event) => {
      const customEvent = event as CustomEvent<AppBranding>;
      setBranding(customEvent.detail ?? readStoredBranding());
    };

    window.addEventListener("jinhu:branding-change", handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener("jinhu:branding-change", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  return branding;
}
