"use client";

import {
  ContentCard,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  EmptyState,
  FeedbackNotice,
  FilterPanel,
  PageHeader,
  PageShell,
  PaginationBar,
  StatusPill
} from "@jinhu/ui";
import { CheckCircle2, RefreshCw, Search, ShieldCheck, X, XCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const ENERGY_MODULE = "energy";

interface DictTypeRow { id: string; dictCode: string }
interface DictItemRow { id: string; itemLabel: string; itemValue: string; status: string; tagType?: string | null }
type DictMap = Record<string, DictItemRow[]>;

interface EnergyAlertRow {
  id: string;
  meterId: string;
  alertCode: string;
  alertType: string;
  alertLevel: string;
  title: string;
  description: string | null;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  processStatus: string;
  updateTime: string;
}

interface Filters {
  keyword: string;
  meterId: string;
  alertType: string;
  alertLevel: string;
  processStatus: string;
  startTime: string;
  endTime: string;
}

interface ActionState {
  row: EnergyAlertRow;
  action: "acknowledge" | "resolve" | "close";
  reason: string;
}

const emptyPage: PaginatedResult<EnergyAlertRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", meterId: "", alertType: "", alertLevel: "", processStatus: "", startTime: "", endTime: "" };

export default function EnergyAlertsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<EnergyAlertRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [message, setMessage] = useState("");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.meterId.trim()) params.set("meter_id", filters.meterId.trim());
    if (filters.alertType) params.set("alert_type", filters.alertType);
    if (filters.alertLevel) params.set("alert_level", filters.alertLevel);
    if (filters.processStatus) params.set("process_status", filters.processStatus);
    if (filters.startTime) params.set("start_time", new Date(filters.startTime).toISOString());
    if (filters.endTime) params.set("end_time", new Date(filters.endTime).toISOString());
    const response = await apiRequest<PaginatedResult<EnergyAlertRow>>(`/energy/alerts?${params.toString()}`, { token: getAccessToken() });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["energy_alert_type", "energy_alert_level", "energy_alert_process_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  useEffect(() => { void loadDicts().catch((error: Error) => setMessage(error.message)); }, [loadDicts]);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [load]);

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionState) return;
    const body = actionState.action === "close" ? { reason: actionState.reason.trim() } : undefined;
    await apiRequest<EnergyAlertRow>(`/energy/alerts/${actionState.row.id}/${actionState.action}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`energy-alert-${actionState.action}`),
      body
    });
    setMessage(actionLabel(actionState.action, true));
    setActionState(null);
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={ENERGY_MODULE} permission={SYSTEM_PERMISSIONS.ENERGY_ALERT_READ} fallback={<Forbidden />}>
      <PageShell>
        <PageHeader
          title="能源异常告警"
          description="倒表、异常用量、离线等告警在这里确认、处理与关闭。"
          actions={<button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}><RefreshCw size={16} />刷新</button>}
        />

        <FilterPanel>
          <Field label="关键词"><input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编号 / 标题" /></Field>
          <Field label="表计 ID"><input value={filters.meterId} onChange={(event) => setFilters((current) => ({ ...current, meterId: event.target.value }))} /></Field>
          <SelectField label="告警类型" value={filters.alertType} items={dicts.energy_alert_type ?? []} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, alertType: value }))} />
          <SelectField label="告警级别" value={filters.alertLevel} items={dicts.energy_alert_level ?? []} allLabel="全部级别" onChange={(value) => setFilters((current) => ({ ...current, alertLevel: value }))} />
          <SelectField label="处理状态" value={filters.processStatus} items={dicts.energy_alert_process_status ?? []} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, processStatus: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}><Search size={16} />查询</button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="warning">{message}</FeedbackNotice> : null}

        <ContentCard title="告警列表" actions={<span>共 {pageData.total} 条</span>}>
          <DataTable>
            <thead><tr><th>告警编号</th><th>标题</th><th>类型</th><th>级别</th><th>状态</th><th>触发时间</th><th>处理时间</th><th>操作</th></tr></thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.alertCode}</td>
                  <td>{row.title}<p className="muted-text">{row.description ?? "-"}</p></td>
                  <td><StatusPill dictCode="energy_alert_type" value={row.alertType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="energy_alert_level" value={row.alertLevel} dicts={dicts} /></td>
                  <td><StatusPill dictCode="energy_alert_process_status" value={row.processStatus} dicts={dicts} /></td>
                  <td>{formatDateTime(row.triggeredAt)}</td>
                  <td>{formatDateTime(row.resolvedAt ?? row.acknowledgedAt)}</td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_ALERT_PROCESS} type="button" disabled={row.processStatus !== "PENDING"} onClick={() => setActionState({ row, action: "acknowledge", reason: "" })}><CheckCircle2 size={16} />确认</PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_ALERT_PROCESS} type="button" disabled={!["PENDING", "ACKNOWLEDGED"].includes(row.processStatus)} onClick={() => setActionState({ row, action: "resolve", reason: "" })}><ShieldCheck size={16} />处理</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.ENERGY_ALERT_PROCESS} type="button" disabled={row.processStatus === "CLOSED"} onClick={() => setActionState({ row, action: "close", reason: "" })}><XCircle size={16} />关闭</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={8}><EmptyState title="暂无能源告警" compact /></td></tr> : null}
            </tbody>
          </DataTable>
          <PaginationBar page={pageData.page} totalPages={totalPages} onPage={(page) => void load(page).catch((error: Error) => setMessage(error.message))} />
        </ContentCard>

        {actionState ? (
          <Drawer size="md" onClose={() => setActionState(null)}>
            <DrawerHeader eyebrow="能源管理" title={actionLabel(actionState.action, false)} description={actionState.row.title} onClose={() => setActionState(null)} closeIcon={<X size={18} />} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submitAction(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="告警编号"><input readOnly value={actionState.row.alertCode} /></Field>
                {actionState.action === "close" ? (
                  <Field label="关闭原因"><textarea required value={actionState.reason} onChange={(event) => setActionState((current) => current ? { ...current, reason: event.target.value } : current)} /></Field>
                ) : <EmptyState title={`确认执行“${actionLabel(actionState.action, false)}”操作。`} compact />}
              </DrawerFormGrid>
              <DrawerFooter><button className="secondary-button" type="button" onClick={() => setActionState(null)}>取消</button><button className="primary-button" type="submit">提交</button></DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </PageShell>
    </PermissionGuard>
  );
}

function actionLabel(action: ActionState["action"], done: boolean) {
  const map = {
    acknowledge: done ? "告警已确认" : "确认告警",
    resolve: done ? "告警已处理" : "处理告警",
    close: done ? "告警已关闭" : "关闭告警"
  };
  return map[action];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function SelectField({ label, value, items, allLabel, onChange }: { label: string; value: string; items: DictItemRow[]; allLabel: string; onChange: (value: string) => void }) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></Field>;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function Forbidden() {
  return <PageShell><ContentCard><EmptyState title="403" description="无权限访问能源异常告警，或当前租户未开通能耗能力。" /></ContentCard></PageShell>;
}
