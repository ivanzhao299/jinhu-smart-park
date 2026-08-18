"use client";
import { Card, DataTable, Drawer, DrawerDetailGrid, DrawerDetailItem, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader, DrawerSection } from "@jinhu/ui";

import { Edit3, Eye, FileUp, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult, type UserContext, type UserParkContext } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getStoredUser, getToken, switchParkContext } from "../../../lib/auth";
import { useAuthSessionActions, useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import {
  getCommittedDeleteRefreshError,
  removeCommittedItem
} from "../../../lib/committed-delete.logic";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";
import {
  applyCommittedFloorLayout,
  clearCommittedFloorLayout
} from "./floor-layout-state.logic";

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
  parkId: string;
  buildingId: string;
  floorCode: string;
  floorNo: string;
  floorName: string;
  floorArea: string;
  status: FloorStatus;
  sortNo: string;
  remark: string;
}

interface FloorListQuery {
  buildingId: string;
  keyword: string;
  status: string;
}

const emptyPage: PaginatedResult<FloorRow> = { items: [], page: 1, page_size: 20, total: 0 };

const emptyForm: FloorFormState = {
  parkId: "",
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
  const router = useRouter();
  const authUser = useAuthUser();
  const sessionActions = useAuthSessionActions();
  const [pageData, setPageData] = useState<PaginatedResult<FloorRow>>(emptyPage);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [listParkId, setListParkId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FloorFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FloorRow | null>(null);
  const [layoutTarget, setLayoutTarget] = useState<FloorRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listParkSwitching, setListParkSwitching] = useState(false);
  const [formParkSwitching, setFormParkSwitching] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const floorSubmitLock = useRef(false);
  const listParkSwitchLock = useRef(false);
  const formParkSwitchLock = useRef(false);
  const scopedDataGeneration = useRef(0);
  const storedUser = authUser ?? getStoredUser();
  const accessibleParks = useMemo(() => enabledParks(storedUser?.accessible_parks), [storedUser?.accessible_parks]);
  const effectiveParkId = listParkId || storedUser?.park_id || "";
  const canViewLayoutUrl = canViewField(authUser, "asset", "floor", FLOOR_FIELD_LAYOUT_URL);
  const canEditLayoutUrl = canEditField(authUser, "asset", "floor", FLOOR_FIELD_LAYOUT_URL);
  const editingFloor = editingId ? pageData.items.find((row) => row.id === editingId) ?? null : null;

  const load = useCallback(async (page = 1, override?: Partial<FloorListQuery>) => {
    const generation = scopedDataGeneration.current;
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    const nextBuildingId = override?.buildingId ?? buildingId;
    const nextKeyword = override?.keyword ?? keyword;
    const nextStatus = override?.status ?? status;
    if (nextBuildingId) params.set("building_id", nextBuildingId);
    if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
    if (nextStatus !== "") params.set("status", nextStatus);
    const response = await apiRequest<PaginatedResult<FloorRow>>(`/floors?${params.toString()}`, {
      token: getAccessToken()
    });
    if (generation === scopedDataGeneration.current) setPageData(response.data);
  }, [buildingId, keyword, status]);

  const loadBuildings = useCallback(async () => {
    const generation = scopedDataGeneration.current;
    const response = await apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100&sort=sortNo", {
      token: getAccessToken()
    });
    if (generation === scopedDataGeneration.current) setBuildings(response.data.items);
    return response.data.items;
  }, []);

  const handleSwitchError = useCallback((error: Error, publish: (message: string) => void) => {
    publish(error.message);
    if (!getToken()) router.replace("/login");
  }, [router]);

  const ensureParkContext = useCallback(async (targetParkId: string, options: { publishSession?: boolean } = {}) => {
    const publishSession = options.publishSession ?? true;
    const currentUser = getStoredUser() ?? authUser;
    if (!targetParkId) throw new Error("请选择所属园区");
    if (currentUser?.park_id === targetParkId) {
      if (publishSession && authUser?.park_id !== targetParkId) sessionActions?.publishUser(currentUser);
      return currentUser;
    }
    const nextUser = await switchParkContext(targetParkId);
    if (publishSession) sessionActions?.publishUser(nextUser);
    setListParkId(nextUser.park_id);
    return nextUser;
  }, [authUser, sessionActions]);

  const changeListPark = useCallback(async (targetParkId: string) => {
    if (listParkSwitchLock.current || !targetParkId || targetParkId === effectiveParkId) return;
    listParkSwitchLock.current = true;
    setListParkSwitching(true);
    setMessage("");
    try {
      const nextUser = await ensureParkContext(targetParkId);
      setListParkId(nextUser?.park_id ?? targetParkId);
      setBuildingId("");
      setKeyword("");
      setStatus("");
      scopedDataGeneration.current += 1;
      setBuildings([]);
      setPageData(emptyPage);
      await loadBuildings();
      await load(1, { buildingId: "", keyword: "", status: "" });
    } finally {
      listParkSwitchLock.current = false;
      setListParkSwitching(false);
    }
  }, [effectiveParkId, ensureParkContext, load, loadBuildings]);

  const changeFormPark = useCallback(async (targetParkId: string) => {
    if (formParkSwitchLock.current || targetParkId === form.parkId) return;
    const previousParkId = form.parkId;
    formParkSwitchLock.current = true;
    setFormParkSwitching(true);
    setFormMessage("");
    setForm((current) => ({ ...current, parkId: targetParkId, buildingId: "" }));
    let contextCommitted = false;
    try {
      let nextUser: UserContext;
      try {
        nextUser = await ensureParkContext(targetParkId, { publishSession: false });
        contextCommitted = true;
      } catch (error) {
        setForm((current) => current.parkId === targetParkId
          ? { ...current, parkId: previousParkId, buildingId: "" }
          : current);
        throw error;
      }
      sessionActions?.publishUser(nextUser);
      setBuildingId("");
      setKeyword("");
      setStatus("");
      scopedDataGeneration.current += 1;
      setBuildings([]);
      setPageData(emptyPage);
      await loadBuildings();
      await load(1, { buildingId: "", keyword: "", status: "" });
    } catch (error) {
      if (!contextCommitted) throw error;
      throw new Error(`园区已切换，但数据刷新失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      formParkSwitchLock.current = false;
      setFormParkSwitching(false);
    }
  }, [ensureParkContext, form.parkId, load, loadBuildings, sessionActions]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void loadBuildings().catch((error: Error) => setMessage(error.message));
  }, [loadBuildings]);

  useEffect(() => {
    setListParkId(storedUser?.park_id ?? "");
  }, [storedUser?.park_id]);

  function openCreate() {
    if (listParkSwitchLock.current) {
      setMessage("园区切换中，请稍后");
      return;
    }
    setEditingId(null);
    setForm({ ...emptyForm, parkId: effectiveParkId, buildingId: buildingId || "" });
    setShowForm(true);
    setMessage("");
    setFormMessage("");
  }

  function closeForm() {
    if (formParkSwitchLock.current) {
      setFormMessage("园区切换中，请稍后");
      return;
    }
    setShowForm(false);
  }

  function openEdit(row: FloorRow) {
    setEditingId(row.id);
    setForm({
      parkId: row.parkId,
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
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (floorSubmitLock.current || formParkSwitchLock.current) return;
    floorSubmitLock.current = true;
    setSubmitting(true);
    setFormMessage("");
    try {
      if (!editingId) await ensureParkContext(form.parkId);
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
      try {
        await load(editingId ? pageData.page : 1);
      } catch (refreshError) {
        setMessage(`保存成功，但列表刷新失败：${refreshError instanceof Error ? refreshError.message : "未知错误"}`);
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "楼层保存失败");
    } finally {
      setSubmitting(false);
      floorSubmitLock.current = false;
    }
  }

  async function remove(row: FloorRow) {
    if (!window.confirm(`确认删除楼层「${row.floorName}」？删除前系统会检查是否存在未删除房源。`)) {
      return;
    }
    try {
      await apiRequest<{ id: string }>(`/floors/${row.id}`, {
        method: "DELETE",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("floor-delete")
      });
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "楼层删除失败";
      window.alert(failureMessage);
      return;
    }
    setPageData((current) => removeCommittedItem(current, row.id));
    setMessage("删除成功");
    const refreshError = await getCommittedDeleteRefreshError(() => load(pageData.page));
    if (refreshError) setMessage(`删除成功，但列表刷新失败：${refreshError}`);
  }

  function handleLayoutUploaded(floorId: string, file: FileRecord) {
    setPageData((current) => ({
      ...current,
      items: current.items.map((row) => applyCommittedFloorLayout(
        row,
        floorId,
        file.id,
        file.fileUrl
      ))
    }));
    setLayoutTarget((current) => current
      ? applyCommittedFloorLayout(current, floorId, file.id, file.fileUrl)
      : null);
    setDetail((current) => current
      ? applyCommittedFloorLayout(current, floorId, file.id, file.fileUrl)
      : null);
    setRefreshKey((value) => value + 1);
    void load(pageData.page).catch((error: Error) => {
      setMessage(`平面图已上传，但楼层列表刷新失败：${error.message}`);
    });
  }

  function handleLayoutDeleted(floorId: string, file: FileRecord) {
    setPageData((current) => ({
      ...current,
      items: current.items.map((row) => clearCommittedFloorLayout(row, floorId, file.id))
    }));
    setLayoutTarget((current) => current
      ? clearCommittedFloorLayout(current, floorId, file.id)
      : null);
    setDetail((current) => current
      ? clearCommittedFloorLayout(current, floorId, file.id)
      : null);
    setRefreshKey((value) => value + 1);
    void load(pageData.page).catch((error: Error) => {
      setMessage(`平面图已删除，但楼层列表刷新失败：${error.message}`);
    });
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.FLOOR_READ} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>楼层管理</strong>
            <span>维护楼栋下的楼层档案和平面图，为房源归属提供空间层级</span>
          </div>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.FLOOR_CREATE} type="button" disabled={listParkSwitching} onClick={openCreate}>
            <Plus size={16} />
            新增楼层
          </PermissionButton>
        </header>

        <Card >
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <div className="field">
                <label htmlFor="floorListPark">查看园区</label>
                <select id="floorListPark" value={effectiveParkId} disabled={listParkSwitching} onChange={(event) => void changeListPark(event.target.value).catch((error: Error) => handleSwitchError(error, setMessage))}>
                  {accessibleParks.length === 0 ? <option value={effectiveParkId}>{storedUser?.park_name ?? "当前园区"}</option> : null}
                  {accessibleParks.map((park) => (
                    <option key={park.park_id} value={park.park_id}>{park.park_code ? `${park.park_code} ` : ""}{park.park_name}</option>
                  ))}
                </select>
              </div>
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
        </Card>

        <Card className=" table-scroll">
          <DataTable >
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
                      <button className="inline-action-button" type="button" onClick={() => setLayoutTarget(row)}>查看</button>
                    ) : (
                      <span className="status-pill status-muted">未上传</span>
                    )}
                  </td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>
                    <span className="data-table-actions">
                    <button className="ds-row-action ds-row-action-view" title="详情" type="button" onClick={() => setDetail(row)}>
                      <Eye size={16} />
                      <span className="ds-row-action-label">详情</span>
                    </button>
                    <PermissionButton className="ds-row-action ds-row-action-edit" permission={SYSTEM_PERMISSIONS.FLOOR_UPDATE} title="编辑" type="button" onClick={() => openEdit(row)}>
                      <Edit3 size={16} />
                      <span className="ds-row-action-label">编辑</span>
                    </PermissionButton>
                    {canEditLayoutUrl ? (
                      <PermissionButton className="ds-row-action ds-row-action-file" permission={SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT} title="上传平面图" type="button" onClick={() => setLayoutTarget(row)}>
                        <FileUp size={16} />
                        <span className="ds-row-action-label">平面图</span>
                      </PermissionButton>
                    ) : null}
                    <PermissionButton className="ds-row-action ds-row-action-danger" permission={SYSTEM_PERMISSIONS.FLOOR_DELETE} title="删除" type="button" onClick={() => void remove(row)}>
                      <Trash2 size={16} />
                      <span className="ds-row-action-label">删除</span>
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
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader
              eyebrow="资产空间"
              title={editingId ? "编辑楼层" : "新增楼层"}
              description="维护楼栋下的楼层档案与平面图。"
              closeIcon={<X size={18} />}
              onClose={closeForm}
            />
            <DrawerForm onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                {!editingId ? (
	                  <div className="field ds-form-span-all">
	                    <label htmlFor="floorFormPark">所属园区</label>
	                    <select
	                      id="floorFormPark"
	                      required
	                      disabled={formParkSwitching || submitting}
	                      value={form.parkId}
	                      onChange={(event) => void changeFormPark(event.target.value).catch((error: Error) => handleSwitchError(error, setFormMessage))}
	                    >
                      <option value="">请选择园区</option>
                      {accessibleParks.map((park) => (
                        <option key={park.park_id} value={park.park_id}>{park.park_code ? `${park.park_code} ` : ""}{park.park_name}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
	                <div className="field ds-form-span-all">
	                  <label htmlFor="floorFormBuilding">所属楼栋</label>
	                  <select
	                    id="floorFormBuilding"
	                    required
	                    disabled={formParkSwitching}
	                    value={form.buildingId}
	                    onChange={(event) => setForm((current) => ({ ...current, buildingId: event.target.value }))}
	                  >
                    <option value="">请选择楼栋</option>
                    {buildings.map((building) => (
                      <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                    ))}
                  </select>
                </div>
                <TextField label="楼层编码" value={form.floorCode} required={Boolean(editingId)} placeholder="请输入或生成楼层编码" onChange={(value) => setForm((current) => ({ ...current, floorCode: value }))} />
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
                <TextField className="ds-form-span-all" label="备注" value={form.remark} onChange={(value) => setForm((current) => ({ ...current, remark: value }))} />
              </DrawerFormGrid>
              <DrawerSection title="平面图">
                {editingFloor ? (
                  <div className="ds-drawer-upload-panel">
                    {canEditLayoutUrl ? (
                      <PermissionGuard permission={SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT}>
                        <FileUploader
                          bizType="floorplan"
                          bizId={editingFloor.id}
                          compact
                          policyKey="floorplan"
                          uploadPath={`/floors/${editingFloor.id}/layout`}
                          onUploaded={(file) => handleLayoutUploaded(editingFloor.id, file)}
                        />
                      </PermissionGuard>
                    ) : null}
                    {canViewLayoutUrl ? <AttachmentList bizType="floorplan" bizId={editingFloor.id} compact refreshKey={refreshKey} mutationPermission={SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT} onDeleted={(file) => handleLayoutDeleted(editingFloor.id, file)} /> : null}
                  </div>
                ) : (
                  <div className="ds-drawer-upload-placeholder">
                    <FileUp size={18} />
                    <span>保存楼层后上传平面图</span>
                  </div>
                )}
              </DrawerSection>
              {formMessage ? <p className="status-pill" role="alert">{formMessage}</p> : null}
              <DrawerFooter>
                <button className="secondary-button" type="button" disabled={formParkSwitching} onClick={closeForm}>取消</button>
                <button className="primary-button" type="submit" disabled={submitting || formParkSwitching}>{submitting ? "保存中..." : "保存"}</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {layoutTarget ? (
          <Drawer size="md" onClose={() => setLayoutTarget(null)}>
            <DrawerHeader
              eyebrow="资产空间"
              title={`${layoutTarget.floorName} 平面图`}
              description="上传与查看楼层平面图附件。"
              onClose={() => setLayoutTarget(null)}
              closeIcon={<X size={18} />}
            />
            {canEditLayoutUrl ? (
              <PermissionGuard permission={SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT}>
                <FileUploader
                  bizType="floorplan"
                  bizId={layoutTarget.id}
                  policyKey="floorplan"
                  uploadPath={`/floors/${layoutTarget.id}/layout`}
                  onUploaded={(file) => handleLayoutUploaded(layoutTarget.id, file)}
                />
              </PermissionGuard>
            ) : null}
            {canViewLayoutUrl ? <AttachmentList bizType="floorplan" bizId={layoutTarget.id} refreshKey={refreshKey} mutationPermission={SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT} onDeleted={(file) => handleLayoutDeleted(layoutTarget.id, file)} /> : null}
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setLayoutTarget(null)}>关闭</button>
            </DrawerFooter>
          </Drawer>
        ) : null}

        {detail ? (
          <Drawer size="md" onClose={() => setDetail(null)}>
            <DrawerHeader
              eyebrow="资产空间"
              title="楼层详情"
              description="查看楼层档案详情。"
              onClose={() => setDetail(null)}
              closeIcon={<X size={18} />}
            />
            <DrawerDetailGrid>
              <DrawerDetailItem label="楼栋" value={detail.building ? `${detail.building.buildingCode} ${detail.building.buildingName}` : "-"} />
              <DrawerDetailItem label="楼层编码" value={detail.floorCode} />
              <DrawerDetailItem label="楼层名称" value={detail.floorName} />
              <DrawerDetailItem label="楼层号" value={detail.floorNo} />
              <DrawerDetailItem label="面积" value={formatArea(detail.floorArea)} />
              {canViewLayoutUrl ? (
                <DrawerDetailItem
                  label="平面图"
                  value={detail.layoutUrl ? fieldText(maskField(authUser, "asset", "floor", FLOOR_FIELD_LAYOUT_URL, detail.layoutUrl)) : detail.layoutFileId ? "已上传" : "未上传"}
                />
              ) : null}
              <DrawerDetailItem label="状态" value={<StatusBadge status={detail.status} />} />
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

function TextField({
  label,
  value,
  required,
  placeholder,
  className,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={className ? `field ${className}` : "field"}>
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

function StatusBadge({ status }: { status: FloorStatus }) {
  const option = status === 1
    ? { label: "启用", className: "status-success" }
    : { label: "停用", className: "status-danger" };
  return <span className={`status-pill ${option.className}`}>{option.label}</span>;
}

function formatArea(value: string): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ㎡`;
}

function enabledParks(parks: UserParkContext[] | undefined): UserParkContext[] {
  return (parks ?? []).filter((park) => park.status === "enabled");
}

function fieldText(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card >
        <h1 className="panel-title">403</h1>
        <p>当前账号没有楼层管理访问权限。</p>
      </Card>
    </main>
  );
}
