"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageState, PropertyPageSurface } from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";
import { resolveHousingLanding } from "./housing-workbench-contract";

export function HousingLandingClient() {
  const router = useRouter();
  const user = useAuthUser();
  const target = resolveHousingLanding(user);

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  return (
    <PropertyPageSurface>
      <PageState
        state={target
          ? { kind: "initial-loading" }
          : { kind: "forbidden-full" }}
      />
    </PropertyPageSurface>
  );
}
