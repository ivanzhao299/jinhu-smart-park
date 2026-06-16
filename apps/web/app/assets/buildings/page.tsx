"use client";
import { DataTable, Drawer, Card } from "@jinhu/ui";

import { Edit3, Eye, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

type BuildingStatus = 0 | 1;

interface BuildingRow {
  id: string;
  tenantId: string;
  parkId: string;
  buildingCode: string;
  buildingName: string;
  floorCount: number;
  buildArea: string;
  status: BuildingStatus;
  sortNo: number;
  remark: string | null;
  createTime: string;
  updateTime: string;
}

interface BuildingFormState {
  buildingCode: string;
  buildingName: string;
  floorCount: string;
  buildArea: string;
  status: BuildingStatus;
  sortNo: string;
  remark: string;
}

const emptyPage: PaginatedResult<BuildingRow> = { items: [], page: 1, page_size: 20, total: 0 };

const emptyForm: BuildingFormState = {
  buildingCode: "",
  buildingName: "",
  floorCount: "0",
  buildArea: "0",
  status: 1,
  sortNo: "0",
  remark: ""
};

const statusOptions: Array<{ value: BuildingStatus; label: string }> = [
  { value: 1, label: "启用" },
  { value: 0, label: "停用" }
];

export default function BuildingsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<BuildingRow>>(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<BuildingFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BuildingRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status !== "") params.set("status", status);
    const response = await apiRequest<PaginatedResult<BuildingRow>>(`/buildings?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [keyword, status]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setMessage("");
  }

  function openEdit(row: BuildingRow) {
    setEditingId(row.id);
    setForm({
      buildingCode: row.buildingCode,
      buildingName: row.buildingName,
      floorCount: String(row.floorCount ?? 0),
      buildArea: row.buildArea ?? "0",
      status: row.status,
      sortNo: String(row.sortNo ?? 0),
      remark: row.remark ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      buildingCode: form.buildingCode.trim(),
      buildingName: form.buildingName.trim(),
      floorCount: Number(form.floorCount || 0),
      buildArea: Number(form.buildArea || 0),
      status: form.status,
      sortNo: Number(form.sortNo || 0),
      remark: form.remark.trim()
    };
    await apiRequest<BuildingRow>(editingId ? `/buildings/${editingId}` : "/buildings", {
      method: editingId ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingId ? "building-update" : "building-create"),
      body
    });
    setShowForm(false);
    setEditingId(null);
    setMessage("保存成功");
    await load(pageData.page);
  }

  async function remove(row: BuildingRow) {
    if (!window.confirm(`确认删除楼栋「${row.buildingName}」？删除前系统会检查是否存在未删除楼层。`)) {
      return;
    }
    await apiRequest<{ id: string }>(`/buildings/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("building-delete")
    });
    setMessage("删除成功");
    await load(pageData.page);
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.BUILDING_READ} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>楼栋管理</strong>
            <span>维护园区楼栋空间档案，作为楼层与房源的上级对象</span>
          </div>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.BUILDING_CREATE} type="button" onClick={openCreate}>
            <Plus size={16} />
            新增楼栋
          </PermissionButton>
        </header>

        <Card >
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <div className="field">
                <label htmlFor="buildingKeyword">关键词</label>
                <input id="buildingKeyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="楼栋编码或名称" />
              </div>
              <div className="field">
                <label htmlFor="buildingStatus">状态</label>
                <select id="buildingStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">全部</option>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="primary-button" type="submit">
              <Search size={16} />
              查询
            </button>
          </form>
        </Card>

        <Card className=" table-scroll">
          <DataTable >
            <thead>
              <tr>
                <th>楼栋编码</th>
                <th>楼栋名称</th>
                <th>楼层数</th>
                <th>建筑面积</th>
                <th>状态</th>
                <th>排序号</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.buildingCode}</td>
                  <td>{row.buildingName}</td>
                  <td>{row.floorCount}</td>
                  <td>{formatArea(row.buildArea)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.sortNo}</td>
                  <td>{formatDateTime(row.updateTime)}</td>
                  <td>
                    <span className="data-table-actions">
                    <button className="ds-row-action ds-row-action-view" title="详情" type="button" onClick={() => setDetail(row)}>
                      <Eye size={16} />
                      <span className="ds-row-action-label">详情</span>
                    </button>
                    <PermissionButton className="ds-row-action ds-row-action-edit" permission={SYSTEM_PERMISSIONS.BUILDING_UPDATE} title="编辑" type="button" onClick={() => openEdit(row)}>
                      <Edit3 size={16} />
                      <span className="ds-row-action-label">编辑</span>
                    </PermissionButton>
                    <PermissionButton className="ds-row-action ds-row-action-danger" permission={SYSTEM_PERMISSIONS.BUILDING_DELETE} title="删除" type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                      <Trash2 size={16} />
                      <span className="ds-row-action-label">删除</span>
                    </PermissionButton>
                    </span>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={8}>暂无楼栋数据</td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="task-item">
            <span>共 {pageData.total} 条，第 {pageData.page} / {Math.max(1, Math.ceil(pageData.total / pageData.page_size))} 页</span>
            <span>
              <button type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
              <button
                type="button"
                disabled={pageData.page >= Math.max(1, Math.ceil(pageData.total / pageData.page_size))}
                onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}
              >
                下一页
              </button>
            </span>
          </div>
        </Card>

        {showForm ? (
          <Drawer size="md" onClose={() => setShowForm(false)}>
            <div className="task-item">
              <h2 className="panel-title">{editingId ? "编辑楼栋" : "新增楼栋"}</h2>
              <button type="button" title="关闭" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form className="form-stack" onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
              <TextField label="楼栋编码" value={form.buildingCode} required placeholder="请输入或生成楼栋编码" onChange={(value) => setForm((current) => ({ ...current, buildingCode: value }))} />
              <TextField label="楼栋名称" value={form.buildingName} required onChange={(value) => setForm((current) => ({ ...current, buildingName: value }))} />
              <NumberField label="楼层数" value={form.floorCount} required step="1" onChange={(value) => setForm((current) => ({ ...current, floorCount: value }))} />
              <NumberField label="建筑面积" value={form.buildArea} required step="0.01" onChange={(value) => setForm((current) => ({ ...current, buildArea: value }))} />
              <NumberField label="排序号" value={form.sortNo} required step="1" onChange={(value) => setForm((current) => ({ ...current, sortNo: value }))} />
              <div className="field">
                <label htmlFor="buildingFormStatus">状态</label>
                <select
                  id="buildingFormStatus"
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: Number(event.target.value) as BuildingStatus }))}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <TextField label="备注" value={form.remark} onChange={(value) => setForm((current) => ({ ...current, remark: value }))} />
              <button className="primary-button" type="submit">保存</button>
              <button type="button" onClick={() => setShowForm(false)}>取消</button>
            </form>
          </Drawer>
        ) : null}

        {detail ? (
          <Drawer size="md" onClose={() => setDetail(null)}>
            <div className="task-item">
              <h2 className="panel-title">楼栋详情</h2>
              <button type="button" title="关闭" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>
            <div className="form-stack">
              <DetailItem label="楼栋编码" value={detail.buildingCode} />
              <DetailItem label="楼栋名称" value={detail.buildingName} />
              <DetailItem label="楼层数" value={detail.floorCount} />
              <DetailItem label="建筑面积" value={formatArea(detail.buildArea)} />
              <DetailItem label="状态" value={<StatusBadge status={detail.status} />} />
              <DetailItem label="排序号" value={detail.sortNo} />
              <DetailItem label="更新时间" value={formatDateTime(detail.updateTime)} />
              <DetailItem label="备注" value={detail.remark ?? "-"} />
            </div>
          </Drawer>
        ) : null}

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function TextField({
  label,
  value,
  required,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({
  label,
  value,
  required,
  step,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  step: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        required={required}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="task-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: BuildingStatus }) {
  const option = status === 1
    ? { label: "启用", className: "status-success" }
    : { label: "停用", className: "status-danger" };
  return <span className={`status-pill ${option.className}`}>{option.label}</span>;
}

function formatArea(value: string): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ㎡`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card >
        <h1 className="panel-title">403</h1>
        <p>当前账号没有楼栋管理访问权限。</p>
      </Card>
    </main>
  );
}
