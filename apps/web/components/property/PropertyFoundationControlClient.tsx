"use client";

import {
  APPROVAL_DECISION_STATUS_LABELS as DECISION_STATUS_LABELS,
  APPROVAL_EXECUTION_STATUS_LABELS as EXECUTION_STATUS_LABELS,
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_OCCUPANCY_STATUS_LABELS as OCCUPANCY_STATUS_LABELS,
  PROPERTY_OPERATING_MODE_LABELS as OPERATING_MODE_LABELS,
  PROPERTY_OPERATING_STATUS_LABELS as OPERATING_STATUS_LABELS
} from "@jinhu/shared";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PropertyPageSurface,
  PropertyPanelSurface,
  PropertyResponsiveRecords,
  propertyLabels,
  ConsequenceDialog,
  type PropertyFieldDescriptor
} from "../../features/property-shared";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import { PermissionGuard } from "../auth/PermissionGuard";
import { AssetParkContextSelector, useAssetParkContextSwitch } from "../assets/AssetParkContextSelector";

type FoundationSurface = "operations" | "occupancies" | "mode-transitions";

interface FoundationPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface OperationRow {
  unitId: string;
  unitCode: string;
  unitName: string;
  buildingId: string;
  buildingCode: string | null;
  buildingName: string | null;
  configuredMode: string;
  operationStatus: string;
  assetUnitId: string | null;
  assetUnitCode: string | null;
  assetUnitName: string | null;
  suspendReason: string | null;
  remark: string | null;
  effectiveTime: string | null;
  liveOwningAggregateCounts: Record<string, number>;
  sharedOccupancy: { activeCount: number; incompatibleCount: number };
  version: number;
  canRequestTransition: boolean;
  blockers: Array<{ code: string; label: string; count: number }>;
  updateTime: string | null;
}

interface OccupancyRow {
  id: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  sourceDomain: string;
  sourceType: string;
  sourceLabel: string;
  sourceId?: string;
  deepLink?: string;
  startAt: string;
  endAt: string;
  status: string;
  holdExpiresAt: string | null;
  releaseReason: string | null;
  releasedAt: string | null;
  version: number;
}

interface AvailabilityConflict {
  conflictType: string;
  sourceDomain: string;
  sourceType: string;
  sourceLabel: string;
  sourceId?: string;
  deepLink?: string;
  startAt: string;
  endAt: string;
  status: string;
}

interface ModeTransitionRow {
  id: string;
  requestId?: string | null;
  unitId: string;
  unitCode: string;
  unitName: string;
  fromMode: string;
  toMode: string;
  reason: string;
  decisionStatus: string;
  executionStatus: string;
  createTime: string;
  decisionTime?: string | null;
  executionTime?: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
  version: number;
  checkSnapshot?: {
    active_occupancy_count?: number;
    incompatible_occupancy_count?: number;
    commercial_contract_count?: number;
    housing_lease_count?: number;
    homestay_booking_count?: number;
    maintenance_or_operations_count?: number;
    pending_checkout_count?: number;
    open_workorder_count?: number;
    unsettled_receivable_count?: number;
    blocking_reasons?: unknown[];
  } | null;
}

type FoundationRow = OperationRow | OccupancyRow | ModeTransitionRow;

const SURFACE_CONFIG = {
  operations: {
    title: "房源经营配置",
    description: "集中查看房源经营模式、经营状态、当前占用与切换阻断项。",
    api: "/property/operations",
    route: "/assets/property-operations"
  },
  occupancies: {
    title: "房源占用管理",
    description: "查看民宿、住房、商业租赁、维修和运营共享的整套房源占用账本。",
    api: "/property/occupancies",
    route: "/assets/property-occupancies"
  },
  "mode-transitions": {
    title: "经营模式审计",
    description: "按房源查看经营模式切换的申请、审批和执行记录。",
    api: "/property/mode-transitions",
    route: "/assets/property-mode-transitions"
  }
} as const;

export function PropertyFoundationListClient({ surface }: { surface: FoundationSurface }) {
  const config = SURFACE_CONFIG[surface];
  const searchParams = useSearchParams();
  const {
    accessibleParks,
    currentParkName,
    effectiveParkId,
    switching: parkSwitching,
    switchToPark
  } = useAssetParkContextSwitch();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState(searchParams.get("keyword") ?? "");
  const [unitId, setUnitId] = useState(searchParams.get("unitId") ?? "");
  const [buildingId, setBuildingId] = useState("");
  const [configuredMode, setConfiguredMode] = useState("");
  const [operationStatus, setOperationStatus] = useState("");
  const [blockerCode, setBlockerCode] = useState("");
  const [sourceDomain, setSourceDomain] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [occupancyStatus, setOccupancyStatus] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [endTo, setEndTo] = useState("");
  const [fromMode, setFromMode] = useState("");
  const [toMode, setToMode] = useState("");
  const [decisionStatus, setDecisionStatus] = useState("");
  const [executionStatus, setExecutionStatus] = useState("");
  const [data, setData] = useState<FoundationPage<FoundationRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parkReloadKey, setParkReloadKey] = useState(0);
  const [occupancyMutationBusy, setOccupancyMutationBusy] = useState(false);
  const requestSequence = useRef(0);

  const requestPath = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if ((surface === "operations" || surface === "mode-transitions") && keyword.trim()) params.set("keyword", keyword.trim());
    if (surface === "operations") {
      if (buildingId.trim()) params.set("buildingId", buildingId.trim());
      if (configuredMode) params.set("configuredMode", configuredMode);
      if (operationStatus) params.set("operationStatus", operationStatus);
      if (blockerCode) params.set("blockerCode", blockerCode);
    }
    if ((surface === "occupancies" || surface === "mode-transitions") && unitId.trim()) params.set("unitId", unitId.trim());
    if (surface === "occupancies") {
      if (sourceDomain) params.set("sourceDomain", sourceDomain);
      if (sourceType.trim()) params.set("sourceType", sourceType.trim());
      if (occupancyStatus) params.set("status", occupancyStatus);
    }
    if (surface !== "operations") {
      if (startFrom) params.set("startFrom", new Date(startFrom).toISOString());
      if (endTo) params.set("endTo", new Date(endTo).toISOString());
    }
    if (surface === "mode-transitions") {
      if (fromMode) params.set("fromMode", fromMode);
      if (toMode) params.set("toMode", toMode);
      if (decisionStatus) params.set("decisionStatus", decisionStatus);
      if (executionStatus) params.set("executionStatus", executionStatus);
    }
    return `${config.api}?${params}`;
  }, [blockerCode, buildingId, config.api, configuredMode, decisionStatus, endTo, executionStatus, fromMode, keyword, occupancyStatus, operationStatus, page, sourceDomain, sourceType, startFrom, surface, toMode, unitId]);

  const load = useCallback(async () => {
    if (!requestPath) {
      setData(null);
      setError("");
      return;
    }
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<FoundationPage<FoundationRow>>(requestPath, {
        token: getAccessToken() ?? undefined
      });
      if (sequence === requestSequence.current) setData(response.data);
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : "控制面数据加载失败");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [parkReloadKey, requestPath]);

  useEffect(() => void load(), [load]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  async function changePark(targetParkId: string) {
    setError("");
    try {
      await switchToPark(targetParkId);
      requestSequence.current += 1;
      setPage(1);
      setKeyword("");
      setUnitId("");
      setBuildingId("");
      setConfiguredMode("");
      setOperationStatus("");
      setBlockerCode("");
      setSourceDomain("");
      setSourceType("");
      setOccupancyStatus("");
      setStartFrom("");
      setEndTo("");
      setFromMode("");
      setToMode("");
      setDecisionStatus("");
      setExecutionStatus("");
      setData(null);
      setParkReloadKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "园区切换失败");
    }
  }

  return <PropertyPageSurface>
    <header className="ds-hero">
      <div className="ds-hero-copy">
        <p className="ds-kicker">共享房产控制面</p>
        <h1>{config.title}</h1>
        <p>{config.description}</p>
      </div>
    </header>
    <PropertyPanelSurface>
      <div className="ds-action-bar">
        <AssetParkContextSelector
          value={effectiveParkId}
          parks={accessibleParks}
          disabled={parkSwitching || loading || occupancyMutationBusy}
          fallbackLabel={currentParkName}
          onChange={(parkId) => void changePark(parkId)}
        />
        {surface !== "occupancies" ? <label className="form-field">
          <span>房源关键词</span>
          <input
            aria-label="按房源编码或名称筛选"
            name="keyword"
            onChange={(event) => { setKeyword(event.target.value); setPage(1); }}
            placeholder="输入房源编码或名称"
            type="search"
            value={keyword}
          />
        </label> : null}
        {surface === "operations" ? <>
          <label className="form-field"><span>楼栋 ID</span><input name="building_id" type="search" value={buildingId} onChange={(event) => { setBuildingId(event.target.value); setPage(1); }} /></label>
          <label className="form-field"><span>经营模式</span><select name="configured_mode" value={configuredMode} onChange={(event) => { setConfiguredMode(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="none">{OPERATING_MODE_LABELS.none}</option><option value="short_stay">{OPERATING_MODE_LABELS.short_stay}</option><option value="long_rent">{OPERATING_MODE_LABELS.long_rent}</option>
          </select></label>
          <label className="form-field"><span>经营状态</span><select name="operation_status" value={operationStatus} onChange={(event) => { setOperationStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="enabled">{OPERATING_STATUS_LABELS.enabled}</option><option value="suspended">{OPERATING_STATUS_LABELS.suspended}</option><option value="disabled">{OPERATING_STATUS_LABELS.disabled}</option>
          </select></label>
          <label className="form-field"><span>阻断类型</span><select name="blocker_code" value={blockerCode} onChange={(event) => { setBlockerCode(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="commercial-active">商业租赁占用</option><option value="homestay-active">民宿占用</option><option value="housing-active">住房占用</option><option value="occupancy-incompatible">不兼容占用</option><option value="operations-blocker">运营阻断</option><option value="checkout-pending">待退房</option><option value="workorder-open">未结工单</option><option value="receivable-unsettled">未结财务</option>
          </select></label>
        </> : null}
        {surface !== "operations" ? <label className="form-field"><span>经营房源 ID</span><input
          aria-label="按经营房源 ID 精确筛选" name="unit_id" onChange={(event) => { setUnitId(event.target.value); setPage(1); }}
          placeholder="输入房源 UUID" type="search" value={unitId} /></label> : null}
        {surface === "occupancies" ? <>
          <label className="form-field"><span>来源域</span><select name="source_domain" value={sourceDomain} onChange={(event) => { setSourceDomain(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="commercial_leasing">商业租赁</option><option value="homestay">民宿</option><option value="housing_rental">长租经营</option><option value="apartment">公寓</option><option value="maintenance">维修</option><option value="operations">运营</option>
          </select></label>
          <label className="form-field"><span>来源类型</span><input name="source_type" type="search" value={sourceType} onChange={(event) => { setSourceType(event.target.value); setPage(1); }} /></label>
          <label className="form-field"><span>占用状态</span><select name="occupancy_status" value={occupancyStatus} onChange={(event) => { setOccupancyStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="held">保留</option><option value="active">生效</option><option value="released">已释放</option><option value="completed">已完成</option><option value="cancelled">已取消</option>
          </select></label>
        </> : null}
        {surface !== "operations" ? <>
          <label className="form-field"><span>开始时间下限</span><input name="start_from" type="datetime-local" value={startFrom} onChange={(event) => { setStartFrom(event.target.value); setPage(1); }} /></label>
          <label className="form-field"><span>结束时间上限</span><input name="end_to" type="datetime-local" value={endTo} onChange={(event) => { setEndTo(event.target.value); setPage(1); }} /></label>
        </> : null}
        {surface === "mode-transitions" ? <>
          <label className="form-field"><span>原模式</span><select name="from_mode" value={fromMode}
            onChange={(event) => { setFromMode(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="none">{OPERATING_MODE_LABELS.none}</option><option value="short_stay">{OPERATING_MODE_LABELS.short_stay}</option><option value="long_rent">{OPERATING_MODE_LABELS.long_rent}</option>
          </select></label>
          <label className="form-field"><span>目标模式</span><select name="to_mode" value={toMode}
            onChange={(event) => { setToMode(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="none">{OPERATING_MODE_LABELS.none}</option><option value="short_stay">{OPERATING_MODE_LABELS.short_stay}</option><option value="long_rent">{OPERATING_MODE_LABELS.long_rent}</option>
          </select></label>
          <label className="form-field"><span>审批状态</span><select name="decision_status" value={decisionStatus}
            onChange={(event) => { setDecisionStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="submitted">{DECISION_STATUS_LABELS.submitted}</option><option value="pending_approval">{DECISION_STATUS_LABELS.pending_approval}</option><option value="approved">{DECISION_STATUS_LABELS.approved}</option><option value="rejected">{DECISION_STATUS_LABELS.rejected}</option><option value="withdrawn">{DECISION_STATUS_LABELS.withdrawn}</option>
          </select></label>
          <label className="form-field"><span>执行状态</span><select name="execution_status" value={executionStatus}
            onChange={(event) => { setExecutionStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="not_required">{EXECUTION_STATUS_LABELS.not_required}</option><option value="not_started">{EXECUTION_STATUS_LABELS.not_started}</option><option value="executing">{EXECUTION_STATUS_LABELS.executing}</option><option value="retry_wait">{EXECUTION_STATUS_LABELS.retry_wait}</option><option value="executed">{EXECUTION_STATUS_LABELS.executed}</option><option value="execution_failed">{EXECUTION_STATUS_LABELS.execution_failed}</option><option value="infra_exhausted">{EXECUTION_STATUS_LABELS.infra_exhausted}</option>
          </select></label>
        </> : null}
        <button className="ds-button" onClick={() => void load()} type="button">刷新</button>
      </div>
    </PropertyPanelSurface>
    {surface === "occupancies"
      ? <ManualOccupancyCreatePanel
          key={parkReloadKey}
          disabled={parkSwitching}
          onBusyChange={setOccupancyMutationBusy}
          onCreated={() => void load()}
        />
      : null}
    {error ? <PropertyPanelSurface role="alert"><p>{error}</p></PropertyPanelSurface> : null}
    {loading ? <PropertyPanelSurface aria-live="polite"><p>正在加载…</p></PropertyPanelSurface> : null}
    {!loading && !error
      ? <FoundationRecords items={data?.items ?? []} surface={surface} />
      : null}
    <nav aria-label="分页" className="ds-panel ds-section-panel ds-action-bar">
      <button className="ds-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">上一页</button>
      <span>第 {page} / {pages} 页，共 {data?.total ?? 0} 条</span>
      <button className="ds-button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} type="button">下一页</button>
    </nav>
  </PropertyPageSurface>;
}

function ManualOccupancyCreatePanel({
  disabled,
  onBusyChange,
  onCreated
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onCreated: () => void;
}) {
  const [unitId, setUnitId] = useState("");
  const [sourceDomain, setSourceDomain] = useState<"maintenance" | "operations">("maintenance");
  const [reference, setReference] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [availabilityConflicts, setAvailabilityConflicts] = useState<AvailabilityConflict[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const retryKey = useRef<string | null>(null);
  const retryPayload = useRef<string | null>(null);
  const availabilityKey = useRef<string | null>(null);
  const availabilityPayload = useRef<string | null>(null);

  function payloadChanged() {
    retryKey.current = null;
    retryPayload.current = null;
    availabilityKey.current = null;
    availabilityPayload.current = null;
    setFeedback("");
    setAvailabilityConflicts([]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || lock.current) return;
    if (!unitId.trim() || !reference.trim() || !startAt || !endAt) {
      setFeedback("请完整填写房源、关联编号和锁房起止时间。");
      return;
    }
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      setFeedback("锁房结束时间必须晚于开始时间。");
      return;
    }
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    setFeedback("");
    const payloadFingerprint = JSON.stringify({
      unitId: unitId.trim(), sourceDomain, reference: reference.trim(),
      startAt: start.toISOString(), endAt: end.toISOString()
    });
    try {
      const exactRetry = retryKey.current !== null && retryPayload.current === payloadFingerprint;
      if (!exactRetry) {
        if (availabilityPayload.current !== payloadFingerprint) availabilityKey.current = null;
        availabilityKey.current ??= createIdempotencyKey("property-occupancy-availability");
        availabilityPayload.current = payloadFingerprint;
        const availability = await apiRequest<{
          available: boolean;
          conflicts: AvailabilityConflict[];
        }>("/property/occupancies/availability", {
          method: "POST",
          token: getAccessToken() ?? undefined,
          idempotencyKey: availabilityKey.current,
          body: { unitId: unitId.trim(), startAt: start.toISOString(), endAt: end.toISOString() }
        });
        if (!availability.data.available || availability.data.conflicts.length > 0) {
          setAvailabilityConflicts(availability.data.conflicts);
          setFeedback("所选时段存在占用冲突，请调整房源或锁房时间。");
          return;
        }
        retryKey.current = createIdempotencyKey("property-manual-occupancy");
        retryPayload.current = payloadFingerprint;
      }
      await apiRequest("/property/occupancies", {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: retryKey.current!,
        body: {
          unit_id: unitId.trim(),
          source_domain: sourceDomain,
          source_type: sourceDomain === "maintenance" ? "manual_maintenance_lock" : "manual_operations_lock",
          source_id: reference.trim(),
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          status: "active",
          remark: `人工${sourceDomain === "maintenance" ? "维修" : "运营"}锁房：${reference.trim()}`
        }
      });
      retryKey.current = null;
      retryPayload.current = null;
      availabilityKey.current = null;
      availabilityPayload.current = null;
      setReference("");
      setFeedback("人工锁房已创建。");
      onCreated();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "人工锁房创建失败");
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return <PermissionGuard
    module="asset"
    permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_CREATE}
  >
    <PropertyPanelSurface>
      <h2>创建人工锁房</h2>
      <p>仅用于人工维修或运营锁房；民宿、住房和商业租赁占用必须由原业务流程创建。</p>
      <form aria-busy={disabled || busy} onSubmit={(event) => void submit(event)}>
        <div className="ds-command-grid">
          <label className="form-field"><span>经营房源 ID</span><input disabled={disabled || busy} name="manual_unit_id" required value={unitId}
            onChange={(event) => { payloadChanged(); setUnitId(event.target.value); }} /></label>
          <label className="form-field"><span>锁房类型</span><select disabled={disabled || busy} name="manual_source_domain" value={sourceDomain}
            onChange={(event) => { payloadChanged(); setSourceDomain(event.target.value as "maintenance" | "operations"); }}>
            <option value="maintenance">维修锁房</option><option value="operations">运营锁房</option>
          </select></label>
          <label className="form-field"><span>关联编号</span><input disabled={disabled || busy} maxLength={64} name="manual_reference" required value={reference}
            onChange={(event) => { payloadChanged(); setReference(event.target.value); }} /></label>
          <label className="form-field"><span>开始时间</span><input disabled={disabled || busy} name="manual_start_at" required type="datetime-local" value={startAt}
            onChange={(event) => { payloadChanged(); setStartAt(event.target.value); }} /></label>
          <label className="form-field"><span>结束时间</span><input disabled={disabled || busy} name="manual_end_at" required type="datetime-local" value={endAt}
            onChange={(event) => { payloadChanged(); setEndAt(event.target.value); }} /></label>
        </div>
        {feedback ? <p aria-live="polite" role={feedback.includes("失败") || feedback.includes("请") ? "alert" : undefined}>{feedback}</p> : null}
        {availabilityConflicts.length ? <ul aria-label="可用性冲突">
          {availabilityConflicts.map((conflict, index) => <li key={`${conflict.conflictType}-${conflict.startAt}-${index}`}>
            {conflict.deepLink?.startsWith("/")
              ? <Link href={conflict.deepLink as Route}>{conflict.sourceLabel || "未命名冲突来源"}</Link>
              : <>{conflict.sourceLabel || "未命名冲突来源"}</>}
            {` · ${sourceTypeLabel(conflict.sourceType)} · ${formatTime(conflict.startAt)} — ${formatTime(conflict.endAt)} · ${occupancyStatusLabel(conflict.status)}`}
          </li>)}
        </ul> : null}
        <div className="ds-action-bar"><button className="ds-button" disabled={disabled || busy} type="submit">
          {disabled ? "正在切换园区…" : busy ? "正在创建…" : "创建人工锁房"}
        </button></div>
      </form>
    </PropertyPanelSurface>
  </PermissionGuard>;
}

function FoundationRecords({ items, surface }: { items: FoundationRow[]; surface: FoundationSurface }) {
  const [selectedModeTransition, setSelectedModeTransition] = useState<ModeTransitionRow | null>(null);
  useEffect(() => {
    setSelectedModeTransition((current) => {
      if (surface !== "mode-transitions" || !current) return current;
      return (items.find((item) =>
        modeTransitionRecordKey(item as ModeTransitionRow) === modeTransitionRecordKey(current)
      ) as ModeTransitionRow | undefined)
        ?? null;
    });
  }, [items, surface]);
  if (!items.length) return <PropertyPanelSurface><p>当前筛选条件下暂无记录。</p></PropertyPanelSurface>;
  const fields = fieldsFor(surface);
  return <PropertyPanelSurface>
    <PropertyResponsiveRecords
      fields={fields}
      getKey={(item) => rowId(item, surface)}
      getTitle={(item) => rowTitle(item, surface)}
      items={items}
      label={SURFACE_CONFIG[surface].title}
      renderActions={(item) => renderFoundationActions(item, surface, setSelectedModeTransition)}
    />
    {surface === "mode-transitions" && selectedModeTransition ? <ModeTransitionDetailPanel
      row={selectedModeTransition}
    /> : null}
  </PropertyPanelSurface>;
}

function renderFoundationActions(
  item: FoundationRow,
  surface: FoundationSurface,
  setSelectedModeTransition: (row: ModeTransitionRow) => void
) {
  if (surface === "mode-transitions") {
    const row = item as ModeTransitionRow;
    return <button className="ds-button" onClick={() => setSelectedModeTransition(row)} type="button">查看审计详情</button>;
  }
  return <Link className="ds-button" href={detailHref(item, surface)}>查看详情</Link>;
}

function ModeTransitionDetailPanel({ row }: { row: ModeTransitionRow }) {
  return <section aria-label="经营模式审计详情" className="ds-section-panel">
    <h2>经营模式审计详情</h2>
    <dl className="ds-description-list">
      <div><dt>审批请求</dt><dd>{row.requestId ? "审批流程已建立" : "历史执行日志"}</dd></div>
      <div><dt>房源</dt><dd>{row.unitCode} · {row.unitName}</dd></div>
      <div><dt>模式变更</dt><dd>{formatOperatingMode(row.fromMode)} → {formatOperatingMode(row.toMode)}</dd></div>
      <div><dt>审批状态</dt><dd>{formatDecisionStatus(row.decisionStatus)}</dd></div>
      <div><dt>执行状态</dt><dd>{formatExecutionStatus(row.executionStatus)}</dd></div>
      <div><dt>申请时间</dt><dd>{formatTime(row.createTime)}</dd></div>
      <div><dt>审批时间</dt><dd>{formatTime(row.decisionTime)}</dd></div>
      <div><dt>执行时间</dt><dd>{formatTime(row.executionTime)}</dd></div>
      <div><dt>操作人</dt><dd>{row.operatorName || "未显示操作人名称"}</dd></div>
      <div><dt>版本</dt><dd>{row.version}</dd></div>
    </dl>
    <h3>检查快照</h3>
    <p>{modeTransitionSnapshotSummary(row.checkSnapshot)}</p>
    <p>{row.reason || "—"}</p>
    <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATIONS_PAGE}>
      <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATION_READ}>
        <div className="ds-action-bar">
          <Link className="ds-button" href={`/assets/property-operations/${encodeURIComponent(row.unitId)}`}>查看房源经营详情</Link>
        </div>
      </PermissionGuard>
    </PermissionGuard>
  </section>;
}

function fieldsFor(surface: FoundationSurface): readonly PropertyFieldDescriptor<FoundationRow>[] {
  if (surface === "operations") return [
    { key: "mode", label: "经营模式", render: (item) => formatOperatingMode((item as OperationRow).configuredMode) },
    { key: "status", label: "经营状态", render: (item) => formatOperatingStatus((item as OperationRow).operationStatus) },
    { key: "mapping", label: "楼栋 / 物理房源", render: (item) => {
      const row = item as OperationRow;
      return `${formatBuildingLabel(row)} / ${formatAssetUnitLabel(row)}`;
    } },
    { key: "effective", label: "生效时间", render: (item) => formatTime((item as OperationRow).effectiveTime) },
    { key: "suspendReason", label: "暂停/停用原因", render: (item) => (item as OperationRow).suspendReason || "—" },
    { key: "remark", label: "备注", render: (item) => (item as OperationRow).remark || "—" },
    { key: "occupancy", label: "当前占用", render: (item) => operationOccupancySummary(item as OperationRow) },
    { key: "blockers", label: "阻断项", render: (item) => {
      const blockers = (item as OperationRow).blockers;
      return blockers.length ? blockers.map((blocker) => `${blocker.label}(${blocker.count})`).join("；") : "无";
    } },
    { key: "updated", label: "更新时间", render: (item) => formatTime((item as OperationRow).updateTime) }
  ];
  if (surface === "occupancies") return [
    { key: "source", label: "来源", render: (item) => {
      const row = item as OccupancyRow;
      const label = row.sourceLabel || "未命名业务来源";
      return row.deepLink?.startsWith("/") ? <Link href={row.deepLink as Route}>{label}</Link> : label;
    } },
    { key: "sourceType", label: "来源类型", render: (item) => sourceTypeLabel((item as OccupancyRow).sourceType) },
    { key: "period", label: "占用时段", render: (item) => `${formatTime((item as OccupancyRow).startAt)} — ${formatTime((item as OccupancyRow).endAt)}` },
    { key: "status", label: "状态", render: (item) => occupancyStatusLabel((item as OccupancyRow).status) },
    { key: "holdExpiresAt", label: "保留到期", render: (item) => formatTime((item as OccupancyRow).holdExpiresAt) },
    { key: "release", label: "释放信息", render: (item) => {
      const row = item as OccupancyRow;
      return row.releasedAt ? `${formatTime(row.releasedAt)}${row.releaseReason ? ` · ${row.releaseReason}` : ""}` : "—";
    } },
    { key: "version", label: "版本", render: (item) => (item as OccupancyRow).version }
  ];
  return [
    { key: "unit", label: "房源", render: (item) => `${(item as ModeTransitionRow).unitCode} · ${(item as ModeTransitionRow).unitName}` },
    { key: "transition", label: "模式变更", render: (item) => {
      const row = item as ModeTransitionRow;
      return `${formatOperatingMode(row.fromMode)} → ${formatOperatingMode(row.toMode)}`;
    } },
    { key: "decision", label: "审批状态", render: (item) => formatDecisionStatus((item as ModeTransitionRow).decisionStatus) },
    { key: "execution", label: "执行状态", render: (item) => formatExecutionStatus((item as ModeTransitionRow).executionStatus) },
    { key: "snapshot", label: "检查快照", render: (item) => modeTransitionSnapshotSummary((item as ModeTransitionRow).checkSnapshot) },
    { key: "reason", label: "切换原因", render: (item) => (item as ModeTransitionRow).reason || "—" },
    { key: "operator", label: "操作人", render: (item) => {
      const row = item as ModeTransitionRow;
      return row.operatorName || "未显示操作人名称";
    } },
    { key: "created", label: "申请时间", render: (item) => formatTime((item as ModeTransitionRow).createTime) },
    { key: "decisionTime", label: "审批时间", render: (item) => formatTime((item as ModeTransitionRow).decisionTime) },
    { key: "executionTime", label: "执行时间", render: (item) => formatTime((item as ModeTransitionRow).executionTime) },
    { key: "version", label: "版本", render: (item) => (item as ModeTransitionRow).version }
  ];
}

function modeTransitionSnapshotSummary(snapshot: ModeTransitionRow["checkSnapshot"]): string {
  if (!snapshot) return "—";
  const businessRecords = Number(snapshot.commercial_contract_count ?? 0)
    + Number(snapshot.housing_lease_count ?? 0)
    + Number(snapshot.homestay_booking_count ?? 0)
    + Number(snapshot.pending_checkout_count ?? 0)
    + Number(snapshot.open_workorder_count ?? 0)
    + Number(snapshot.unsettled_receivable_count ?? 0);
  const blockerCount = Array.isArray(snapshot.blocking_reasons) ? snapshot.blocking_reasons.length : 0;
  return `阻断 ${blockerCount}；业务记录 ${businessRecords}；有效占用 ${snapshot.active_occupancy_count ?? 0}；不兼容 ${snapshot.incompatible_occupancy_count ?? 0}`;
}

function operationOccupancySummary(row: OperationRow): string {
  const aggregates = Object.values(row.liveOwningAggregateCounts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  return `业务记录 ${aggregates}；有效占用 ${row.sharedOccupancy?.activeCount ?? 0}；不兼容 ${row.sharedOccupancy?.incompatibleCount ?? 0}`;
}

function canActivateOccupancy(row: OccupancyRow): boolean {
  return row.status === "held"
    && ["maintenance", "operations"].includes(row.sourceDomain)
    && Boolean(row.holdExpiresAt && Date.parse(row.holdExpiresAt) > Date.now());
}

function modeTransitionRecordKey(row: ModeTransitionRow): string {
  return row.requestId ?? row.id;
}

export function PropertyFoundationDetailClient({ id, surface }: {
  id: string;
  surface: "operations" | "occupancies";
}) {
  const config = SURFACE_CONFIG[surface];
  const [detail, setDetail] = useState<OperationRow | OccupancyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [releaseMode, setReleaseMode] = useState<"normal" | "force" | null>(null);
  const [mutating, setMutating] = useState(false);
  const releaseKeys = useRef<Record<"normal" | "force", string | null>>({ normal: null, force: null });
  const releasePayloads = useRef<Record<"normal" | "force", string | null>>({ normal: null, force: null });
  const activateKey = useRef<string | null>(null);
  const api = surface === "operations"
    ? `/property/units/${encodeURIComponent(id)}/operation`
    : `/property/occupancies/${encodeURIComponent(id)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<OperationRow | OccupancyRow>(api, { token: getAccessToken() ?? undefined });
      setDetail(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "详情加载失败");
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => void load(), [load]);

  async function release(reason: string | undefined) {
    if (surface !== "occupancies" || releaseMode === null || mutating) return;
    setMutating(true);
    setFeedback("");
    const mode = releaseMode;
    const payloadFingerprint = JSON.stringify({ mode, reason: reason?.trim() ?? "" });
    if (releasePayloads.current[mode] !== payloadFingerprint) releaseKeys.current[mode] = null;
    releaseKeys.current[mode] ??= createIdempotencyKey(`property-occupancy-${mode}-release`);
    releasePayloads.current[mode] = payloadFingerprint;
    try {
      await apiRequest(`/property/occupancies/${encodeURIComponent(id)}/release`, {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: releaseKeys.current[mode]!,
        body: { reason: reason ?? "", force: mode === "force" }
      });
      releaseKeys.current[mode] = null;
      releasePayloads.current[mode] = null;
      setFeedback(mode === "force" ? "强制释放审批已提交。" : "人工占用已释放。");
      await load();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "释放操作失败");
      throw cause;
    } finally {
      setMutating(false);
    }
  }

  async function activate() {
    if (surface !== "occupancies" || mutating) return;
    setMutating(true);
    setFeedback("");
    activateKey.current ??= createIdempotencyKey("property-occupancy-activate");
    try {
      await apiRequest(`/property/occupancies/${encodeURIComponent(id)}/activate`, {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: activateKey.current
      });
      activateKey.current = null;
      setFeedback("保留占用已激活。");
      await load();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "激活占用失败");
    } finally {
      setMutating(false);
    }
  }

  return <PropertyPageSurface>
    <header className="ds-hero"><div className="ds-hero-copy">
      <p className="ds-kicker">共享房产控制面</p><h1>{config.title}详情</h1>
      <p>记录标识：{id}</p>
    </div></header>
    {loading ? <PropertyPanelSurface aria-live="polite"><p>正在加载…</p></PropertyPanelSurface> : null}
    {error ? <PropertyPanelSurface role="alert"><p>{error}</p></PropertyPanelSurface> : null}
    {detail ? <PropertyPanelSurface>
      <dl className="ds-description-list">
        {fieldsFor(surface).map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.render(detail)}</dd></div>)}
      </dl>
      {feedback ? <p aria-live="polite">{feedback}</p> : null}
      <div className="ds-action-bar">
        <Link className="ds-button" href={config.route}>返回列表</Link>
        {surface === "occupancies" && canActivateOccupancy(detail as OccupancyRow) ? <PermissionGuard
          module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_ACTIVATE}
        ><button className="ds-button ds-button-primary" disabled={mutating} onClick={() => void activate()} type="button">
          {mutating ? "正在激活…" : "激活保留占用"}
        </button></PermissionGuard> : null}
        {surface === "occupancies" && isManualOccupancy(detail as OccupancyRow) ? <PermissionGuard
          module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_RELEASE}
        ><button className="ds-button" onClick={() => setReleaseMode("normal")} type="button">释放人工锁房</button></PermissionGuard> : null}
        {surface === "occupancies" && !isTerminalOccupancy(detail as OccupancyRow) && !isManualOccupancy(detail as OccupancyRow) ? <PermissionGuard
          module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE}
        ><PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_FORCE_RELEASE}>
          <button className="ds-button" onClick={() => setReleaseMode("force")} type="button">申请强制释放</button>
        </PermissionGuard></PermissionGuard> : null}
      </div>
    </PropertyPanelSurface> : null}
    {surface === "operations" && detail ? <OperationWriteControls
      item={detail as OperationRow}
      onCompleted={load}
    /> : null}
    {surface === "occupancies" && detail && releaseMode ? <ConsequenceDialog
      actionLabel={releaseMode === "force" ? "提交强制释放审批" : "确认释放"}
      busy={mutating}
      consequences={releaseMode === "force"
        ? ["不会直接删除占用", "审批执行前将重新校验占用版本和状态"]
        : ["该人工锁房将停止阻止后续业务占用", "释放原因将写入审计记录"]}
      onConfirm={release}
      onOpenChange={(open) => {
        if (!open && releaseMode) {
          releaseKeys.current[releaseMode] = null;
          releasePayloads.current[releaseMode] = null;
          setReleaseMode(null);
        }
      }}
      open={releaseMode !== null}
      reasonPolicy={{ kind: "required", minLength: 2, label: "释放原因" }}
      resultingState={releaseMode === "force" ? "等待审批" : "已释放"}
      target={{ id, label: `占用记录 ${id}` }}
      title={releaseMode === "force" ? "申请强制释放占用" : "释放人工锁房"}
    /> : null}
  </PropertyPageSurface>;
}

function OperationWriteControls({ item, onCompleted }: {
  item: OperationRow;
  onCompleted: () => Promise<void>;
}) {
  const [status, setStatus] = useState(item.operationStatus);
  const [assetUnitId, setAssetUnitId] = useState(item.assetUnitId ?? "");
  const [suspendReason, setSuspendReason] = useState(item.suspendReason ?? "");
  const [remark, setRemark] = useState(item.remark ?? "");
  const [targetMode, setTargetMode] = useState(item.configuredMode);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [transitionFeedback, setTransitionFeedback] = useState("");
  const configureKey = useRef<string | null>(null);
  const transitionKey = useRef<string | null>(null);
  const transitionPayload = useRef<string | null>(null);

  useEffect(() => {
    setStatus(item.operationStatus);
    setAssetUnitId(item.assetUnitId ?? "");
    setSuspendReason(item.suspendReason ?? "");
    setRemark(item.remark ?? "");
    setTargetMode(item.configuredMode);
    transitionKey.current = null;
    transitionPayload.current = null;
  }, [item]);

  async function configure(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (status !== "enabled" && suspendReason.trim().length < 2) {
      setFeedback("暂停或停用经营配置时，请填写至少 2 个字符的原因。");
      return;
    }
    setBusy(true);
    setFeedback("");
    configureKey.current ??= createIdempotencyKey("property-operation-configure");
    try {
      await apiRequest(`/property/units/${encodeURIComponent(item.unitId)}/operation`, {
        method: "PUT",
        token: getAccessToken() ?? undefined,
        idempotencyKey: configureKey.current,
        body: {
          version: item.version,
          asset_unit_id: assetUnitId.trim() || null,
          operating_status: status,
          ...(status === "enabled" ? {} : { suspend_reason: suspendReason.trim() }),
          remark: remark.trim() || null
        }
      });
      configureKey.current = null;
      setFeedback("经营配置已保存。");
      await onCompleted();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "经营配置保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function requestTransition(reason: string | undefined) {
    if (busy) return;
    setBusy(true);
    setTransitionFeedback("");
    const payloadFingerprint = JSON.stringify({ targetMode, reason: reason?.trim() ?? "" });
    if (transitionPayload.current !== payloadFingerprint) transitionKey.current = null;
    transitionKey.current ??= createIdempotencyKey("property-mode-transition");
    transitionPayload.current = payloadFingerprint;
    try {
      await apiRequest(`/property/units/${encodeURIComponent(item.unitId)}/mode-transitions`, {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: transitionKey.current,
        body: { target_mode: targetMode, reason: reason ?? "" }
      });
      transitionKey.current = null;
      transitionPayload.current = null;
      setTransitionOpen(false);
      setFeedback("经营模式切换审批已提交。");
      await onCompleted();
    } catch (cause) {
      setTransitionFeedback(cause instanceof Error ? cause.message : "模式切换审批提交失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATION_UPDATE}>
      <PropertyPanelSurface title="经营配置写入">
        <form onSubmit={(event) => void configure(event)}>
          <div className="ds-command-grid">
            <label className="form-field"><span>物理房源 ID</span><input
              name="asset_unit_id"
              onChange={(event) => { configureKey.current = null; setAssetUnitId(event.target.value); }}
              placeholder="可选：asset_unit UUID" value={assetUnitId}
            /></label>
            <label className="form-field"><span>经营状态</span><select
              name="operation_status"
              onChange={(event) => { configureKey.current = null; setStatus(event.target.value); }} value={status}
            ><option value="enabled">{OPERATING_STATUS_LABELS.enabled}</option><option value="suspended">{OPERATING_STATUS_LABELS.suspended}</option><option value="disabled">{OPERATING_STATUS_LABELS.disabled}</option></select></label>
            {status !== "enabled" ? <label className="form-field"><span>暂停/停用原因</span><input
              maxLength={500} name="suspend_reason" required value={suspendReason}
              onChange={(event) => { configureKey.current = null; setSuspendReason(event.target.value); }}
            /></label> : null}
            <label className="form-field"><span>备注</span><input maxLength={500} name="operation_remark" value={remark}
              onChange={(event) => { configureKey.current = null; setRemark(event.target.value); }} /></label>
          </div>
          <div className="ds-action-bar"><button className="ds-button" disabled={busy} type="submit">保存经营配置</button></div>
        </form>
      </PropertyPanelSurface>
    </PermissionGuard>
    <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE}>
      <PermissionGuard module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATION_TRANSITION_MODE}>
        <PropertyPanelSurface title="申请经营模式切换">
          <p>所有模式切换均进入审批；此处不会直接修改当前经营模式。</p>
          <div className="ds-action-bar">
            <label className="form-field"><span>目标模式</span><select name="target_mode" value={targetMode}
              onChange={(event) => { transitionKey.current = null; transitionPayload.current = null; setTargetMode(event.target.value); }}
            ><option value="none">{OPERATING_MODE_LABELS.none}</option><option value="short_stay">{OPERATING_MODE_LABELS.short_stay}</option><option value="long_rent">{OPERATING_MODE_LABELS.long_rent}</option></select></label>
            <button className="ds-button" disabled={busy || targetMode === item.configuredMode || !item.canRequestTransition}
              onClick={() => { setFeedback(""); setTransitionFeedback(""); setTransitionOpen(true); }} type="button">提交切换审批</button>
          </div>
        </PropertyPanelSurface>
      </PermissionGuard>
    </PermissionGuard>
    {feedback ? <PropertyPanelSurface aria-live="polite"><p>{feedback}</p></PropertyPanelSurface> : null}
    <ConsequenceDialog
      actionLabel="提交审批"
      busy={busy}
      consequences={["当前经营模式不会立即改变", "审批执行前会重新校验占用、合同、工单和财务阻断项"]}
      errorMessage={transitionFeedback || undefined}
      onConfirm={requestTransition}
      onOpenChange={(open) => {
        if (!open) {
          transitionKey.current = null;
          transitionPayload.current = null;
          setTransitionFeedback("");
        }
        setTransitionOpen(open);
      }}
      open={transitionOpen}
      reasonPolicy={{ kind: "required", minLength: 2, label: "切换原因" }}
      resultingState="等待审批"
      target={{ id: item.unitId, label: `${item.unitCode}：${formatOperatingMode(item.configuredMode)} → ${formatOperatingMode(targetMode)}` }}
      title="申请经营模式切换"
    />
  </>;
}

function isManualOccupancy(item: OccupancyRow): boolean {
  return ["maintenance", "operations"].includes(item.sourceDomain) && !isTerminalOccupancy(item);
}

function isTerminalOccupancy(item: OccupancyRow): boolean {
  return ["released", "completed", "cancelled"].includes(item.status);
}

function rowId(item: FoundationRow, surface: FoundationSurface): string {
  return surface === "operations" ? (item as OperationRow).unitId : (item as OccupancyRow | ModeTransitionRow).id;
}

function rowTitle(item: FoundationRow, surface: FoundationSurface): string {
  if (surface === "operations") return `${(item as OperationRow).unitCode} · ${(item as OperationRow).unitName}`;
  if (surface === "occupancies") return `${(item as OccupancyRow).unitCode} · ${(item as OccupancyRow).sourceLabel}`;
  const row = item as ModeTransitionRow;
  return `${row.unitCode} · ${row.unitName}：${formatOperatingMode(row.fromMode)} → ${formatOperatingMode(row.toMode)}`;
}

function detailHref(item: FoundationRow, surface: FoundationSurface): Route {
  const base = SURFACE_CONFIG[surface].route;
  return `${base}/${encodeURIComponent(rowId(item, surface))}` as Route;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function formatOperatingMode(value: string | null | undefined): string {
  return propertyLabels.operatingMode(value);
}

function formatOperatingStatus(value: string | null | undefined): string {
  return value ? ((OPERATING_STATUS_LABELS as Readonly<Record<string, string>>)[value] ?? "未知经营状态") : "—";
}

function occupancyStatusLabel(value: string): string {
  return (OCCUPANCY_STATUS_LABELS as Readonly<Record<string, string>>)[value] ?? "未知占用状态";
}

function formatDecisionStatus(value: string | null | undefined): string {
  return propertyLabels.decisionStatus(value);
}

function formatExecutionStatus(value: string | null | undefined): string {
  return propertyLabels.executionStatus(value);
}

function sourceTypeLabel(value: string): string {
  return propertyLabels.sourceType(value);
}

function formatBuildingLabel(row: OperationRow): string {
  return formatCodeName(row.buildingCode, row.buildingName) || "未命名楼栋";
}

function formatAssetUnitLabel(row: OperationRow): string {
  return formatCodeName(row.assetUnitCode, row.assetUnitName) || "未命名房源";
}

function formatCodeName(code: string | null | undefined, name: string | null | undefined): string {
  return [code, name].map((value) => value?.trim()).filter(Boolean).join(" · ");
}
