"use client";
import { Card, DataTable, Drawer } from "@jinhu/ui";

import { Edit3, Play, Plus, Save, Search, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface CodeRuleRow {
  id: string;
  entityType: string | null;
  ruleCode: string;
  ruleName: string;
  targetModule: string;
  targetEntity: string;
  prefix: string;
  pattern: string;
  datePattern: string | null;
  sequenceLength: number;
  currentSequence: number;
  resetStrategy: string;
  resetPolicy?: string;
  separator: string;
  sampleCode: string | null;
  exampleCode?: string | null;
  status: string;
  remark?: string | null;
}

interface FormState {
  id?: string;
  entityType: string;
  ruleCode: string;
  ruleName: string;
  targetModule: string;
  targetEntity: string;
  prefix: string;
  pattern: string;
  datePattern: string;
  sequenceLength: number;
  resetStrategy: string;
  separator: string;
  status: string;
  remark: string;
}

const emptyPage: PaginatedResult<CodeRuleRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyForm: FormState = { entityType: "unit", ruleCode: "", ruleName: "", targetModule: "asset", targetEntity: "unit", prefix: "RM-", pattern: "{PREFIX}{SEQ:4}", datePattern: "", sequenceLength: 4, resetStrategy: "none", separator: "", status: "enabled", remark: "" };
const entityTypes = ["park", "building", "floor", "room", "unit", "zone", "asset", "device", "camera", "iot_point", "robot", "cleaning_robot", "inspection_robot", "workorder", "contract", "bill"];

export default function CodeRulesPage() {
  const [data, setData] = useState(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const [previewResult, setPreviewResult] = useState("");

  async function load(page = 1) {
    const token = getToken();
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status) params.set("status", status);
    const response = await apiRequest<PaginatedResult<CodeRuleRow>>(`/code-rules?${params.toString()}`, { token });
    setData(response.data);
  }

  function openCreate() {
    setFormState(emptyForm);
    setFormOpen(true);
  }

  function openEdit(rule: CodeRuleRow) {
    setFormState({
      id: rule.id,
      entityType: rule.entityType ?? rule.targetEntity,
      ruleCode: rule.ruleCode,
      ruleName: rule.ruleName,
      targetModule: rule.targetModule,
      targetEntity: rule.targetEntity,
      prefix: rule.prefix,
      pattern: rule.pattern,
      datePattern: rule.datePattern ?? "",
      sequenceLength: rule.sequenceLength,
      resetStrategy: rule.resetPolicy ?? rule.resetStrategy,
      separator: rule.separator,
      status: rule.status,
      remark: rule.remark ?? ""
    });
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();
    const body = {
      entityType: formState.entityType,
      ruleCode: formState.ruleCode.trim() || undefined,
      ruleName: formState.ruleName.trim() || undefined,
      targetModule: formState.targetModule.trim() || undefined,
      targetEntity: formState.targetEntity.trim() || undefined,
      prefix: formState.prefix.trim(),
      pattern: formState.pattern.trim() || undefined,
      datePattern: formState.datePattern.trim() || undefined,
      sequenceLength: formState.sequenceLength,
      resetStrategy: formState.resetStrategy,
      separator: formState.separator,
      status: formState.status,
      remark: formState.remark.trim() || undefined
    };
    if (formState.id) {
      await apiRequest<CodeRuleRow>(`/code-rules/${formState.id}`, { method: "PATCH", token, idempotencyKey: createIdempotencyKey("code-rule-update"), body });
      setMessage("编码规则已更新");
    } else {
      await apiRequest<CodeRuleRow>("/code-rules", { method: "POST", token, idempotencyKey: createIdempotencyKey("code-rule-create"), body });
      setMessage("编码规则已创建");
    }
    setFormOpen(false);
    await load(data.page);
  }

  async function preview(rule: CodeRuleRow) {
    const token = getToken();
    const response = await apiRequest<{ rule_code?: string; sample_code?: string; code?: string }>(`/code-rules/${rule.id}/preview`, { method: "POST", token });
    setPreviewResult(`${rule.ruleCode}: ${response.data.sample_code ?? response.data.code ?? "-"}`);
  }

  async function generate(rule: CodeRuleRow) {
    const entityType = rule.entityType ?? rule.targetEntity;
    const token = getToken();
    const response = await apiRequest<{ entity_type: string; code: string; sequence: number }>(`/code-rules/${entityType}/generate`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("code-rule-generate")
    });
    setPreviewResult(`${response.data.entity_type}: ${response.data.code}`);
    await load(data.page);
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
        <div className="header-title"><strong>编码规则</strong><span>统一维护平台业务编码规则，支持预览和生成测试</span></div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.CODE_RULE_OPEN_CREATE} type="button" onClick={openCreate}><Plus size={16} />新增规则</PermissionButton>
      </header>

      <section className="filter-bar">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch(showError); }}>
          <div className="dashboard-grid">
            <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="编码/名称/实体" /></div>
            <div className="field"><label>状态</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
          </div>
          <div className="filter-actions"><button className="primary-button" type="submit"><Search size={16} />查询</button>{previewResult ? <span className="status-pill">{previewResult}</span> : null}</div>
        </form>
      </section>

      <Card >
        <h2 className="panel-title">规则列表</h2>
        <div className="table-scroll">
          <DataTable >
            <thead><tr><th>规则编码</th><th>实体类型</th><th>规则名称</th><th>对象</th><th>前缀</th><th>流水</th><th>样例</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.ruleCode}</td><td>{item.entityType ?? item.targetEntity}</td><td>{item.ruleName}</td><td>{item.targetModule}.{item.targetEntity}</td><td>{item.prefix}</td><td>{item.currentSequence} / {item.sequenceLength}</td><td>{item.sampleCode ?? item.exampleCode ?? "-"}</td><td><StatusBadge status={item.status} /></td><td><button type="button" onClick={() => void preview(item).catch(showError)}>预览</button><PermissionButton permission={SYSTEM_PERMISSIONS.CODE_RULE_OPEN_GENERATE} type="button" onClick={() => void generate(item).catch(showError)}><Play size={16} />生成测试</PermissionButton><PermissionButton permission={SYSTEM_PERMISSIONS.CODE_RULE_OPEN_UPDATE} type="button" onClick={() => openEdit(item)}><Edit3 size={16} />编辑</PermissionButton></td></tr>)}</tbody>
          </DataTable>
        </div>
        <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span><button type="button" onClick={() => void load(Math.max(1, data.page - 1)).catch(showError)}>上一页</button><button type="button" onClick={() => void load(data.page + 1).catch(showError)}>下一页</button></span></div>
      </Card>

      {formOpen ? (
        <Drawer size="md" onClose={() => setFormOpen(false)}>
          <form className="form-stack" onSubmit={(event) => void submit(event).catch(showError)}>
            <div className="system-toolbar"><h2 className="panel-title">{formState.id ? "编辑编码规则" : "新增编码规则"}</h2><button aria-label="关闭" title="关闭" type="button" onClick={() => setFormOpen(false)}><X size={16} /></button></div>
            <div className="field"><label>实体类型</label><select value={formState.entityType} onChange={(event) => setFormState({ ...formState, entityType: event.target.value, targetEntity: event.target.value })}>{entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
            <div className="field"><label>规则编码</label><input value={formState.ruleCode} onChange={(event) => setFormState({ ...formState, ruleCode: event.target.value })} /></div>
            <div className="field"><label>规则名称</label><input value={formState.ruleName} onChange={(event) => setFormState({ ...formState, ruleName: event.target.value })} /></div>
            <div className="field"><label>模块</label><input value={formState.targetModule} onChange={(event) => setFormState({ ...formState, targetModule: event.target.value })} /></div>
            <div className="field"><label>实体</label><input value={formState.targetEntity} onChange={(event) => setFormState({ ...formState, targetEntity: event.target.value })} /></div>
            <div className="field"><label>前缀</label><input required value={formState.prefix} onChange={(event) => setFormState({ ...formState, prefix: event.target.value })} /></div>
            <div className="field"><label>模式</label><input value={formState.pattern} onChange={(event) => setFormState({ ...formState, pattern: event.target.value })} /></div>
            <div className="field"><label>日期格式</label><input value={formState.datePattern} onChange={(event) => setFormState({ ...formState, datePattern: event.target.value })} /></div>
            <div className="field"><label>流水长度</label><input type="number" min={3} max={12} value={formState.sequenceLength} onChange={(event) => setFormState({ ...formState, sequenceLength: Number(event.target.value) })} onFocus={(event) => event.target.select()} /></div>
            <div className="field"><label>重置策略</label><select value={formState.resetStrategy} onChange={(event) => setFormState({ ...formState, resetStrategy: event.target.value })}><option value="none">不重置</option><option value="daily">每日</option><option value="monthly">每月</option><option value="yearly">每年</option></select></div>
            <div className="field"><label>分隔符</label><input value={formState.separator} onChange={(event) => setFormState({ ...formState, separator: event.target.value })} /></div>
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

function StatusBadge({ status }: { status: string }) {
  return <span className="status-pill">{status === "enabled" ? "启用" : "停用"}</span>;
}

function getToken(): string {
  return localStorage.getItem("jinhu_access_token") ?? "";
}
