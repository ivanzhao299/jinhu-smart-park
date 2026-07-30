"use client";

import {
  SYSTEM_PERMISSIONS,
  type HousingHandoverListItem,
  type HousingLeaseListItem,
  type HousingTenantListItem
} from "@jinhu/shared";
import type { FormEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { PropertyPanelSurface, projectPropertyCapabilities } from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasAccess, hasPermission } from "../../../lib/permissions";
import { HousingCollectionPage } from "./HousingCollectionPage";
import { HousingLeaseCreatePanel } from "./HousingLeaseCreatePanel";
import {
  displayHousingValue, housingDateTime, housingFields, housingLeaseStatusOptions, housingMoney,
  housingOrderFilter, housingSortFilter
} from "./HousingSurfacePrimitives";
import styles from "./HousingWorkbench.module.css";
import { useStableIdempotency } from "./use-stable-idempotency";
import { detailUrlObject } from "./housing-route-types";

function TenantCreatePanel({ onCreated }: { onCreated(): void }) {
  const [submitting, setSubmitting] = useState(false); const [message, setMessage] = useState("");
  const lock = useRef(false); const idempotency = useStableIdempotency();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const form = new FormData(event.currentTarget); lock.current = true; setSubmitting(true); setMessage("");
    const body = { party_type: "person", display_name: String(form.get("display_name") ?? ""),
      mobile: String(form.get("mobile") ?? "") || undefined, source_domain: "housing" };
    try {
      await apiRequest<HousingTenantListItem>("/housing/tenants", {
        method: "POST", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor("housing-tenant-create", body), body
      });
      idempotency.complete("housing-tenant-create"); event.currentTarget.reset();
      setMessage("租客档案已创建。"); onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      lock.current = false; setSubmitting(false);
    }
  }
  return <details><summary className="ds-button ds-button-primary">新增租客档案</summary>
    <PropertyPanelSurface><form className={styles.formGrid} onSubmit={submit}>
      <fieldset className={styles.fieldset} disabled={submitting}>
        <label>姓名<input maxLength={200} name="display_name" required /></label>
        <label>手机号<input autoComplete="tel" maxLength={32} name="mobile" /></label>
        <button className="ds-button ds-button-primary" type="submit">{submitting ? "创建中…" : "保存"}</button>
      </fieldset>
    </form>{message ? <p aria-live="polite">{message}</p> : null}</PropertyPanelSurface>
  </details>;
}

export function HousingTenantsClient() {
  const user = useAuthUser();
  const capabilities = useMemo(() => projectPropertyCapabilities(user, "housing.tenants"), [user]);
  const [refreshKey, setRefreshKey] = useState(0);
  const canLink = capabilities.pageAllowed && hasAccess(user, SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE, "asset")
    && hasPermission(user, SYSTEM_PERMISSIONS.PARTY_READ);
  return <HousingCollectionPage<HousingTenantListItem>
    description="仅显示住房场景所需的最小租客资料；身份维护统一进入业务相对方档案。"
    detailHref={canLink ? (item) => detailUrlObject(`/assets/parties/${encodeURIComponent(item.id)}`) : undefined}
    endpoint="/housing/tenants" featureId="housing.tenants" route="/housing/tenants"
    fields={housingFields<HousingTenantListItem>(
      { key: "verify", label: "核验状态", render: (item) => item.verificationStatus },
      { key: "mobile", label: "联系方式", render: (item) => displayHousingValue(item.mobile) },
      { key: "identity", label: "证件", render: (item) => displayHousingValue(item.identityNumberMasked) }
    )}
    filters={[{ key: "keyword", label: "租客关键词", placeholder: "租客姓名" },
      housingSortFilter([
        { label: "姓名", value: "displayName" }, { label: "创建时间", value: "createTime" },
        { label: "核验状态", value: "verificationStatus" }
      ]), housingOrderFilter]}
    getKey={(item) => item.id} getTitle={(item) => item.displayName}
    readActionId="housing.tenants.list" refreshKey={refreshKey} title="住房租客"
    toolbar={capabilities.actionAllowed("housing.tenants.create")
      ? <TenantCreatePanel onCreated={() => setRefreshKey((value) => value + 1)} /> : null}
  />;
}

export function HousingLeasesClient() {
  const user = useAuthUser();
  const capabilities = useMemo(() => projectPropertyCapabilities(user, "housing.leases"), [user]);
  const [refreshKey, setRefreshKey] = useState(0);
  return <HousingCollectionPage<HousingLeaseListItem>
    description="租约列表与详情独立授权；金额字段由住房财务权限决定是否返回。"
    detailHref={(item) => detailUrlObject(`/housing/leases/${encodeURIComponent(item.id)}`)}
    endpoint="/housing/leases" featureId="housing.leases" route="/housing/leases"
    fields={housingFields<HousingLeaseListItem>(
      { key: "unit", label: "房源", render: (item) => displayHousingValue(item.unitCode ?? item.unitName) },
      { key: "tenant", label: "租客", render: (item) => displayHousingValue(item.tenantDisplayName) },
      { key: "period", label: "租期", render: (item) => `${item.startDate} 至 ${item.endDate}` },
      { key: "status", label: "状态", render: (item) => item.status },
      { key: "rent", label: "月租", render: (item) => housingMoney(item.monthlyRent) }
    )}
    filters={[{ key: "keyword", label: "租约关键词", placeholder: "租约、房源或租客" },
      { key: "status", label: "租约状态", options: housingLeaseStatusOptions },
      housingSortFilter([
        { label: "开始日期", value: "startDate" }, { label: "状态", value: "status" },
        { label: "租约编号", value: "leaseCode" }
      ]), housingOrderFilter]}
    getKey={(item) => item.id} getTitle={(item) => item.leaseCode}
    readActionId="housing.leases.list" refreshKey={refreshKey} title="租约管理"
    toolbar={capabilities.actionAllowed("housing.leases.create") ? <details>
      <summary className="ds-button ds-button-primary">创建租约</summary>
      <HousingLeaseCreatePanel capabilities={capabilities} onCreated={() => setRefreshKey((value) => value + 1)} />
    </details> : null}
  />;
}

export function HousingHandoversClient() {
  return <HousingCollectionPage<HousingHandoverListItem>
    description="查看入住与退租交割。涉及损坏、未结费用或押金抵扣的退租交割在 Track B 前不可执行。"
    detailHref={(item) => detailUrlObject(`/housing/handovers/${encodeURIComponent(item.id)}`)}
    endpoint="/housing/handovers" featureId="housing.handovers" route="/housing/handovers"
    fields={housingFields<HousingHandoverListItem>(
      { key: "lease", label: "租约", render: (item) => item.leaseCode },
      { key: "unit", label: "房源", render: (item) => displayHousingValue(item.unitCode ?? item.unitName) },
      { key: "type", label: "类型", render: (item) => item.handoverType === "move_in" ? "入住" : "退租" },
      { key: "status", label: "状态", render: (item) => item.status },
      { key: "time", label: "交割时间", render: (item) => housingDateTime(item.handoverAt) }
    )}
    filters={[
      { key: "handover_type", label: "交割类型", options: [{ label: "入住", value: "move_in" }, { label: "退租", value: "move_out" }] },
      { key: "status", label: "状态", options: [{ label: "草稿", value: "draft" }, { label: "已完成", value: "completed" }] },
      housingSortFilter([
        { label: "创建时间", value: "createTime" }, { label: "状态", value: "status" },
        { label: "租约编号", value: "leaseCode" }
      ]), housingOrderFilter
    ]}
    getKey={(item) => item.id}
    getTitle={(item) => `${item.leaseCode} · ${item.handoverType === "move_in" ? "入住" : "退租"}`}
    readActionId="housing.handovers.list" title="交割管理"
  />;
}
