"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useAuthUser } from "../../../lib/auth-context";
import { PageState, PropertyPageSurface, projectPropertyCapabilities } from "../../../features/property-shared";
import { HOMESTAY_LANDING_PRIORITY, resolveHomestayLanding } from "./homestay-workbench.logic";

export function HomestayLandingClient() {
  const user = useAuthUser();
  const router = useRouter();
  const resolution = useMemo(
    () => resolveHomestayLanding((featureId) => projectPropertyCapabilities(user, featureId)),
    [user]
  );

  useEffect(() => {
    if (resolution.kind === "redirect") router.replace(resolution.href);
  }, [resolution, router]);

  if (resolution.kind === "redirect") {
    return (
      <PropertyPageSurface>
        <PageState state={{ kind: "initial-loading" }} />
      </PropertyPageSurface>
    );
  }
  return (
    <PropertyPageSurface>
      <header className="ds-hero">
        <p className="ds-eyebrow">民宿管理</p>
        <h1>民宿工作台</h1>
      </header>
      <PageState
        state={{ kind: "forbidden-full" }}
      >
        <p>{resolution.kind === "module-forbidden" ? "民宿或资产模块当前不可用。" : "当前岗位没有可访问的民宿页面。"}</p>
      </PageState>
      <span hidden>{HOMESTAY_LANDING_PRIORITY.length}</span>
    </PropertyPageSurface>
  );
}
