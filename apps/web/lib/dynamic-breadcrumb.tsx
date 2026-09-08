"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const DynamicBreadcrumbContext = createContext<((label: string | null) => void) | null>(null);
const DynamicBreadcrumbLabelContext = createContext<string | null>(null);

export function DynamicBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const publisher = useMemo(() => (next: string | null) => setLabel(next), []);
  return <DynamicBreadcrumbContext.Provider value={publisher}>
    <DynamicBreadcrumbLabelContext.Provider value={label}>{children}</DynamicBreadcrumbLabelContext.Provider>
  </DynamicBreadcrumbContext.Provider>;
}

export function useDynamicBreadcrumbLabel(): string | null {
  return useContext(DynamicBreadcrumbLabelContext);
}

export function usePublishDynamicBreadcrumbLabel(label: string | null | undefined): void {
  const publish = useContext(DynamicBreadcrumbContext);
  useEffect(() => {
    if (!publish) return;
    publish(label?.trim() || null);
    return () => publish(null);
  }, [label, publish]);
}
