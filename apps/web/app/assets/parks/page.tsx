"use client";

import { Edit3, Eye, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

interface ParkRow {
  id: string;
  tenantId: string;
  parkId: string;
  parkCode: string;
  parkName: string;
  address: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  lng: string | null;
  lat: string | null;
  totalArea: string;
  landArea: string;
  status: ParkStatus;
  remark: string | null;
  createTime: string;
  updateTime: string;
}

type ParkStatus = 0 | 1 | 2;

interface ParkFormState {
  parkCode: string;
  parkName: string;
  address: string;
  province: string;
  city: string;
  district: string;
  lng: string;
  lat: string;
  totalArea: string;
  landArea: string;
  status: ParkStatus;
  remark: string;
}

const emptyPage: PaginatedResult<ParkRow> = { items: [], page: 1, page_size: 20, total: 0 };

const emptyForm: ParkFormState = {
  parkCode: "",
  parkName: "",
  address: "",
  province: "",
  city: "",
  district: "",
  lng: "",
  lat: "",
  totalArea: "0",
  landArea: "0",
  status: 1,
  remark: ""
};

const statusOptions: Array<{ value: ParkStatus; label: string }> = [
  { value: 1, label: "运营中" },
  { value: 2, label: "建设中" },
  { value: 0, label: "停止" }
];

export default function ParksPage() {
  const [pageData, setPageData] = useState<PaginatedResult<ParkRow>>(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<ParkFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ParkRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status !== "") params.set("status", status);
    const response = await apiRequest<PaginatedResult<ParkRow>>(`/parks?${params.toString()}`, {
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

  function openEdit(row: ParkRow) {
    setEditingId(row.id);
    setForm({
      parkCode: row.parkCode,
      parkName: row.parkName,
      address: row.address ?? "",
      province: row.province ?? "",
      city: row.city ?? "",
      district: row.district ?? "",
      lng: row.lng ?? "",
      lat: row.lat ?? "",
      totalArea: row.totalArea ?? "0",
      landArea: row.landArea ?? "0",
      status: row.status,
      remark: row.remark ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      parkCode: form.parkCode.trim(),
      parkName: form.parkName.trim(),
      address: form.address.trim(),
      province: form.province.trim(),
      city: form.city.trim(),
      district: form.district.trim(),
      lng: form.lng === "" ? undefined : Number(form.lng),
      lat: form.lat === "" ? undefined : Number(form.lat),
      totalArea: Number(form.totalArea || 0),
      landArea: Number(form.landArea || 0),
      status: form.status,
      remark: form.remark.trim()
    };

    await apiRequest<ParkRow>(editingId ? `/parks/${editingId}` : "/parks", {
      method: editingId ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingId ? "park-update" : "park-create"),
      body
    });
    setShowForm(false);
    setEditingId(null);
    setMessage("保存成功");
    await load(pageData.page);
  }

  async function remove(row: ParkRow) {
    if (!window.confirm(`确认删除园区「${row.parkName}」？删除后将保留软删除记录。`)) {
      return;
    }
    await apiRequest<{ id: string }>(`/parks/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("park-delete")
    });
    setMessage("删除成功");
    await load(pageData.page);
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.PARK_READ} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>园区管理</strong>
            <span>维护园区基础档案，支撑多园区资产、合同和服务数据隔离</span>
          </div>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PARK_CREATE} type="button" onClick={openCreate}>
            <Plus size={16} />
            新增园区
          </PermissionButton>
        </header>

        <section className="work-panel">
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <div className="field">
                <label htmlFor="parkKeyword">关键词</label>
                <input id="parkKeyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="园区编码或名称" />
              </div>
              <div className="field">
                <label htmlFor="parkStatus">状态</label>
                <select id="parkStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
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
        </section>

        <section className="work-panel table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>园区编码</th>
                <th>园区名称</th>
                <th>区域</th>
                <th>地址</th>
                <th>总面积</th>
                <th>土地面积</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.parkCode}</td>
                  <td>{row.parkName}</td>
                  <td>{[row.province, row.city, row.district].filter(Boolean).join(" / ") || "-"}</td>
                  <td>{row.address ?? "-"}</td>
                  <td>{formatArea(row.totalArea)}</td>
                  <td>{formatArea(row.landArea)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>
                    <span className="data-table-actions">
                    <button title="详情" type="button" onClick={() => setDetail(row)}><Eye size={16} /></button>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.PARK_UPDATE} title="编辑" type="button" onClick={() => openEdit(row)}>
                      <Edit3 size={16} />
                    </PermissionButton>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.PARK_DELETE} title="删除" type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                      <Trash2 size={16} />
                    </PermissionButton>
                    </span>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={8}>暂无园区数据</td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
        </section>

        {showForm ? (
          <section className="login-panel drawer-panel">
            <div className="task-item">
              <h2 className="panel-title">{editingId ? "编辑园区" : "新增园区"}</h2>
              <button type="button" title="关闭" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form className="form-stack" onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
              <TextField label="园区编码" value={form.parkCode} required onChange={(value) => setForm((current) => ({ ...current, parkCode: value }))} />
              <TextField label="园区名称" value={form.parkName} required onChange={(value) => setForm((current) => ({ ...current, parkName: value }))} />
              <TextField label="省份" value={form.province} onChange={(value) => setForm((current) => ({ ...current, province: value }))} />
              <TextField label="城市" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
              <TextField label="区县" value={form.district} onChange={(value) => setForm((current) => ({ ...current, district: value }))} />
              <TextField label="地址" value={form.address} onChange={(value) => setForm((current) => ({ ...current, address: value }))} />
              <NumberField label="经度" value={form.lng} onChange={(value) => setForm((current) => ({ ...current, lng: value }))} />
              <NumberField label="纬度" value={form.lat} onChange={(value) => setForm((current) => ({ ...current, lat: value }))} />
              <NumberField label="总面积" value={form.totalArea} required onChange={(value) => setForm((current) => ({ ...current, totalArea: value }))} />
              <NumberField label="土地面积" value={form.landArea} required onChange={(value) => setForm((current) => ({ ...current, landArea: value }))} />
              <div className="field">
                <label htmlFor="parkFormStatus">状态</label>
                <select
                  id="parkFormStatus"
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: Number(event.target.value) as ParkStatus }))}
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
          </section>
        ) : null}

        {detail ? (
          <section className="login-panel drawer-panel">
            <div className="task-item">
              <h2 className="panel-title">园区详情</h2>
              <button type="button" title="关闭" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>
            <div className="form-stack">
              <DetailItem label="园区编码" value={detail.parkCode} />
              <DetailItem label="园区名称" value={detail.parkName} />
              <DetailItem label="行政区" value={[detail.province, detail.city, detail.district].filter(Boolean).join(" / ") || "-"} />
              <DetailItem label="地址" value={detail.address ?? "-"} />
              <DetailItem label="经纬度" value={`${detail.lng ?? "-"}, ${detail.lat ?? "-"}`} />
              <DetailItem label="总面积" value={formatArea(detail.totalArea)} />
              <DetailItem label="土地面积" value={formatArea(detail.landArea)} />
              <DetailItem label="状态" value={<StatusBadge status={detail.status} />} />
              <DetailItem label="备注" value={detail.remark ?? "-"} />
            </div>
          </section>
        ) : null}

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function TextField({ label, value, required, onChange }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({ label, value, required, onChange }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step="0.01"
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

function StatusBadge({ status }: { status: ParkStatus }) {
  const map: Record<ParkStatus, { label: string; className: string }> = {
    1: { label: "运营中", className: "status-success" },
    2: { label: "建设中", className: "status-warning" },
    0: { label: "停止", className: "status-danger" }
  };
  const option = map[status] ?? map[0];
  return <span className={`status-pill ${option.className}`}>{option.label}</span>;
}

function formatArea(value: string): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ㎡`;
}

function ForbiddenInline() {
  return (
    <main className="content">
      <section className="work-panel">
        <h1 className="panel-title">403</h1>
        <p>当前账号没有园区管理访问权限。</p>
      </section>
    </main>
  );
}
