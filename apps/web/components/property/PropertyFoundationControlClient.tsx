"use client";

import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PropertyPageSurface,
  PropertyPanelSurface,
  PropertyResponsiveRecords,
  ConsequenceDialog,
  type PropertyFieldDescriptor
} from "../../features/property-shared";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import { PermissionGuard } from "../auth/PermissionGuard";

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
  configuredMode: string;
  operationStatus: string;
  assetUnitId: string | null;
  suspendReason: string | null;
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
  startAt: string;
  endAt: string;
  status: string;
  releaseReason: string | null;
  version: number;
}

interface ModeTransitionRow {
  id: string;
  unitId: string;
  fromMode: string;
  toMode: string;
  reason: string;
  decisionStatus: string;
  executionStatus: string;
  createTime: string;
  operatorName?: string | null;
  version: number;
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
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState(
    surface === "operations" ? searchParams.get("keyword") ?? "" : searchParams.get("unitId") ?? ""
  );
  const [fromMode, setFromMode] = useState("");
  const [toMode, setToMode] = useState("");
  const [decisionStatus, setDecisionStatus] = useState("");
  const [executionStatus, setExecutionStatus] = useState("");
  const [data, setData] = useState<FoundationPage<FoundationRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const requestPath = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (surface === "operations" && filter.trim()) params.set("keyword", filter.trim());
    if ((surface === "occupancies" || surface === "mode-transitions") && filter.trim()) {
      params.set("unitId", filter.trim());
    }
    if (surface === "mode-transitions") {
      if (fromMode) params.set("fromMode", fromMode);
      if (toMode) params.set("toMode", toMode);
      if (decisionStatus) params.set("decisionStatus", decisionStatus);
      if (executionStatus) params.set("executionStatus", executionStatus);
    }
    return `${config.api}?${params}`;
  }, [config.api, decisionStatus, executionStatus, filter, fromMode, page, surface, toMode]);

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
  }, [requestPath]);

  useEffect(() => void load(), [load]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

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
        <label className="form-field">
          <span>{surface === "operations" ? "房源关键词" : "经营房源 ID"}</span>
          <input
            aria-label={surface === "operations" ? "按房源编码或名称筛选" : "按经营房源 ID 筛选"}
            onChange={(event) => { setFilter(event.target.value); setPage(1); }}
            placeholder={surface === "operations" ? "输入房源编码或名称" : "输入房源 UUID"}
            type="search"
            value={filter}
          />
        </label>
        {surface === "mode-transitions" ? <>
          <label className="form-field"><span>原模式</span><select value={fromMode}
            onChange={(event) => { setFromMode(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="none">不经营</option><option value="short_stay">民宿短租</option><option value="long_rent">长租</option>
          </select></label>
          <label className="form-field"><span>目标模式</span><select value={toMode}
            onChange={(event) => { setToMode(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="none">不经营</option><option value="short_stay">民宿短租</option><option value="long_rent">长租</option>
          </select></label>
          <label className="form-field"><span>审批状态</span><select value={decisionStatus}
            onChange={(event) => { setDecisionStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="submitted">已提交</option><option value="pending_approval">待审批</option><option value="approved">已批准</option><option value="rejected">已驳回</option><option value="withdrawn">已撤回</option>
          </select></label>
          <label className="form-field"><span>执行状态</span><select value={executionStatus}
            onChange={(event) => { setExecutionStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option><option value="not_started">待执行</option><option value="executing">执行中</option><option value="retry_wait">等待重试</option><option value="executed">已执行</option><option value="execution_failed">执行失败</option><option value="infra_exhausted">基础设施重试耗尽</option>
          </select></label>
        </> : null}
        <button className="ds-button" onClick={() => void load()} type="button">刷新</button>
      </div>
    </PropertyPanelSurface>
    {surface === "occupancies" ? <ManualOccupancyCreatePanel onCreated={() => void load()} /> : null}
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

function ManualOccupancyCreatePanel({ onCreated }: { onCreated: () => void }) {
  const [unitId, setUnitId] = useState("");
  const [sourceDomain, setSourceDomain] = useState<"maintenance" | "operations">("maintenance");
  const [reference, setReference] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const retryKey = useRef<string | null>(null);

  function payloadChanged() {
    retryKey.current = null;
    setFeedback("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
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
    setFeedback("");
    retryKey.current ??= createIdempotencyKey("property-manual-occupancy");
    try {
      await apiRequest("/property/occupancies", {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: retryKey.current,
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
      setReference("");
      setFeedback("人工锁房已创建。");
      onCreated();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "人工锁房创建失败");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <PermissionGuard
    module="asset"
    permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_CREATE}
  >
    <PropertyPanelSurface>
      <h2>创建人工锁房</h2>
      <p>仅用于人工维修或运营锁房；民宿、住房和商业租赁占用必须由原业务流程创建。</p>
      <form onSubmit={(event) => void submit(event)}>
        <div className="ds-command-grid">
          <label className="form-field"><span>经营房源 ID</span><input required value={unitId}
            onChange={(event) => { payloadChanged(); setUnitId(event.target.value); }} /></label>
          <label className="form-field"><span>锁房类型</span><select value={sourceDomain}
            onChange={(event) => { payloadChanged(); setSourceDomain(event.target.value as "maintenance" | "operations"); }}>
            <option value="maintenance">维修锁房</option><option value="operations">运营锁房</option>
          </select></label>
          <label className="form-field"><span>关联编号</span><input maxLength={64} required value={reference}
            onChange={(event) => { payloadChanged(); setReference(event.target.value); }} /></label>
          <label className="form-field"><span>开始时间</span><input required type="datetime-local" value={startAt}
            onChange={(event) => { payloadChanged(); setStartAt(event.target.value); }} /></label>
          <label className="form-field"><span>结束时间</span><input required type="datetime-local" value={endAt}
            onChange={(event) => { payloadChanged(); setEndAt(event.target.value); }} /></label>
        </div>
        {feedback ? <p aria-live="polite" role={feedback.includes("失败") || feedback.includes("请") ? "alert" : undefined}>{feedback}</p> : null}
        <div className="ds-action-bar"><button className="ds-button" disabled={busy} type="submit">
          {busy ? "正在创建…" : "创建人工锁房"}
        </button></div>
      </form>
    </PropertyPanelSurface>
  </PermissionGuard>;
}

function FoundationRecords({ items, surface }: { items: FoundationRow[]; surface: FoundationSurface }) {
  if (!items.length) return <PropertyPanelSurface><p>当前筛选条件下暂无记录。</p></PropertyPanelSurface>;
  const fields = fieldsFor(surface);
  return <PropertyPanelSurface>
    <PropertyResponsiveRecords
      fields={fields}
      getKey={(item) => rowId(item, surface)}
      getTitle={(item) => rowTitle(item, surface)}
      items={items}
      label={SURFACE_CONFIG[surface].title}
      renderActions={surface === "mode-transitions" ? undefined : (item) => (
        <Link className="ds-button" href={detailHref(item, surface)}>查看详情</Link>
      )}
    />
  </PropertyPanelSurface>;
}

function fieldsFor(surface: FoundationSurface): readonly PropertyFieldDescriptor<FoundationRow>[] {
  if (surface === "operations") return [
    { key: "mode", label: "经营模式", render: (item) => (item as OperationRow).configuredMode },
    { key: "status", label: "经营状态", render: (item) => (item as OperationRow).operationStatus },
    { key: "blockers", label: "阻断项", render: (item) => {
      const blockers = (item as OperationRow).blockers;
      return blockers.length ? blockers.map((blocker) => `${blocker.label}(${blocker.count})`).join("；") : "无";
    } },
    { key: "updated", label: "更新时间", render: (item) => formatTime((item as OperationRow).updateTime) }
  ];
  if (surface === "occupancies") return [
    { key: "source", label: "来源", render: (item) => (item as OccupancyRow).sourceLabel },
    { key: "period", label: "占用时段", render: (item) => `${formatTime((item as OccupancyRow).startAt)} — ${formatTime((item as OccupancyRow).endAt)}` },
    { key: "status", label: "状态", render: (item) => (item as OccupancyRow).status },
    { key: "version", label: "版本", render: (item) => (item as OccupancyRow).version }
  ];
  return [
    { key: "transition", label: "模式变更", render: (item) => `${(item as ModeTransitionRow).fromMode} → ${(item as ModeTransitionRow).toMode}` },
    { key: "decision", label: "审批状态", render: (item) => (item as ModeTransitionRow).decisionStatus },
    { key: "execution", label: "执行状态", render: (item) => (item as ModeTransitionRow).executionStatus },
    { key: "created", label: "申请时间", render: (item) => formatTime((item as ModeTransitionRow).createTime) }
  ];
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
  const releaseKey = useRef<string | null>(null);
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
    releaseKey.current ??= createIdempotencyKey(`property-occupancy-${releaseMode}-release`);
    try {
      await apiRequest(`/property/occupancies/${encodeURIComponent(id)}/release`, {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: releaseKey.current,
        body: { reason: reason ?? "", force: releaseMode === "force" }
      });
      releaseKey.current = null;
      setFeedback(releaseMode === "force" ? "强制释放审批已提交。" : "人工占用已释放。");
      await load();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "释放操作失败");
      throw cause;
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
        {surface === "occupancies" && isManualOccupancy(detail as OccupancyRow) ? <PermissionGuard
          module="asset" permission={PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCY_RELEASE}
        ><button className="ds-button" onClick={() => setReleaseMode("normal")} type="button">释放人工锁房</button></PermissionGuard> : null}
        {surface === "occupancies" && !isTerminalOccupancy(detail as OccupancyRow) ? <PermissionGuard
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
      onOpenChange={(open) => { if (!open) setReleaseMode(null); }}
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
  const [remark, setRemark] = useState("");
  const [targetMode, setTargetMode] = useState(item.configuredMode);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const configureKey = useRef<string | null>(null);
  const transitionKey = useRef<string | null>(null);

  useEffect(() => {
    setStatus(item.operationStatus);
    setAssetUnitId(item.assetUnitId ?? "");
    setSuspendReason(item.suspendReason ?? "");
    setTargetMode(item.configuredMode);
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
          ...(assetUnitId.trim() ? { asset_unit_id: assetUnitId.trim() } : {}),
          operating_status: status,
          ...(status === "enabled" ? {} : { suspend_reason: suspendReason.trim() }),
          ...(remark.trim() ? { remark: remark.trim() } : {})
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
    setFeedback("");
    transitionKey.current ??= createIdempotencyKey("property-mode-transition");
    try {
      await apiRequest(`/property/units/${encodeURIComponent(item.unitId)}/mode-transitions`, {
        method: "POST",
        token: getAccessToken() ?? undefined,
        idempotencyKey: transitionKey.current,
        body: { target_mode: targetMode, reason: reason ?? "" }
      });
      transitionKey.current = null;
      setTransitionOpen(false);
      setFeedback("经营模式切换审批已提交。");
      await onCompleted();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "模式切换审批提交失败");
      throw cause;
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
              onChange={(event) => { configureKey.current = null; setAssetUnitId(event.target.value); }}
              placeholder="可选：asset_unit UUID" value={assetUnitId}
            /></label>
            <label className="form-field"><span>经营状态</span><select
              onChange={(event) => { configureKey.current = null; setStatus(event.target.value); }} value={status}
            ><option value="enabled">启用</option><option value="suspended">暂停</option><option value="disabled">停用</option></select></label>
            {status !== "enabled" ? <label className="form-field"><span>暂停/停用原因</span><input
              maxLength={500} required value={suspendReason}
              onChange={(event) => { configureKey.current = null; setSuspendReason(event.target.value); }}
            /></label> : null}
            <label className="form-field"><span>备注</span><input maxLength={500} value={remark}
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
            <label className="form-field"><span>目标模式</span><select value={targetMode}
              onChange={(event) => { transitionKey.current = null; setTargetMode(event.target.value); }}
            ><option value="none">不经营</option><option value="short_stay">民宿短租</option><option value="long_rent">住房/商业长租</option></select></label>
            <button className="ds-button" disabled={busy || targetMode === item.configuredMode || !item.canRequestTransition}
              onClick={() => setTransitionOpen(true)} type="button">提交切换审批</button>
          </div>
        </PropertyPanelSurface>
      </PermissionGuard>
    </PermissionGuard>
    {feedback ? <PropertyPanelSurface aria-live="polite"><p>{feedback}</p></PropertyPanelSurface> : null}
    <ConsequenceDialog
      actionLabel="提交审批"
      busy={busy}
      consequences={["当前经营模式不会立即改变", "审批执行前会重新校验占用、合同、工单和财务阻断项"]}
      onConfirm={requestTransition}
      onOpenChange={setTransitionOpen}
      open={transitionOpen}
      reasonPolicy={{ kind: "required", minLength: 2, label: "切换原因" }}
      resultingState="等待审批"
      target={{ id: item.unitId, label: `${item.unitCode}：${item.configuredMode} → ${targetMode}` }}
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
  return `${(item as ModeTransitionRow).fromMode} → ${(item as ModeTransitionRow).toMode}`;
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
