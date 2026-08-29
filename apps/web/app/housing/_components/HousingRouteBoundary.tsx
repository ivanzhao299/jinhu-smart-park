"use client";

import { notFound, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  PageState,
  PropertyPageSurface,
  projectPropertyCapabilities,
  resolveAuthorizedPropertyRoute,
  resolvePropertyRoute
} from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";

export function HousingRouteBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useAuthUser();
  const resolution = resolvePropertyRoute(pathname);
  const authorizedResolution = resolveAuthorizedPropertyRoute(pathname, user);

  if (resolution.kind === "compatibility-redirect") {
    return authorizedResolution.kind === "compatibility-redirect" ? <>{children}</> : (
      <HousingForbidden />
    );
  }
  if (resolution.kind === "unknown-property" || resolution.kind === "non-property") {
    notFound();
  }
  if (resolution.kind === "legacy") {
    return <>{children}</>;
  }
  if (resolution.kind !== "surface" && resolution.kind !== "detail") {
    notFound();
  }

  const capabilities = projectPropertyCapabilities(user, resolution.featureId);
  if (!capabilities.pageAllowed) {
    return <HousingForbidden />;
  }
  return <>{children}</>;
}

function HousingForbidden() {
  return <PropertyPageSurface>
    <header className="ds-hero">
      <p className="ds-eyebrow">长租经营</p>
      <h1>无法访问长租经营工作台</h1>
    </header>
    <PageState state={{ kind: "forbidden-full" }} />
  </PropertyPageSurface>;
}
