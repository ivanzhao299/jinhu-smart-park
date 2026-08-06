"use client";

import { notFound, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageState, PropertyPageSurface, projectPropertyCapabilities, resolvePropertyRoute } from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";

export function HomestayRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useAuthUser();
  const route = resolvePropertyRoute(pathname);

  if (route.kind === "unknown-property" || route.kind === "non-property" || route.kind === "compatibility-redirect") {
    notFound();
  }
  if (route.kind === "legacy") return children;
  if (!route.featureId.startsWith("homestay.")) notFound();

  const capability = projectPropertyCapabilities(user, route.featureId);
  if (!capability.moduleAvailable || !capability.pageAllowed) {
    return (
      <PropertyPageSurface>
        <header className="ds-hero">
          <p className="ds-eyebrow">民宿管理</p>
          <h1>无法访问该工作台</h1>
        </header>
        <PageState state={{ kind: "forbidden-full" }} />
      </PropertyPageSurface>
    );
  }
  return children;
}
