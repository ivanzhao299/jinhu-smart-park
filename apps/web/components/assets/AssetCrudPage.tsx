"use client";

import {
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader
} from "@jinhu/ui";
import { Edit3, Eye, Plus, Search, Trash2, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../auth/PermissionButton";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";

type UnknownRecord = Record<string, unknown>;

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectSource {
  path: string;
  valueKey: string;
  labelKey: string;
}

export interface AssetField {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  required?: boolean;
  options?: SelectOption[];
  source?: SelectSource;
}

export interface AssetColumn {
  key: string;
  label: string;
  badge?: boolean;
  suffix?: string;
}

export interface AssetCrudConfig {
  title: string;
  subtitle: string;
  apiPath: string;
  idempotencyPrefix: string;
  createPermission: string;
  updatePermission: string;
  detailPermission: string;
  deletePermission: string;
  fields: AssetField[];
  columns: AssetColumn[];
}

const emptyPage: PaginatedResult<UnknownRecord> = { items: [], page: 1, page_size: 20, total: 0 };

export function AssetCrudPage({ config }: { config: AssetCrudConfig }) {
  const [pageData, setPageData] = useState<PaginatedResult<UnknownRecord>>(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<UnknownRecord | null>(null);
  const [detail, setDetail] = useState<UnknownRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sourceOptions, setSourceOptions] = useState<Record<string, SelectOption[]>>({});

  const sourceFields = useMemo(() => config.fields.filter((field) => field.source), [config.fields]);

  async function load(page = 1) {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword) params.set("keyword", keyword);
    if (status) params.set("status", status);
    const response = await apiRequest<PaginatedResult<UnknownRecord>>(`${config.apiPath}?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }

  async function loadSources() {
    const entries = await Promise.all(
      sourceFields.map(async (field) => {
        const source = field.source;
        if (!source) return [field.name, []] as const;
        const response = await apiRequest<PaginatedResult<UnknownRecord>>(`${source.path}?page=1&page_size=100`, {
          token: getAccessToken()
        });
        return [
          field.name,
          response.data.items.map((item) => ({
            value: String(item[source.valueKey] ?? ""),
            label: String(item[source.labelKey] ?? item[source.valueKey] ?? "")
          }))
        ] as const;
      })
    );
    setSourceOptions(Object.fromEntries(entries));
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
    void loadSources().catch((error: Error) => setMessage(error.message));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      config.fields.map((field) => {
        const rawValue = String(form.get(field.name) ?? "");
        return [field.name, field.type === "number" ? Number(rawValue || 0) : rawValue];
      })
    );
    const method = editing ? "PATCH" : "POST";
    const path = editing ? `${config.apiPath}/${String(editing.id)}` : config.apiPath;
    await apiRequest<UnknownRecord>(path, {
      method,
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(config.idempotencyPrefix),
      body
    });
    setShowForm(false);
    setEditing(null);
    await load(pageData.page);
  }

  async function remove(row: UnknownRecord) {
    if (!window.confirm("确认删除该记录？")) return;
    await apiRequest<{ id: string }>(`${config.apiPath}/${String(row.id)}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`${config.idempotencyPrefix}-delete`)
    });
    await load(pageData.page);
  }

  function renderCell(row: UnknownRecord, column: AssetColumn): ReactNode {
    const value = getPath(row, column.key);
    const text = `${value ?? "-"}${column.suffix ?? ""}`;
    return column.badge ? <span className="status-pill">{formatStatus(String(value ?? ""))}</span> : text;
  }

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>{config.title}</strong>
          <span>{config.subtitle}</span>
        </div>
        <PermissionButton className="primary-button" permission={config.createPermission} type="button" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus size={16} />新增
        </PermissionButton>
      </header>

      <section className="work-panel">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="dashboard-grid">
            <div className="field">
              <label>关键词</label>
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="编码或名称" />
            </div>
            <div className="field">
              <label>状态</label>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">全部</option>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </div>
          </div>
          <button className="primary-button" type="submit"><Search size={16} />查询</button>
        </form>
      </section>

      <section className="work-panel table-scroll">
        <table className="data-table ds-data-table">
          <thead>
            <tr>
              {config.columns.map((column) => <th key={column.key}>{column.label}</th>)}
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((row) => (
              <tr key={String(row.id)}>
                {config.columns.map((column) => <td key={column.key} data-label={column.label}>{renderCell(row, column)}</td>)}
                <td data-label="操作">
                  <span className="data-table-actions">
                  <PermissionButton permission={config.detailPermission} title="详情" type="button" onClick={() => setDetail(row)}><Eye size={16} /></PermissionButton>
                  <PermissionButton permission={config.updatePermission} title="编辑" type="button" onClick={() => { setEditing(row); setShowForm(true); }}><Edit3 size={16} /></PermissionButton>
                  <PermissionButton permission={config.deletePermission} title="删除" type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} /></PermissionButton>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="task-item">
          <span>共 {pageData.total} 条，第 {pageData.page} 页</span>
          <span className="pagination-actions">
            <button className="pagination-button" type="button" onClick={() => void load(Math.max(1, pageData.page - 1))}>上一页</button>
            <button className="pagination-button" type="button" onClick={() => void load(pageData.page + 1)}>下一页</button>
          </span>
        </div>
      </section>

      {showForm ? (
        <Drawer size="md" onClose={() => { setShowForm(false); setEditing(null); }}>
          <DrawerHeader
            eyebrow="资产空间"
            title={`${editing ? "编辑" : "新增"}${config.title}`}
            description={config.subtitle}
            onClose={() => { setShowForm(false); setEditing(null); }}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
            <DrawerFormGrid>
              {config.fields.map((field) => <AssetFormField key={field.name} field={field} row={editing} options={sourceOptions[field.name] ?? field.options ?? []} />)}
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>取消</button>
              <button className="primary-button" type="submit">保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}

      {detail ? (
        <Drawer size="md" onClose={() => setDetail(null)}>
          <DrawerHeader
            eyebrow="资产空间"
            title={`${config.title}详情`}
            description={config.subtitle}
            onClose={() => setDetail(null)}
            closeIcon={<X size={18} />}
          />
          <DrawerDetailGrid>
            {config.columns.map((column) => (
              <DrawerDetailItem key={column.key} label={column.label} value={renderCell(detail, column)} />
            ))}
          </DrawerDetailGrid>
          <DrawerFooter>
            <button className="secondary-button" type="button" onClick={() => setDetail(null)}>关闭</button>
          </DrawerFooter>
        </Drawer>
      ) : null}

      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function AssetFormField({ field, row, options }: { field: AssetField; row: UnknownRecord | null; options: SelectOption[] }) {
  const defaultValue = row ? String(row[field.name] ?? "") : "";
  if (field.type === "select") {
    return (
      <div className="field">
        <label>{field.label}</label>
        <select name={field.name} defaultValue={defaultValue} required={field.required}>
          <option value="">请选择</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div className="field">
      <label>{field.label}</label>
      <input
        name={field.name}
        defaultValue={defaultValue}
        required={field.required}
        type={field.type}
        onFocus={field.type === "number" ? (event) => event.target.select() : undefined}
      />
    </div>
  );
}

function getPath(row: UnknownRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as UnknownRecord)[key];
  }, row);
}

function formatStatus(value: string): string {
  const labels: Record<string, string> = {
    enabled: "启用",
    disabled: "停用",
    vacant: "空置",
    reserved: "预留",
    leased: "已租"
  };
  return labels[value] ?? value;
}
