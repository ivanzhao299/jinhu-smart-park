"use client";
import { DataTable, Drawer, Card, DrawerFooter, DrawerForm, DrawerHeader } from "@jinhu/ui";

import { CheckCircle2, Plus, RefreshCw, Search, X, XCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { ApiError, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";
import { hasAccess, hasPermission } from "../../../lib/permissions";
import { fetchReferenceFormOptions } from "../../../lib/reference-data";

const LEASING_MODULE = "leasing";
const WAIVER_ENTITY = "leasing_waiver";
const RECEIVABLE_ENTITY = "leasing_receivable";
const WAIVER_PERMISSIONS = {
  read: "leasing_waiver:read",
  create: "leasing_waiver:create",
  approve: "leasing_waiver:approve",
  reject: "leasing_waiver:reject"
} as const;
const SETTLED_RECEIVABLE_STATUSES = new Set(["50", "80", "90"]);
const PENDING_WAIVER_STATUS = "20";

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

interface ParkTenantRow {
  id: string;
  parkTenantCode: string;
  companyName: string;
}

interface ContractRow {
  id: string;
  contractCode: string;
  contractName: string;
}

interface ReceivableRow {
  id: string;
  arCode: string;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  contract?: ContractRow | null;
  feeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountRemain?: string | null;
  status: string;
}

interface WaiverApproveRecord {
  action: "apply" | "approve" | "reject";
  operatorName: string;
  opTime: string;
  fromStatus: string | null;
  toStatus: string;
  opinion?: string | null;
  rejectReason?: string | null;
}

interface WaiverRow {
  id: string;
  code: string | null;
  waiverCode: string;
  receivableId: string;
  receivable?: ReceivableRow | null;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  waiverAmount?: string | null;
  reason: string;
  status: string;
  applyBy: string | null;
  applyTime: string;
  approveBy: string | null;
  approveTime: string | null;
  rejectReason: string | null;
  approveRecords: WaiverApproveRecord[];
  remark: string | null;
}

interface WaiverFormState {
  waiverCode: string;
  receivableId: string;
  waiverAmount: string;
  reason: string;
  remark: string;
}

const initialPageData: PaginatedResult<WaiverRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyForm: WaiverFormState = {
  waiverCode: "",
  receivableId: "",
  waiverAmount: "0",
  reason: "",
  remark: ""
};

function StackedCell({ title, meta, extra }: { title: ReactNode; meta?: ReactNode; extra?: ReactNode }) {
  return (
    <span className="ds-table-stacked-cell">
      <strong>{title}</strong>
      {meta ? <small>{meta}</small> : null}
      {extra ? <small>{extra}</small> : null}
    </span>
  );
}

export default function LeasingWaiversPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<WaiverRow>>(initialPageData);
  const [filters, setFilters] = useState({ keyword: "", parkTenantId: "", status: "", applyStart: "", applyEnd: "" });
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [form, setForm] = useState<WaiverFormState>(emptyForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<WaiverRow | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [opinion, setOpinion] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRead = hasAccess(authUser, WAIVER_PERMISSIONS.read, LEASING_MODULE);
  const canCreate = hasPermission(authUser, WAIVER_PERMISSIONS.create);
  const canApprove = hasPermission(authUser, WAIVER_PERMISSIONS.approve);
  const canReject = hasPermission(authUser, WAIVER_PERMISSIONS.reject);
  const canViewWaiverAmount = canViewField(authUser, LEASING_MODULE, WAIVER_ENTITY, "waiverAmount");
  const canViewReceivableRemain = canViewField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountRemain");

  const availableReceivables = useMemo(
    () => receivables.filter((item) => !SETTLED_RECEIVABLE_STATUSES.has(item.status)),
    [receivables]
  );
  const selectedReceivable = useMemo(
    () => receivables.find((item) => item.id === form.receivableId) ?? null,
    [form.receivableId, receivables]
  );
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageData.page_size) });
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
      if (filters.status) params.set("status", filters.status);
      if (filters.applyStart) params.set("apply_start", filters.applyStart);
      if (filters.applyEnd) params.set("apply_end", filters.applyEnd);
      const response = await apiRequest<PaginatedResult<WaiverRow>>(`/leasing/waivers?${params.toString()}`, {
        token: getAccessToken()
      });
      setPageData(response.data);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canRead, filters, pageData.page_size]);

  const loadDicts = useCallback(async () => {
    const dictTypeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["leasing_waiver_status", "leasing_fee_type", "leasing_receivable_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = dictTypeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadLookups = useCallback(async () => {
    const [references, receivableResponse] = await Promise.all([
      fetchReferenceFormOptions(),
      apiRequest<PaginatedResult<ReceivableRow>>("/leasing/receivables?page=1&page_size=100&sort=dueDate", { token: getAccessToken() })
    ]);
    setParkTenants(references.parkTenants as ParkTenantRow[]);
    setReceivables(receivableResponse.data.items);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void Promise.all([loadDicts(), loadLookups()]).catch((err) => setError(toErrorMessage(err)));
  }, [canRead, loadDicts, loadLookups]);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    if (prefilled || !canCreate || availableReceivables.length === 0) return;
    const receivableId = new URLSearchParams(window.location.search).get("receivable_id");
    if (!receivableId) {
      setPrefilled(true);
      return;
    }
    if (availableReceivables.some((item) => item.id === receivableId)) {
      setForm({ ...emptyForm, receivableId });
      setDrawerOpen(true);
      window.history.replaceState(null, "", "/leasing/waivers");
    }
    setPrefilled(true);
  }, [availableReceivables, canCreate, prefilled]);

  function openCreate(receivableId = "") {
    setForm({ ...emptyForm, receivableId });
    setDrawerOpen(true);
    setError(null);
    setNotice(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest<WaiverRow>("/leasing/waivers", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("leasing-waiver-create"),
        body: {
          waiver_code: form.waiverCode || undefined,
          receivable_id: form.receivableId,
          waiver_amount: Number(form.waiverAmount || 0),
          reason: form.reason,
          remark: form.remark || undefined
        }
      });
      setDrawerOpen(false);
      setNotice("豁免申请已提交审批");
      await Promise.all([load(1), loadLookups()]);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openAction(row: WaiverRow, type: "approve" | "reject") {
    setActionTarget(row);
    setActionType(type);
    setOpinion("");
    setRejectReason("");
    setError(null);
    setNotice(null);
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget || !actionType) return;
    if (actionType === "reject" && !rejectReason.trim()) {
      setError("驳回原因必填");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest<WaiverRow>(`/leasing/waivers/${actionTarget.id}/${actionType}`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(`leasing-waiver-${actionType}`),
        body: actionType === "approve"
          ? { opinion: opinion || undefined }
          : { opinion: opinion || undefined, reject_reason: rejectReason }
      });
      setActionTarget(null);
      setActionType(null);
      setNotice(actionType === "approve" ? "豁免申请已审批通过" : "豁免申请已驳回");
      await Promise.all([load(pageData.page), loadLookups()]);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <div className="page-container">
        <section className="module-denied">
          <strong>403</strong>
          <span>当前账号暂无豁免申请读取权限，或当前租户未开通招商租赁能力。</span>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container">
      <section className="page-header">
        <div className="header-title">
          <strong>豁免审批</strong>
          <span>处理租金减免、滞纳金豁免和争议金额调整，审批通过后联动应收未收金额</span>
        </div>
        <div className="page-actions">
          <button className="primary-button" type="button" onClick={() => load(pageData.page)} disabled={loading}>
            <RefreshCw size={16} /> 刷新
          </button>
          {canCreate ? (
            <button className="primary-button" type="button" onClick={() => openCreate()}>
              <Plus size={16} /> 新增豁免
            </button>
          ) : null}
        </div>
      </section>

      <section className="filter-bar">
        <div className="system-grid-three">
          <label className="field">
            <span>关键词</span>
            <input value={filters.keyword} onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))} placeholder="豁免单号、应收单号、原因" />
          </label>
          <label className="field">
            <span>租户企业</span>
            <select value={filters.parkTenantId} onChange={(event) => setFilters((prev) => ({ ...prev, parkTenantId: event.target.value }))}>
              <option value="">全部</option>
              {parkTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>审批状态</span>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="">全部</option>
              {dicts.leasing_waiver_status?.map((item) => (
                <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>申请开始</span>
            <input type="date" value={filters.applyStart} onChange={(event) => setFilters((prev) => ({ ...prev, applyStart: event.target.value }))} />
          </label>
          <label className="field">
            <span>申请结束</span>
            <input type="date" value={filters.applyEnd} onChange={(event) => setFilters((prev) => ({ ...prev, applyEnd: event.target.value }))} />
          </label>
        </div>
        <div className="filter-actions">
          <button className="primary-button" type="button" onClick={() => load(1)}>
            <Search size={16} /> 查询
          </button>
        </div>
      </section>

      <Card >
        {error ? <div className="module-denied">{error}</div> : null}
        {notice ? <div className="empty-state">{notice}</div> : null}
        <div className="system-toolbar">
          <span className="muted-text">共 {pageData.total} 条</span>
          <span className="muted-text">{loading ? "加载中" : `第 ${pageData.page} / ${totalPages} 页`}</span>
        </div>
        <div className="table-scroll">
          <DataTable >
            <thead>
              <tr>
                <th>豁免单</th>
                <th>租户 / 应收</th>
                <th>费用 / 应收状态</th>
                <th>金额 / 时间</th>
                <th>原因 / 审批</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <StackedCell
                      title={row.waiverCode}
                      meta={<StatusPill dictCode="leasing_waiver_status" value={row.status} dicts={dicts} />}
                    />
                  </td>
                  <td>
                    <StackedCell
                      title={row.parkTenant?.companyName ?? row.receivable?.parkTenant?.companyName ?? "-"}
                      meta={row.receivable?.arCode ? `应收 ${row.receivable.arCode}` : "未关联应收"}
                    />
                  </td>
                  <td>
                    <StackedCell
                      title={row.receivable ? dictLabel("leasing_fee_type", row.receivable.feeType, dicts) : "-"}
                      meta={row.receivable ? <StatusPill dictCode="leasing_receivable_status" value={row.receivable.status} dicts={dicts} /> : "-"}
                    />
                  </td>
                  <td>
                    <StackedCell
                      title={formatWaiverAmount(row.waiverAmount, canViewWaiverAmount, authUser)}
                      meta={formatDateTime(row.applyTime)}
                    />
                  </td>
                  <td>
                    <StackedCell
                      title={row.reason}
                      meta={formatApproveRecords(row.approveRecords)}
                    />
                  </td>
                  <td>
                    <span className="data-table-actions">
                      {canApprove && row.status === PENDING_WAIVER_STATUS ? (
                        <button className="primary-button" type="button" onClick={() => openAction(row, "approve")}>
                          <CheckCircle2 size={14} /> 通过
                        </button>
                      ) : null}
                      {canReject && row.status === PENDING_WAIVER_STATUS ? (
                        <button className="primary-button" type="button" onClick={() => openAction(row, "reject")}>
                          <XCircle size={14} /> 驳回
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        {pageData.items.length === 0 && !loading ? <div className="empty-state">暂无豁免申请</div> : null}
      </Card>

      {drawerOpen ? (
        <Drawer size="md" onClose={() => setDrawerOpen(false)}>
          <DrawerHeader
            eyebrow="招商租赁"
            title="新增豁免申请"
            description="为未结清应收账单发起金额豁免申请。"
            onClose={() => setDrawerOpen(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={submit}>
            <div className="system-grid">
              <label className="field">
                <span>豁免单号</span>
                <input value={form.waiverCode} onChange={(event) => setForm((prev) => ({ ...prev, waiverCode: event.target.value }))} placeholder="为空则自动生成" />
              </label>
              <label className="field">
                <span>应收账单</span>
                <select required value={form.receivableId} onChange={(event) => setForm((prev) => ({ ...prev, receivableId: event.target.value }))}>
                  <option value="">请选择未结清应收</option>
                  {availableReceivables.map((receivable) => (
                    <option key={receivable.id} value={receivable.id}>
                      {receivable.arCode} {receivable.parkTenant?.companyName ?? ""} {dictLabel("leasing_fee_type", receivable.feeType, dicts)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>豁免金额</span>
                <input required type="number" min="0.01" step="0.01" value={form.waiverAmount} onFocus={(event) => event.target.select()} onChange={(event) => setForm((prev) => ({ ...prev, waiverAmount: event.target.value }))} />
              </label>
            </div>
            {selectedReceivable ? (
              <div className="detail-stack">
                <span className="muted-text">
                  关联应收：{selectedReceivable.arCode}，账期 {selectedReceivable.periodStart} 至 {selectedReceivable.periodEnd}，未收金额 {formatReceivableRemain(selectedReceivable.amountRemain, canViewReceivableRemain, authUser)}
                </span>
              </div>
            ) : null}
            <label className="field">
              <span>申请原因</span>
              <textarea required value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
            </label>
            <label className="field">
              <span>备注</span>
              <textarea value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
            </label>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setDrawerOpen(false)}>取消</button>
              <button className="primary-button" type="submit" disabled={saving || !canCreate}>
                {saving ? "提交中" : "提交申请"}
              </button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}

      {actionTarget && actionType ? (
        <Drawer size="md" onClose={() => setActionTarget(null)}>
          <DrawerHeader
            eyebrow="招商租赁"
            title={actionType === "approve" ? "审批通过" : "审批驳回"}
            description="对豁免申请进行审批并填写意见。"
            onClose={() => setActionTarget(null)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={submitAction}>
            <div className="detail-grid">
              <div><span>豁免单号</span><strong>{actionTarget.waiverCode}</strong></div>
              <div><span>豁免金额</span><strong>{formatWaiverAmount(actionTarget.waiverAmount, canViewWaiverAmount, authUser)}</strong></div>
              <div><span>申请原因</span><strong>{actionTarget.reason}</strong></div>
            </div>
            <label className="field">
              <span>审批意见</span>
              <textarea value={opinion} onChange={(event) => setOpinion(event.target.value)} />
            </label>
            {actionType === "reject" ? (
              <label className="field">
                <span>驳回原因</span>
                <textarea required value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
              </label>
            ) : null}
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setActionTarget(null)}>取消</button>
              <button className="primary-button" type="submit" disabled={saving || (actionType === "approve" ? !canApprove : !canReject)}>
                {saving ? "处理中" : actionType === "approve" ? "确认通过" : "确认驳回"}
              </button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
    </div>
  );
}

function StatusPill({ dictCode, value, dicts }: { dictCode: string; value: string; dicts: Record<string, DictItemRow[]> }) {
  const item = dicts[dictCode]?.find((entry) => entry.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value}</span>;
}

function dictLabel(dictCode: string, value: string, dicts: Record<string, DictItemRow[]>): string {
  return dicts[dictCode]?.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function statusClass(tagType?: string | null): string {
  const normalized = tagType ?? "muted";
  if (["success", "warning", "danger", "info", "primary"].includes(normalized)) {
    return `status-${normalized}`;
  }
  return "status-muted";
}

function formatWaiverAmount(value: unknown, canView: boolean, user: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, WAIVER_ENTITY, "waiverAmount", value);
  return formatAmountLike(masked);
}

function formatReceivableRemain(value: unknown, canView: boolean, user: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, RECEIVABLE_ENTITY, "amountRemain", value);
  return formatAmountLike(masked);
}

function formatAmountLike(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(value);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatApproveRecords(records?: WaiverApproveRecord[]): string {
  if (!records || records.length === 0) return "-";
  return records
    .map((record) => `${actionLabel(record.action)} ${record.operatorName} ${record.rejectReason ?? record.opinion ?? ""}`.trim())
    .join(" / ");
}

function actionLabel(action: WaiverApproveRecord["action"]): string {
  if (action === "apply") return "申请";
  if (action === "approve") return "通过";
  return "驳回";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}
