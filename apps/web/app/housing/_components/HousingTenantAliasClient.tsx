"use client";

import { useEffect } from "react";
import {
  PageState,
  PropertyPageSurface,
  resolveAuthorizedPropertyRoute
} from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";

export function HousingTenantAliasClient({ partyId }: { partyId: string }) {
  const user = useAuthUser();
  const resolution = resolveAuthorizedPropertyRoute(
    `/housing/tenants/${encodeURIComponent(partyId)}`,
    user
  );
  const redirectTo =
    resolution.kind === "compatibility-redirect"
      ? `/assets/parties/${encodeURIComponent(partyId)}`
      : null;

  useEffect(() => {
    if (redirectTo) {
      window.location.replace(redirectTo);
    }
  }, [redirectTo]);

  return (
    <PropertyPageSurface>
      <PageState
        state={redirectTo ? { kind: "initial-loading" } : { kind: "forbidden-full" }}
      />
    </PropertyPageSurface>
  );
}
