"use client";

import { Edit3, Eye, FileUp, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";

type FloorStatus = 0 | 1;

interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
  sortNo: number;
}

interface FloorRow {
  id: string;
  tenantId: string;
  parkId: string;
  buildingId: string;
  building?: BuildingRow | null;
  floorCode: string;
  floorNo: number;
  floorName: string;
  floorArea: string;
  layoutFileId: string | null;
  layoutUrl: string | null;
  status: FloorStatus;
  sortNo: number;
  remark: string | null;
  createTime: string;
  updateTime: string;
}

interface FloorFormState {
  buildingId: string;
  floorCode: string;
  floorNo: string;
  floorName: string;
  floorArea: string;
  status: FloorStatus;
  sortNo: string;
  remark: string;
}

const emptyPage: PaginatedResult<FloorRow> = { items: [], page: 1, page_size: 20, total: 0 };

const emptyForm: FloorFormState = {
  buildingId: "",
  floorCode: "",
  floorNo: "1",
  floorName: "",
  floorArea: "0",
  status: 1,
  sortNo: "0",
  remark: ""
};

const statusOptions: Array<{ value: FloorStatus; label: string }> = [
  { value: 1, label: "启用" },
  { value: 0, label: "停用" }
];

const FLOOR_FIELD_LAYOUT_URL = "layout_url";

export default function FloorsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<FloorRow>>(emptyPage);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [buildingId, setBuildingId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FloorFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FloorRow | null>(null);
  const [layoutTarget, setLayoutTarget] = useState<FloorRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const canViewLayoutUrl = canViewField(authUser, "asset", "floor", FLOOR_FIELD_LAYOUT_URL);
  const canEditLayoutUrl = canEditField(authUser, "asset", "floor", FLOOR_FIELD_LAYOUT_URL);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (buildingId) params.set("building_id", buildingId);
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status !== "") params.set("status", status);
    const response = await apiRequest<PaginatedResult<FloorRow>>(`/floors?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [buildingId, keyword, status]);

  const loadBuildings = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100&sort=sortNo", {
      token: getAccessToken()
    });
    setBuildings(response.data.items);
  }, []);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void loadBuildings().catch((error: Error) => setMessage(error.message));
  }, [loadBuildings]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, buildingId: buildingId || buildings[0]?.id || "" });
    setShowForm(true);
    setMessage("");
  }

  function openEdit(row: FloorRow) {
    setEditingId(row.id);
    setForm({
      buildingId: row.buildingId,
      floorCode: row.floorCode,
      floorNo: String(row.floorNo ?? 1),
      floorName: row.floorName,
      floorArea: row.floorArea ?? "0",
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
      buildingId: form.buildingId,
      floorCode: form.floorCode.trim(),
      floorNo: Number(form.floorNo || 0),
      floorName: form.floorName.trim(),
      floorArea: Number(form.floorArea || 0),
      status: form.status,
      sortNo: Number(form.sortNo || 0),
      remark: form.remark.trim()
    };
    await apiRequest<FloorRow>(editingId ? `/floors/${editingId}` : "/floors", {
      method: editingId ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingId ? "floor-update" : "floor-create"),
      body
    });
    setShowForm(false);
    setEditingId(null);
    setMessage("保存成功");
    await load(pageData.page);
  }

  async function remove(row: FloorRow) {
    if (!window.confirm(`确认删除楼层「${row.floorName}」？删除前系统会检查是否存在未删除房源。`)) {
      return;
    }
    await apiRequest<{ id: string }>(`/floors/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("floor-delete")
    });
    setMessage("删除成功");
    await load(pageData.page);
  }

  function handleLayoutUploaded(_file: FileRecord) {
    setRefreshKey((value) => value + 1);
    void load(pageData.page).catch((error: Error) => setMessage(error.message));
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.FLOOR_READ} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>楼层管理</strong>
            <span>维护楼栋下的楼层档案和平面图，为房源归属提供空间层级</span>
          </div>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.FLOOR_CREATE} type="button" onClick={openCreate}>
            <Plus size={16} />
            新增楼层
          </PermissionButton>
        </header>

        <section className="work-panel">
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <div className="field">
                <label htmlFor="buildingFilter">楼栋</label>
                <select id="buildingFilter" value={buildingId} onChange={(event) => setBuildingId(event.target.value)}>
                  <option value="">全部楼栋</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="floorKeyword">关键词</label>
                <input id="floorKeyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="楼层编码或名称" />
              </div>
              <div className="field">
                <label htmlFor="floorStatus">状态</label>
                <select id="floorStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
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
                <th>楼栋</th>
                <th>楼层编码</th>
                <th>楼层名称</th>
                <th>楼层号</th>
                <th>面积</th>
                <th>平面图</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.building ? `${row.building.buildingCode} ${row.building.buildingName}` : "-"}</td>
                  <td>{row.floorCode}</td>
                  <td>{row.floorName}</td>
                  <td>{row.floorNo}</td>
                  <td>{formatArea(row.floorArea)}</td>
                  <td>
                    {!canViewLayoutUrl ? (
                      <span className="status-pill status-muted">无权限</span>
                    ) : row.layoutFileId ? (
                      <button type="button" onClick={() => setLayoutTarget(row)}>查看</button>
                    ) : (
                      <span className="status-pill status-muted">未上传</span>
                    )}
                  </td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>
                    <span className="data-table-actions">
                    <button title="详情" type="button" onClick={() => setDetail(row)}><Eye size={16} /></button>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.FLOOR_UPDATE} title="编辑" type="button" onClick={() => openEdit(row)}>
                      <Edit3 size={16} />
                    </PermissionButton>
                    {canEditLayoutUrl ? (
                      <PermissionButton permission={SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT} title="上传平面图" type="button" onClick={() => setLayoutTarget(row)}>
                        <FileUp size={16} />
                      </PermissionButton>
                    ) : null}
                    <PermissionButton permission={SYSTEM_PERMISSIONS.FLOOR_DELETE} title="删除" type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                      <Trash2 size={16} />
                    </PermissionButton>
                    </span>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={8}>暂无楼层数据</td>
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
              <h2 className="panel-title">{editingId ? "编辑楼层" : "新增楼层"}</h2>
              <button type="button" title="关闭" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form className="form-stack" onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
              <div className="field">
                <label htmlFor="floorFormBuilding">所属楼栋</label>
                <select
                  id="floorFormBuilding"
                  required
                  value={form.buildingId}
                  onChange={(event) => setForm((current) => ({ ...current, buildingId: event.target.value }))}
                >
                  <option value="">请选择楼栋</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                  ))}
                </select>
              </div>
              <TextField label="楼层编码" value={form.floorCode} required placeholder="请输入或生成楼层编码" onChange={(value) => setForm((current) => ({ ...current, floorCode: value }))} />
              <TextField label="楼层名称" value={form.floorName} required onChange={(value) => setForm((current) => ({ ...current, floorName: value }))} />
              <NumberField label="楼层号" value={form.floorNo} required step="1" onChange={(value) => setForm((current) => ({ ...current, floorNo: value }))} />
              <NumberField label="面积" value={form.floorArea} required step="0.01" onChange={(value) => setForm((current) => ({ ...current, floorArea: value }))} />
              <NumberField label="排序号" value={form.sortNo} required step="1" onChange={(value) => setForm((current) => ({ ...current, sortNo: value }))} />
              <div className="field">
                <label htmlFor="floorFormStatus">状态</label>
                <select
                  id="floorFormStatus"
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: Number(event.target.value) as FloorStatus }))}
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

        {layoutTarget ? (
          <section className="login-panel drawer-panel drawer-panel-lg">
            <div className="task-item">
              <h2 className="panel-title">{layoutTarget.floorName} 平面图</h2>
              <button type="button" title="关闭" onClick={() => setLayoutTarget(null)}><X size={16} /></button>
            </div>
            {canEditLayoutUrl ? (
              <PermissionGuard permission={SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT}>
                <FileUploader
                  bizType="floorplan"
                  bizId={layoutTarget.id}
                  uploadPath={`/floors/${layoutTarget.id}/layout`}
                  onUploaded={handleLayoutUploaded}
                />
              </PermissionGuard>
            ) : null}
            {canViewLayoutUrl ? <AttachmentList bizType="floorplan" bizId={layoutTarget.id} refreshKey={refreshKey} /> : null}
          </section>
        ) : null}

        {detail ? (
          <section className="login-panel drawer-panel">
            <div className="task-item">
              <h2 className="panel-title">楼层详情</h2>
              <button type="button" title="关闭" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>
            <div className="form-stack">
              <DetailItem label="楼栋" value={detail.building ? `${detail.building.buildingCode} ${detail.building.buildingName}` : "-"} />
              <DetailItem label="楼层编码" value={detail.floorCode} />
              <DetailItem label="楼层名称" value={detail.floorName} />
              <DetailItem label="楼层号" value={detail.floorNo} />
              <DetailItem label="面积" value={formatArea(detail.floorArea)} />
              {canViewLayoutUrl ? (
                <DetailItem
                  label="平面图"
                  value={detail.layoutUrl ? fieldText(maskField(authUser, "asset", "floor", FLOOR_FIELD_LAYOUT_URL, detail.layoutUrl)) : detail.layoutFileId ? "已上传" : "未上传"}
                />
              ) : null}
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

function StatusBadge({ status }: { status: FloorStatus }) {
  const option = status === 1
    ? { label: "启用", className: "status-success" }
    : { label: "停用", className: "status-danger" };
  return <span className={`status-pill ${option.className}`}>{option.label}</span>;
}

function formatArea(value: string): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ㎡`;
}

function fieldText(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function ForbiddenInline() {
  return (
    <main className="content">
      <section className="work-panel">
        <h1 className="panel-title">403</h1>
        <p>当前账号没有楼层管理访问权限。</p>
      </section>
    </main>
  );
}
