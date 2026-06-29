"use client";
import { Card, DataTable, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";

import { Edit3, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface FieldPolicy {
  id: string;
  module: string;
  entity: string;
  fieldKey: string;
  fieldName: string;
  policyType: string;
  maskRule?: string | null;
  status: string;
  remark?: string | null;
}

interface FormState {
  id?: string;
  module: string;
  entity: string;
  fieldKey: string;
  fieldName: string;
  policyType: string;
  maskRule: string;
  status: string;
  remark: string;
}

const emptyPage: PaginatedResult<FieldPolicy> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyForm: FormState = { module: "", entity: "", fieldKey: "", fieldName: "", policyType: "masked", maskRule: "default", status: "enabled", remark: "" };
const policyTypes = ["visible", "masked", "hidden", "readonly", "editable"];
const maskRules = ["default", "mobile", "id_card", "bank_account", "amount", "custom", "file_name"];

export default function FieldPoliciesPage() {
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
    const response = await apiRequest<PaginatedResult<FieldPolicy>>(`/field-policies?${params.toString()}`, { token });
    setData(response.data);
  }

  function openCreate() {
    setFormState(emptyForm);
    setFormOpen(true);
  }

  function openEdit(policy: FieldPolicy) {
    setFormState({ id: policy.id, module: policy.module, entity: policy.entity, fieldKey: policy.fieldKey, fieldName: policy.fieldName, policyType: policy.policyType, maskRule: policy.maskRule ?? "default", status: policy.status, remark: policy.remark ?? "" });
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();
    const body = {
      module: formState.module.trim(),
      entity: formState.entity.trim(),
      fieldKey: formState.fieldKey.trim(),
      fieldName: formState.fieldName.trim(),
      policyType: formState.policyType,
      maskRule: formState.maskRule || undefined,
      status: formState.status,
      remark: formState.remark.trim() || undefined
    };
    if (formState.id) {
      await apiRequest<FieldPolicy>(`/field-policies/${formState.id}`, { method: "PATCH", token, idempotencyKey: createIdempotencyKey("field-policy-update"), body });
      setMessage("字段策略已更新");
    } else {
      await apiRequest<FieldPolicy>("/field-policies", { method: "POST", token, idempotencyKey: createIdempotencyKey("field-policy-create"), body });
      setMessage("字段策略已创建");
    }
    setFormOpen(false);
    await load(data.page);
  }

  async function remove(policy: FieldPolicy) {
    if (!window.confirm(`确认删除字段策略「${policy.fieldName}」？`)) return;
    const token = getToken();
    await apiRequest<{ id: string }>(`/field-policies/${policy.id}`, { method: "DELETE", token, idempotencyKey: createIdempotencyKey("field-policy-delete") });
    setMessage("字段策略已删除");
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
        <div className="header-title"><strong>字段权限策略</strong><span>控制敏感字段明文、脱敏、隐藏、只读和可编辑</span></div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_CREATE} type="button" onClick={openCreate}><Plus size={16} />新增策略</PermissionButton>
      </header>

      <section className="filter-bar">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch(showError); }}>
          <div className="dashboard-grid">
            <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="模块 / 实体 / 字段" /></div>
            <div className="field"><label>状态</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
          </div>
          <div className="filter-actions"><button className="primary-button" type="submit"><Search size={16} />查询</button></div>
        </form>
      </section>

      <Card >
        <h2 className="panel-title">策略列表</h2>
        <div className="table-scroll">
          <DataTable >
            <thead><tr><th>模块</th><th>实体</th><th>字段</th><th>策略</th><th>脱敏规则</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.module}</td><td>{item.entity}</td><td>{item.fieldName}<br /><span className="muted-text">{item.fieldKey}</span></td><td><span className="status-pill">{item.policyType}</span></td><td>{item.maskRule ?? "-"}</td><td><StatusBadge status={item.status} /></td><td><PermissionButton permission={SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_UPDATE} type="button" onClick={() => openEdit(item)}><Edit3 size={16} />编辑</PermissionButton><PermissionButton permission={SYSTEM_PERMISSIONS.FIELD_POLICY_OPEN_DELETE} type="button" onClick={() => void remove(item).catch(showError)}><Trash2 size={16} />删除</PermissionButton></td></tr>)}</tbody>
          </DataTable>
        </div>
        <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span><button className="pagination-button" type="button" onClick={() => void load(Math.max(1, data.page - 1)).catch(showError)}>上一页</button><button className="pagination-button" type="button" onClick={() => void load(data.page + 1).catch(showError)}>下一页</button></span></div>
      </Card>

      {formOpen ? (
        <Drawer size="md" onClose={() => setFormOpen(false)}>
          <DrawerHeader
            eyebrow="系统管理"
            title={formState.id ? "编辑字段策略" : "新增字段策略"}
            description="控制敏感字段的明文、脱敏、隐藏、只读与可编辑。"
            onClose={() => setFormOpen(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void submit(event).catch(showError)}>
            <DrawerFormGrid>
              <div className="field"><label>模块</label><input required value={formState.module} onChange={(event) => setFormState({ ...formState, module: event.target.value })} /></div>
              <div className="field"><label>实体</label><input required value={formState.entity} onChange={(event) => setFormState({ ...formState, entity: event.target.value })} /></div>
              <div className="field"><label>字段键</label><input required value={formState.fieldKey} onChange={(event) => setFormState({ ...formState, fieldKey: event.target.value })} /></div>
              <div className="field"><label>字段名</label><input required value={formState.fieldName} onChange={(event) => setFormState({ ...formState, fieldName: event.target.value })} /></div>
              <div className="field"><label>策略类型</label><select value={formState.policyType} onChange={(event) => setFormState({ ...formState, policyType: event.target.value })}>{policyTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div className="field"><label>脱敏规则</label><select value={formState.maskRule} onChange={(event) => setFormState({ ...formState, maskRule: event.target.value })}>{maskRules.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div className="field"><label>状态</label><select value={formState.status} onChange={(event) => setFormState({ ...formState, status: event.target.value })}><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="field"><label>备注</label><input value={formState.remark} onChange={(event) => setFormState({ ...formState, remark: event.target.value })} /></div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>取消</button>
              <button className="primary-button" type="submit"><Save size={16} />保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="status-pill">{status === "enabled" ? "启用" : "停用"}</span>;
}

function getToken(): string {
  return localStorage.getItem("jinhu_access_token") ?? "";
}
