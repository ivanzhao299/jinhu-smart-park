"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CanonicalDetailShell,
  PropertyPanelSurface,
  projectPropertyCapabilities,
  propertyErrorMessage,
  resolveReturnHref,
  type CanonicalDetailState,
  type PropertyCapabilityProjection
} from "../../../features/property-shared";
import { ApiError, apiRequest, isForbiddenError } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import styles from "./HousingWorkbench.module.css";
import { HOUSING_RETURN_CONTEXT_POLICY } from "./housing-workbench-contract";
import { routeUrlObject } from "./housing-route-types";

export interface DetailDefinition<T> {
  endpoint: string;
  fallbackTitle: string;
  featureId: string;
  listRoute: string;
  readActionId: string;
  render(data: T, capabilities: PropertyCapabilityProjection, reload: () => Promise<void>): ReactNode;
  title(data: T): string;
}

function useDetail<T>(definition: DetailDefinition<T>) {
  const user = useAuthUser();
  const capabilities = useMemo(
    () => projectPropertyCapabilities(user, definition.featureId),
    [definition.featureId, user]
  );
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<CanonicalDetailState>({ kind: "loading" });
  async function load() {
    if (!capabilities.pageAllowed || !capabilities.actionAllowed(definition.readActionId)) {
      setData(null); setState({ kind: "forbidden" }); return;
    }
    try {
      const response = await apiRequest<T>(definition.endpoint, { token: getAccessToken() });
      setData(response.data); setState({ kind: "ready" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setState({ kind: "not-found" });
      else if (isForbiddenError(error)) setState({ kind: "forbidden" });
      else if (error instanceof ApiError && error.status === 409) setState({ kind: "conflict", message: propertyErrorMessage(error, "数据状态已变化，请刷新后重试") });
      else if (typeof navigator !== "undefined" && !navigator.onLine && data) setState({ kind: "ready", stale: true });
      else setState({ kind: "failure", message: propertyErrorMessage(error, "详情加载失败，请稍后重试") });
    }
  }
  useEffect(() => { void load(); }, [capabilities.invalidationKey, definition.endpoint]);
  return { capabilities, data, load, state };
}

export function DetailPage<T>({ definition }: { definition: DetailDefinition<T> }) {
  const searchParams = useSearchParams();
  const { capabilities, data, load, state } = useDetail(definition);
  const returnHref = resolveReturnHref(searchParams.get("returnTo"), {
    ...HOUSING_RETURN_CONTEXT_POLICY,
    fallbackHref: definition.listRoute
  });
  return (
    <CanonicalDetailShell entityKey={definition.endpoint} presentation="full" returnControl={<Link href={routeUrlObject(returnHref)}>返回列表</Link>} state={state} title={data ? definition.title(data) : definition.fallbackTitle}>
      {data ? definition.render(data, capabilities, load) : null}
    </CanonicalDetailShell>
  );
}

export function money(value: string | null | undefined): string {
  return value === undefined || value === null ? "受权限保护" : `¥${value}`;
}

export function DetailGrid({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className={styles.detailGrid}>
      {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}
    </dl>
  );
}

export function BlockedHighRiskActions({ labels }: { labels: readonly string[] }) {
  return (
    <PropertyPanelSurface className={styles.dangerNotice}>
      <h2>需审批的高风险动作</h2>
      <p>{labels.join("、")}在 Track B 审批适配器交付前不可执行，页面不会发起 mutation。</p>
    </PropertyPanelSurface>
  );
}
