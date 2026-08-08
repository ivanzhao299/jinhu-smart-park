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
      <PropertyPageSurface>
        <PageState state={{ kind: "forbidden-full" }} />
      </PropertyPageSurface>
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
    return (
      <PropertyPageSurface>
        <PageState state={{ kind: "forbidden-full" }} />
      </PropertyPageSurface>
    );
  }
  return <>{children}</>;
}
