"use client";

import { Card, DataTable, DataTableActions, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader, StatusPill } from "@jinhu/ui";
import { Edit3, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
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

interface MeterOption { id: string; meterCode: string; meterName: string; meterType: string; meterPurpose: string }
interface AllocationRuleRow {
  id: string;
  ruleName: string;
  meterType: string;
  allocationScope: string;
  allocationMethod: string;
  publicMeterId: string;
  scopeId: string | null;
  ruleConfigJson: Record<string, unknown>;
  status: string;
  remark: string | null;
}
interface RuleForm {
  ruleName: string;
  meterType: string;
  allocationScope: string;
  allocationMethod: string;
  publicMeterId: string;
  scopeId: string;
  unitPrice: string;
  ratiosJson: string;
  status: string;
  remark: string;
}

const emptyPage: PaginatedResult<AllocationRuleRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyForm: RuleForm = {
  ruleName: "",
  meterType: "ELECTRIC",
  allocationScope: "PARK",
  allocationMethod: "AREA_RATIO",
  publicMeterId: "",
  scopeId: "",
  unitPrice: "1",
  ratiosJson: "{}",
  status: "ENABLED",
  remark: ""
};

export default function EnergyAllocationRulesPage() {
  const [pageData, setPageData] = useState<PaginatedResult<AllocationRuleRow>>(emptyPage);
  const [meters, setMeters] = useState<MeterOption[]>([]);
  const [dicts, setDicts] = useState<DictMap>({});
  const [filters, setFilters] = useState({ keyword: "", meterType: "", status: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AllocationRuleRow | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [message, setMessage] = useState("");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.meterType) params.set("meter_type", filters.meterType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<AllocationRuleRow>>(`/energy/allocation-rules?${params.toString()}`, { token: getAccessToken() });
    setPageData(response.data);
  }, [filters]);

  const loadMeters = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<MeterOption>>("/energy/meters?page=1&page_size=200&meter_purpose=PUBLIC", { token: getAccessToken() });
    setMeters(response.data.items);
  }, []);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["energy_meter_type", "energy_allocation_scope", "energy_allocation_method", "energy_allocation_rule_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  useEffect(() => { void Promise.all([loadDicts(), loadMeters()]).catch((error: Error) => setMessage(error.message)); }, [loadDicts, loadMeters]);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, meterType: dicts.energy_meter_type?.[0]?.itemValue ?? "ELECTRIC", publicMeterId: meters[0]?.id ?? "" });
    setFormOpen(true);
  }

  function openEdit(row: AllocationRuleRow) {
    setEditing(row);
    setForm({
      ruleName: row.ruleName,
      meterType: row.meterType,
      allocationScope: row.allocationScope,
      allocationMethod: row.allocationMethod,
      publicMeterId: row.publicMeterId,
      scopeId: row.scopeId ?? "",
      unitPrice: String(row.ruleConfigJson?.unit_price ?? "1"),
      ratiosJson: JSON.stringify(row.ruleConfigJson?.ratios ?? {}, null, 2),
      status: row.status,
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/energy/allocation-rules/${editing.id}` : "/energy/allocation-rules";
    await apiRequest<AllocationRuleRow>(path, {
      method: editing ? "PATCH" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "energy-allocation-rule-update" : "energy-allocation-rule-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "分摊规则已更新" : "分摊规则已新增");
    setFormOpen(false);
    await load(editing ? pageData.page : 1);
  }

  async function setStatus(row: AllocationRuleRow, status: "enable" | "disable") {
    await apiRequest<AllocationRuleRow>(`/energy/allocation-rules/${row.id}/${status}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`energy-allocation-rule-${status}`)
    });
    setMessage(status === "enable" ? "规则已启用" : "规则已停用");
    await load(pageData.page);
  }

  async function remove(row: AllocationRuleRow) {
    if (!window.confirm(`确认删除分摊规则 ${row.ruleName}？`)) return;
    await apiRequest(`/energy/allocation-rules/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-allocation-rule-delete")
    });
    setMessage("规则已删除");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={ENERGY_MODULE} permission={SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_VIEW} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div><h1>公共能耗分摊规则</h1><p>配置公共电、水、气表按面积、租户数、房间数或手工比例分摊。</p></div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}><RefreshCw size={16} />刷新</button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_CREATE} type="button" onClick={openCreate}><Plus size={16} />新增规则</PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词"><input value={filters.keyword} placeholder="规则名称" onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} /></Field>
          <SelectField label="表计类型" value={filters.meterType} items={dicts.energy_meter_type ?? []} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, meterType: value }))} />
          <SelectField label="状态" value={filters.status} items={dicts.energy_allocation_rule_status ?? []} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}><Search size={16} />查询</button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item"><h2 className="panel-title">规则列表</h2><span>共 {pageData.total} 条</span></div>
          <DataTable>
            <thead><tr><th>规则名称</th><th>表计类型</th><th>分摊范围</th><th>分摊方式</th><th>公共表计</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.ruleName}</td>
                  <td><StatusPill dictCode="energy_meter_type" value={row.meterType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="energy_allocation_scope" value={row.allocationScope} dicts={dicts} /></td>
                  <td><StatusPill dictCode="energy_allocation_method" value={row.allocationMethod} dicts={dicts} /></td>
                  <td>{meterLabel(meters, row.publicMeterId)}</td>
                  <td><StatusPill dictCode="energy_allocation_rule_status" value={row.status} dicts={dicts} /></td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_ENABLE} type="button" onClick={() => void setStatus(row, row.status === "ENABLED" ? "disable" : "enable").catch((error: Error) => setMessage(error.message))}>{row.status === "ENABLED" ? "停用" : "启用"}</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.ENERGY_ALLOCATION_RULE_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={7}><div className="empty-state">暂无分摊规则</div></td></tr> : null}
            </tbody>
          </DataTable>
          <Pager page={pageData.page} totalPages={totalPages} onPage={(page) => void load(page).catch((error: Error) => setMessage(error.message))} />
        </Card>

        {formOpen ? (
          <Drawer size="md" onClose={() => setFormOpen(false)}>
            <DrawerHeader eyebrow="能耗分摊" title={editing ? "编辑分摊规则" : "新增分摊规则"} description="规则计算时会保存配置快照，确保历史账单可追溯。" onClose={() => setFormOpen(false)} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="规则名称"><input required value={form.ruleName} onChange={(event) => setForm((current) => ({ ...current, ruleName: event.target.value }))} /></Field>
                <SelectField required label="表计类型" value={form.meterType} items={dicts.energy_meter_type ?? []} allLabel="请选择类型" onChange={(value) => setForm((current) => ({ ...current, meterType: value }))} />
                <SelectField required label="分摊范围" value={form.allocationScope} items={dicts.energy_allocation_scope ?? []} allLabel="请选择范围" onChange={(value) => setForm((current) => ({ ...current, allocationScope: value }))} />
                <SelectField required label="分摊方式" value={form.allocationMethod} items={dicts.energy_allocation_method ?? []} allLabel="请选择方式" onChange={(value) => setForm((current) => ({ ...current, allocationMethod: value }))} />
                <Field label="公共表计"><select required value={form.publicMeterId} onChange={(event) => setForm((current) => ({ ...current, publicMeterId: event.target.value }))}><option value="">请选择公共表计</option>{meters.map((meter) => <option key={meter.id} value={meter.id}>{meter.meterCode} · {meter.meterName}</option>)}</select></Field>
                <Field label="范围 ID"><input value={form.scopeId} placeholder="楼栋/楼层/区域 ID，可留空表示全园区" onChange={(event) => setForm((current) => ({ ...current, scopeId: event.target.value }))} /></Field>
                <Field label="单价"><input type="number" min="0" step="0.0001" value={form.unitPrice} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, unitPrice: event.target.value }))} /></Field>
                <SelectField required label="状态" value={form.status} items={dicts.energy_allocation_rule_status ?? []} allLabel="请选择状态" onChange={(value) => setForm((current) => ({ ...current, status: value }))} />
                <Field label="手工比例 JSON"><textarea value={form.ratiosJson} onChange={(event) => setForm((current) => ({ ...current, ratiosJson: event.target.value }))} /></Field>
                <Field label="备注"><textarea value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} /></Field>
              </DrawerFormGrid>
              <DrawerFooter><button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>取消</button><button className="primary-button" type="submit">保存</button></DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: RuleForm) {
  return {
    rule_name: form.ruleName,
    meter_type: form.meterType,
    allocation_scope: form.allocationScope,
    allocation_method: form.allocationMethod,
    public_meter_id: form.publicMeterId,
    scope_id: form.scopeId || undefined,
    rule_config_json: { unit_price: Number(form.unitPrice || 1), ratios: parseJsonObject(form.ratiosJson) },
    status: form.status,
    remark: form.remark || undefined
  };
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function meterLabel(meters: MeterOption[], id: string) {
  const meter = meters.find((item) => item.id === id);
  return meter ? `${meter.meterCode} · ${meter.meterName}` : id;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>;
}

function SelectField({ label, value, items, allLabel, onChange, required }: { label: string; value: string; items: DictItemRow[]; allLabel: string; onChange: (value: string) => void; required?: boolean }) {
  return <Field label={label}><select required={required} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></Field>;
}

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return <div className="pagination"><button className="secondary-button" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button><span>第 {page} / {totalPages} 页</span><button className="secondary-button" type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>下一页</button></div>;
}

function Forbidden() {
  return <main className="page-container"><Card className="page-content"><h1>403</h1><p>无权访问公共能耗分摊规则，或当前租户未启用 energy 模块。</p></Card></main>;
}
