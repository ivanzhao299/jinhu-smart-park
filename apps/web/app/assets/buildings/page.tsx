"use client";
import {
  Card,
  DataTable,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader
} from "@jinhu/ui";

import { Edit3, Eye, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type UserParkContext } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { useAuthUser } from "../../../lib/auth-context";
import { getStoredUser } from "../../../lib/auth";
import {
  getCommittedDeleteRefreshError,
  removeCommittedItem
} from "../../../lib/committed-delete.logic";

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
  parkId: string;
  buildingCode: string;
  buildingName: string;
  floorCount: string;
  buildArea: string;
  status: BuildingStatus;
  sortNo: string;
  remark: string;
}

const emptyPage: PaginatedResult<BuildingRow> = { items: [], page: 1, page_size: 20, total: 0 };
const BUILDING_FLASH_KEY = "jinhu_building_flash_message";

const emptyForm: BuildingFormState = {
  parkId: "",
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

type BuildingListQuery = {
  keyword: string;
  status: string;
  parkId: string;
};

export default function BuildingsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<BuildingRow>>(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [listParkId, setListParkId] = useState("");
  const [message, setMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [form, setForm] = useState<BuildingFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BuildingRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const latestBuildingListRequest = useRef(0);
  const authUser = useAuthUser();
  const storedUser = authUser ?? getStoredUser();
  const accessibleParks = enabledParks(storedUser?.accessible_parks, storedUser?.park_id, storedUser?.park_name);
  const currentParkName = resolveParkName(accessibleParks, storedUser?.park_id, storedUser?.park_name);
  const effectiveListParkId = listParkId || storedUser?.park_id || "";
  const currentListQuery: BuildingListQuery = { keyword, status, parkId: effectiveListParkId };

  const load = useCallback(async (page = 1, overrides: Partial<BuildingListQuery> = {}) => {
    const query = {
      keyword,
      status,
      parkId: listParkId || getStoredUser()?.park_id || "",
      ...overrides
    };
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (query.keyword.trim()) params.set("keyword", query.keyword.trim());
    if (query.status !== "") params.set("status", query.status);
    if (query.parkId) params.set("parkId", query.parkId);
    const requestId = latestBuildingListRequest.current + 1;
    latestBuildingListRequest.current = requestId;
    let response: { data: PaginatedResult<BuildingRow> };
    try {
      response = await apiRequest<PaginatedResult<BuildingRow>>(`/buildings?${params.toString()}`, {
        token: getAccessToken()
      });
    } catch (error) {
      if (requestId !== latestBuildingListRequest.current) return;
      throw error;
    }
    if (requestId !== latestBuildingListRequest.current) return;
    setPageData(response.data);
  }, [keyword, listParkId, status]);

  useEffect(() => {
    const flashMessage = sessionStorage.getItem(BUILDING_FLASH_KEY);
    if (flashMessage) {
      sessionStorage.removeItem(BUILDING_FLASH_KEY);
      setMessage(flashMessage);
    }
    void load().catch((error: Error) => setMessage((current) => (
      current ? `${current}；列表加载失败：${error.message}` : error.message
    )));
  }, [load]);

  useEffect(() => {
    if (!listParkId && storedUser?.park_id) {
      setListParkId(storedUser.park_id);
    }
  }, [listParkId, storedUser?.park_id]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, parkId: effectiveListParkId });
    setShowForm(true);
    setMessage("");
    setFormMessage("");
  }

  function openEdit(row: BuildingRow) {
    setEditingId(row.id);
    setForm({
      parkId: row.parkId,
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
    setFormMessage("");
  }

  function changeListPark(parkId: string) {
    setListParkId(parkId);
    void load(1, { parkId }).catch((error: Error) => setMessage(error.message));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    setFormMessage("");
    try {
      if (!editingId && !form.parkId) throw new Error("请选择所属园区");
      const body = {
        parkId: form.parkId,
        buildingCode: form.buildingCode.trim(),
        buildingName: form.buildingName.trim(),
        floorCount: Number(form.floorCount || 0),
        buildArea: Number(form.buildArea || 0),
        status: form.status,
        sortNo: Number(form.sortNo || 0),
        remark: form.remark.trim()
      };
      const response = await apiRequest<BuildingRow>(editingId ? `/buildings/${editingId}` : "/buildings", {
        method: editingId ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editingId ? "building-update" : "building-create"),
        body
      });
      setShowForm(false);
      setEditingId(null);
      const savedParkId = response.data.parkId || form.parkId || currentListQuery.parkId;
      const nextQuery = editingId
        ? currentListQuery
        : { keyword: "", status: "", parkId: savedParkId };
      if (!editingId) {
        setKeyword(nextQuery.keyword);
        setStatus(nextQuery.status);
        setListParkId(nextQuery.parkId);
      }
      setMessage(!editingId && savedParkId !== getStoredUser()?.park_id ? "保存成功，已切换到所选园区列表" : "保存成功");
      {
        try {
          await load(editingId ? pageData.page : 1, nextQuery);
        } catch (refreshError) {
          setMessage(`保存成功，但列表刷新失败：${refreshError instanceof Error ? refreshError.message : "未知错误"}`);
        }
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "楼栋保存失败");
      return;
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(row: BuildingRow) {
    if (!window.confirm(`确认删除楼栋「${row.buildingName}」？删除前系统会检查是否存在未删除楼层。`)) {
      return;
    }
    try {
      const params = new URLSearchParams({ parkId: row.parkId });
      await apiRequest<{ id: string }>(`/buildings/${row.id}?${params.toString()}`, {
        method: "DELETE",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("building-delete")
      });
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "楼栋删除失败";
      window.alert(failureMessage);
      return;
    }
    setPageData((current) => removeCommittedItem(current, row.id));
    setMessage("删除成功");
    const refreshError = await getCommittedDeleteRefreshError(() => load(pageData.page));
    if (refreshError) setMessage(`删除成功，但列表刷新失败：${refreshError}`);
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.BUILDING_READ} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>楼栋管理</strong>
            <span>当前园区：{currentParkName} · 维护园区楼栋空间档案，作为楼层与房源的上级对象</span>
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
                <label htmlFor="buildingListPark">查看园区</label>
                <select
                  id="buildingListPark"
                  value={effectiveListParkId}
                  onChange={(event) => changeListPark(event.target.value)}
                >
                  {accessibleParks.map((park) => (
                    <option key={park.park_id} value={park.park_id}>{park.park_code ? `${park.park_code} · ` : ""}{park.park_name}</option>
                  ))}
                </select>
              </div>
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
                <th>所属园区</th>
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
                  <td>{resolveParkName(accessibleParks, row.parkId, currentParkName)}</td>
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
                    <PermissionButton className="ds-row-action ds-row-action-danger" permission={SYSTEM_PERMISSIONS.BUILDING_DELETE} title="删除" type="button" onClick={() => void remove(row)}>
                      <Trash2 size={16} />
                      <span className="ds-row-action-label">删除</span>
                    </PermissionButton>
                    </span>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={9}>暂无楼栋数据</td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="task-item">
            <span>共 {pageData.total} 条，第 {pageData.page} / {Math.max(1, Math.ceil(pageData.total / pageData.page_size))} 页</span>
            <span className="pagination-actions">
              <button className="pagination-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
              <button
                className="pagination-button"
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
            <DrawerHeader
              eyebrow="资产空间"
              title={editingId ? "编辑楼栋" : "新增楼栋"}
              description="维护园区楼栋空间档案，作为楼层与房源的上级对象。"
              onClose={() => setShowForm(false)}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                {!editingId ? (
                  <div className="field">
                    <label htmlFor="buildingFormPark">所属园区</label>
                    <select
                      id="buildingFormPark"
                      required
                      value={form.parkId}
                      onChange={(event) => setForm((current) => ({ ...current, parkId: event.target.value }))}
                    >
                      <option value="">请选择园区</option>
                      {accessibleParks.map((park) => (
                        <option key={park.park_id} value={park.park_id}>{park.park_code ? `${park.park_code} · ` : ""}{park.park_name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label>所属园区</label>
                    <input disabled value={resolveParkName(accessibleParks, form.parkId, currentParkName)} />
                  </div>
                )}
                <TextField label="楼栋编码" value={form.buildingCode} required={Boolean(editingId)} placeholder="请输入或生成楼栋编码" onChange={(value) => setForm((current) => ({ ...current, buildingCode: value }))} />
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
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <TextField label="备注" value={form.remark} onChange={(value) => setForm((current) => ({ ...current, remark: value }))} />
              </DrawerFormGrid>
              {formMessage ? <p className="status-pill" role="alert">{formMessage}</p> : null}
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>取消</button>
                <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "保存中…" : "保存"}</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {detail ? (
          <Drawer size="md" onClose={() => setDetail(null)}>
            <DrawerHeader
              eyebrow="资产空间"
              title="楼栋详情"
              description="查看楼栋档案详情。"
              onClose={() => setDetail(null)}
              closeIcon={<X size={18} />}
            />
            <DrawerDetailGrid>
              <DrawerDetailItem label="楼栋编码" value={detail.buildingCode} />
              <DrawerDetailItem label="楼栋名称" value={detail.buildingName} />
              <DrawerDetailItem label="所属园区" value={resolveParkName(accessibleParks, detail.parkId, currentParkName)} />
              <DrawerDetailItem label="楼层数" value={detail.floorCount} />
              <DrawerDetailItem label="建筑面积" value={formatArea(detail.buildArea)} />
              <DrawerDetailItem label="状态" value={<StatusBadge status={detail.status} />} />
              <DrawerDetailItem label="排序号" value={detail.sortNo} />
              <DrawerDetailItem label="更新时间" value={formatDateTime(detail.updateTime)} />
              <DrawerDetailItem label="备注" value={detail.remark ?? "-"} />
            </DrawerDetailGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setDetail(null)}>关闭</button>
            </DrawerFooter>
          </Drawer>
        ) : null}

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function enabledParks(
  parks: UserParkContext[] | undefined,
  currentParkId: string | undefined,
  currentParkName: string | null | undefined
): UserParkContext[] {
  const enabled = (parks ?? []).filter((park) => park.status === "enabled");
  if (!currentParkId || enabled.some((park) => park.park_id === currentParkId)) return enabled;
  return [{ park_id: currentParkId, park_name: currentParkName ?? currentParkId, is_default: true, status: "enabled" }, ...enabled];
}

function resolveParkName(parks: UserParkContext[], parkId: string | undefined, fallback?: string | null): string {
  if (!parkId) return fallback || "未选择园区";
  return parks.find((park) => park.park_id === parkId)?.park_name ?? fallback ?? parkId;
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
