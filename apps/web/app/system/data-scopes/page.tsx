"use client";
import { Card, DataTable, Drawer } from "@jinhu/ui";

import { Edit3, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface DataScopeRule {
  id: string;
  ruleCode: string;
  ruleName: string;
  dimension: string;
  scopeType: string;
  scopeConfig: Record<string, unknown>;
  status: string;
  remark?: string | null;
}

interface FormState {
  id?: string;
  ruleCode: string;
  ruleName: string;
  dimension: string;
  scopeType: string;
  scopeConfigText: string;
  status: string;
  remark: string;
}

const emptyPage: PaginatedResult<DataScopeRule> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyForm: FormState = { ruleCode: "", ruleName: "", dimension: "park", scopeType: "park", scopeConfigText: "{}", status: "enabled", remark: "" };
const dimensions = ["tenant", "park", "org", "building", "floor", "unit", "tenant_company", "customer_owner", "contract_owner", "workorder_handler"];
const scopeTypes = ["all", "tenant", "park", "org", "org_and_children", "self", "assigned", "custom"];

export default function DataScopesPage() {
  const [data, setData] = useState(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState("");

  async function load(page = 1) {
    const token = getToken();
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status) params.set("status", status);
    const response = await apiRequest<PaginatedResult<DataScopeRule>>(`/data-scopes?${params.toString()}`, { token });
    setData(response.data);
  }

  function openCreate() {
    setFormState(emptyForm);
    setFormOpen(true);
  }

  function openEdit(rule: DataScopeRule) {
    setFormState({
      id: rule.id,
      ruleCode: rule.ruleCode,
      ruleName: rule.ruleName,
      dimension: rule.dimension,
      scopeType: rule.scopeType,
      scopeConfigText: JSON.stringify(rule.scopeConfig ?? {}, null, 2),
      status: rule.status,
      remark: rule.remark ?? ""
    });
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scopeConfig = parseScopeConfig(formState.scopeConfigText);
    const token = getToken();
    const body = {
      ruleCode: formState.ruleCode.trim(),
      ruleName: formState.ruleName.trim(),
      dimension: formState.dimension,
      scopeType: formState.scopeType,
      scopeConfig,
      status: formState.status,
      remark: formState.remark.trim() || undefined
    };
    if (formState.id) {
      await apiRequest<DataScopeRule>(`/data-scopes/${formState.id}`, { method: "PATCH", token, idempotencyKey: createIdempotencyKey("data-scope-update"), body });
      setMessage("数据权限规则已更新");
    } else {
      await apiRequest<DataScopeRule>("/data-scopes", { method: "POST", token, idempotencyKey: createIdempotencyKey("data-scope-create"), body });
      setMessage("数据权限规则已创建");
    }
    setFormOpen(false);
    await load(data.page);
  }

  async function remove(rule: DataScopeRule) {
    if (!window.confirm(`确认删除数据权限规则「${rule.ruleName}」？`)) return;
    const token = getToken();
    await apiRequest<{ id: string }>(`/data-scopes/${rule.id}`, { method: "DELETE", token, idempotencyKey: createIdempotencyKey("data-scope-delete") });
    setMessage("数据权限规则已删除");
    await load(1);
  }

  useEffect(() => {
    void load().catch(showError);
  }, []);

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : "操作失败");
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title"><strong>数据权限</strong><span>维护结构化数据权限规则，禁止录入 SQL 条件</span></div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_CREATE} type="button" onClick={openCreate}><Plus size={16} />新增规则</PermissionButton>
      </header>

      <section className="filter-bar">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch(showError); }}>
          <div className="dashboard-grid">
            <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="规则编码 / 名称" /></div>
            <div className="field"><label>状态</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
          </div>
          <div className="filter-actions"><button className="primary-button" type="submit"><Search size={16} />查询</button></div>
        </form>
      </section>

      <Card >
        <h2 className="panel-title">规则列表</h2>
        <div className="table-scroll">
          <DataTable >
            <thead><tr><th>规则编码</th><th>规则名称</th><th>维度</th><th>范围类型</th><th>配置摘要</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.ruleCode}</td><td>{item.ruleName}</td><td>{item.dimension}</td><td>{item.scopeType}</td><td>{JSON.stringify(item.scopeConfig ?? {})}</td><td><StatusBadge status={item.status} /></td><td><PermissionButton permission={SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_UPDATE} type="button" onClick={() => openEdit(item)}><Edit3 size={16} />编辑</PermissionButton><PermissionButton permission={SYSTEM_PERMISSIONS.DATA_SCOPE_OPEN_DELETE} type="button" onClick={() => void remove(item).catch(showError)}><Trash2 size={16} />删除</PermissionButton></td></tr>)}</tbody>
          </DataTable>
        </div>
        <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span><button className="pagination-button" type="button" onClick={() => void load(Math.max(1, data.page - 1)).catch(showError)}>上一页</button><button className="pagination-button" type="button" onClick={() => void load(data.page + 1).catch(showError)}>下一页</button></span></div>
      </Card>

      {formOpen ? (
        <Drawer size="md" onClose={() => setFormOpen(false)}>
          <form className="form-stack" onSubmit={(event) => void submit(event).catch(showError)}>
            <div className="system-toolbar"><h2 className="panel-title">{formState.id ? "编辑数据权限规则" : "新增数据权限规则"}</h2><button className="drawer-close-button" aria-label="关闭" title="关闭" type="button" onClick={() => setFormOpen(false)}><X size={16} /></button></div>
            <div className="field"><label>规则编码</label><input required value={formState.ruleCode} onChange={(event) => setFormState({ ...formState, ruleCode: event.target.value })} /></div>
            <div className="field"><label>规则名称</label><input required value={formState.ruleName} onChange={(event) => setFormState({ ...formState, ruleName: event.target.value })} /></div>
            <div className="field"><label>维度</label><select value={formState.dimension} onChange={(event) => setFormState({ ...formState, dimension: event.target.value })}>{dimensions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
            <div className="field"><label>范围类型</label><select value={formState.scopeType} onChange={(event) => setFormState({ ...formState, scopeType: event.target.value })}>{scopeTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
            <div className="field"><label>scope_config JSON</label><textarea className="json-editor" value={formState.scopeConfigText} onChange={(event) => setFormState({ ...formState, scopeConfigText: event.target.value })} /></div>
            <div className="field"><label>状态</label><select value={formState.status} onChange={(event) => setFormState({ ...formState, status: event.target.value })}><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            <div className="field"><label>备注</label><input value={formState.remark} onChange={(event) => setFormState({ ...formState, remark: event.target.value })} /></div>
            <button className="primary-button" type="submit"><Save size={16} />保存</button>
          </form>
        </Drawer>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function parseScopeConfig(value: string): Record<string, unknown> {
  if (/\b(select|insert|update|delete|drop|alter|truncate|union|where|from)\b/i.test(value)) {
    throw new Error("scope_config 只能填写结构化 JSON，不能包含 SQL");
  }
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("scope_config 必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className="status-pill">{status === "enabled" ? "启用" : "停用"}</span>;
}

function getToken(): string {
  return localStorage.getItem("jinhu_access_token") ?? "";
}
