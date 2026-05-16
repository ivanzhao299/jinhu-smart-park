"use client";

import { CheckCircle2, RefreshCw, Search, UserPlus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";

const LEASING_MODULE = "leasing";
const LEASING_LEAD_ENTITY = "leasing_lead";
const FIELD_CONTACT_MOBILE = "contactMobile";
const FIELD_DEMAND_PRICE = "demandPrice";
const POOL_PERMISSIONS = {
  read: "leasing_lead_pool:read",
  assign: "leasing_lead:assign",
  reclaim: "leasing_lead:reclaim"
} as const;

interface LeasingLeadRow {
  id: string;
  leadCode: string;
  customerName: string;
  contactName: string;
  contactMobile?: string | null;
  source: string | null;
  industryCode: string | null;
  demandArea: string | null;
  demandPrice?: string | null;
  intentionLevel: string | null;
  followUserId: string | null;
  followUserName: string | null;
  status: string;
  lastFollowTime: string | null;
  nextFollowTime: string | null;
  poolEnterTime: string | null;
  updateTime: string;
}

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
}

interface UserOptionRow {
  id: string;
  username: string;
  displayName?: string | null;
}

const emptyPage: PaginatedResult<LeasingLeadRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyAssignForm = { followUserId: "", reason: "" };

export default function LeasingLeadPoolPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState(emptyPage);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [users, setUsers] = useState<UserOptionRow[]>([]);
  const [filters, setFilters] = useState({ keyword: "", status: "", source: "", intentionLevel: "" });
  const [assignTarget, setAssignTarget] = useState<LeasingLeadRow | null>(null);
  const [assignForm, setAssignForm] = useState(emptyAssignForm);
  const [message, setMessage] = useState("");

  const statusItems = dicts.leasing_lead_status ?? [];
  const sourceItems = dicts.leasing_lead_source ?? [];
  const intentionItems = dicts.leasing_intention_level ?? [];
  const industryItems = dicts.industry_code ?? [];
  const canViewContactMobile = canViewField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE);
  const canViewDemandPrice = canViewField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_DEMAND_PRICE);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.source) params.set("source", filters.source);
    if (filters.intentionLevel) params.set("intention_level", filters.intentionLevel);
    const response = await apiRequest<PaginatedResult<LeasingLeadRow>>(`/leasing/lead-pool?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const dictTypeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["leasing_lead_status", "leasing_lead_source", "leasing_intention_level", "industry_code"];
    const entries = await Promise.all(
      codes.map(async (code) => {
        const dictTypeId = dictTypeMap.get(code);
        if (!dictTypeId) return [code, []] as const;
        const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
          token: getAccessToken()
        });
        return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
      })
    );
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const response = await apiRequest<PaginatedResult<UserOptionRow>>("/users?page=1&page_size=100", {
        token: getAccessToken()
      });
      setUsers(response.data.items);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
  }, [loadDicts]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openAssign(row: LeasingLeadRow) {
    setAssignTarget(row);
    setAssignForm(emptyAssignForm);
    setMessage("");
    void loadUsers();
  }

  async function submitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignTarget) return;
    await apiRequest<LeasingLeadRow>(`/leasing/leads/${assignTarget.id}/assign`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-lead-assign"),
      body: {
        follow_user_id: assignForm.followUserId,
        reason: assignForm.reason.trim()
      }
    });
    setAssignTarget(null);
    setAssignForm(emptyAssignForm);
    setMessage("分配成功");
    await load(pageData.page);
  }

  async function reclaim(row: LeasingLeadRow) {
    if (!window.confirm(`确认领取线索「${row.customerName}」？`)) return;
    await apiRequest<LeasingLeadRow>(`/leasing/leads/${row.id}/reclaim`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-lead-reclaim"),
      body: {}
    });
    setMessage("领取成功");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={LEASING_MODULE} fallback={<ModuleUnauthorizedInline />}>
      <PermissionGuard permission={POOL_PERMISSIONS.read} module={LEASING_MODULE} fallback={<ForbiddenInline />}>
        <main className="page-container">
          <section className="page-header">
            <div className="header-title">
              <strong>招商公海池</strong>
              <span>集中管理待重新分配或待领取的招商线索</span>
            </div>
            <div className="page-actions">
              <button className="primary-button" type="button" onClick={() => void load(pageData.page)}>
                <RefreshCw size={16} />
                刷新
              </button>
            </div>
          </section>

          <section className="filter-bar">
            <div className="system-grid-three">
              <TextField label="关键词" value={filters.keyword} onChange={(value) => updateFilter("keyword", value)} placeholder="编码、客户、联系人、电话" />
              <SelectField label="状态" value={filters.status} onChange={(value) => updateFilter("status", value)} options={statusItems} allowEmpty />
              <SelectField label="来源" value={filters.source} onChange={(value) => updateFilter("source", value)} options={sourceItems} allowEmpty />
              <SelectField label="意向等级" value={filters.intentionLevel} onChange={(value) => updateFilter("intentionLevel", value)} options={intentionItems} allowEmpty />
              <div className="filter-actions">
                <button className="primary-button" type="button" onClick={() => void load(1)}>
                  <Search size={16} />
                  查询
                </button>
              </div>
            </div>
          </section>

          {message ? <p className="status-pill">{message}</p> : null}

          <section className="page-content table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>线索编码</th>
                  <th>客户名称</th>
                  <th>联系人</th>
                  <th>联系电话</th>
                  <th>来源</th>
                  <th>行业</th>
                  <th>需求面积</th>
                  <th>预算价格</th>
                  <th>意向等级</th>
                  <th>当前状态</th>
                  <th>原跟进人</th>
                  <th>入池时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.length === 0 ? (
                  <tr>
                    <td colSpan={13}>暂无公海池线索</td>
                  </tr>
                ) : pageData.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.leadCode}</td>
                    <td>{row.customerName}</td>
                    <td>{row.contactName}</td>
                    <td>{fieldText(authUser, canViewContactMobile, FIELD_CONTACT_MOBILE, row.contactMobile)}</td>
                    <td>{labelFor(sourceItems, row.source)}</td>
                    <td>{labelFor(industryItems, row.industryCode)}</td>
                    <td>{formatArea(row.demandArea)}</td>
                    <td>{moneyText(authUser, canViewDemandPrice, FIELD_DEMAND_PRICE, row.demandPrice)}</td>
                    <td><DictBadge items={intentionItems} value={row.intentionLevel} /></td>
                    <td><DictBadge items={statusItems} value={row.status} /></td>
                    <td>{row.followUserName ?? "-"}</td>
                    <td>{formatDateTime(row.poolEnterTime)}</td>
                    <td>
                      <span className="data-table-actions">
                        <PermissionButton className="primary-button" permission={POOL_PERMISSIONS.reclaim} type="button" onClick={() => void reclaim(row).catch((error: Error) => setMessage(error.message))}>
                          <CheckCircle2 size={16} />
                          领取
                        </PermissionButton>
                        <PermissionButton className="primary-button" permission={POOL_PERMISSIONS.assign} type="button" onClick={() => openAssign(row)}>
                          <UserPlus size={16} />
                          分配
                        </PermissionButton>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="system-toolbar">
              <span className="muted-text">共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
              <span className="page-actions">
                <button className="primary-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(pageData.page - 1)}>上一页</button>
                <button className="primary-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1)}>下一页</button>
              </span>
            </div>
          </section>

          {assignTarget ? (
            <section className="page-content drawer-panel drawer-panel-md">
              <div className="system-toolbar">
                <h2>分配线索</h2>
                <button className="primary-button" type="button" onClick={() => setAssignTarget(null)}>
                  <X size={16} />
                  关闭
                </button>
              </div>
              <form className="form-stack" onSubmit={(event) => void submitAssign(event).catch((error: Error) => setMessage(error.message))}>
                <DetailGrid>
                  <DetailItem label="线索编码" value={assignTarget.leadCode} />
                  <DetailItem label="客户名称" value={assignTarget.customerName} />
                  <DetailItem label="原跟进人" value={assignTarget.followUserName ?? "-"} />
                  <DetailItem label="入池时间" value={formatDateTime(assignTarget.poolEnterTime)} />
                </DetailGrid>
                <div className="field">
                  <label htmlFor="assign-follow-user">目标跟进人</label>
                  <input
                    id="assign-follow-user"
                    list="assign-follow-user-options"
                    required
                    value={assignForm.followUserId}
                    onChange={(event) => setAssignForm((current) => ({ ...current, followUserId: event.target.value }))}
                    placeholder="选择或输入用户 ID"
                  />
                  <datalist id="assign-follow-user-options">
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.displayName || user.username}</option>
                    ))}
                  </datalist>
                </div>
                <TextAreaField
                  label="分配原因"
                  value={assignForm.reason}
                  onChange={(value) => setAssignForm((current) => ({ ...current, reason: value }))}
                  required
                />
                <div className="page-actions">
                  <button className="primary-button" type="submit">确认分配</button>
                  <button className="primary-button" type="button" onClick={() => setAssignTarget(null)}>取消</button>
                </div>
              </form>
            </section>
          ) : null}
        </main>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const id = `field-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function TextAreaField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const id = `field-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  allowEmpty
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DictItemRow[];
  allowEmpty?: boolean;
}) {
  const id = `field-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">全部</option> : null}
        {options.map((item) => (
          <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
        ))}
      </select>
    </div>
  );
}

function DictBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  return <span className="status-pill">{labelFor(items, value)}</span>;
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="system-grid">{children}</div>;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      <span>{value}</span>
    </div>
  );
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <section className="page-content">
        <h2>403</h2>
        <p className="muted-text">当前账号没有访问招商公海池的权限。</p>
      </section>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <section className="page-content">
        <h2>模块未授权</h2>
        <p className="muted-text">当前租户未启用 leasing 模块。</p>
      </section>
    </main>
  );
}

function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === String(value))?.itemLabel ?? String(value);
}

function fieldText(user: ReturnType<typeof useAuthUser>, canView: boolean, fieldKey: string, value: unknown): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, LEASING_LEAD_ENTITY, fieldKey, value);
  return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
}

function moneyText(user: ReturnType<typeof useAuthUser>, canView: boolean, fieldKey: string, value: unknown): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, LEASING_LEAD_ENTITY, fieldKey, value);
  if (masked === null || masked === undefined || masked === "") return "-";
  const numberValue = Number(masked);
  if (!Number.isFinite(numberValue)) return String(masked);
  return numberValue.toFixed(2);
}

function formatArea(value?: string | null): string {
  if (!value) return "-";
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${numberValue.toFixed(2)} m²` : value;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
