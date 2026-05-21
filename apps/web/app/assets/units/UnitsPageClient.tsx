"use client";
import { Card, DataTable, Drawer, DrawerActions, DrawerDetailGrid, DrawerDetailItem, DrawerFooter, DrawerHeader } from "@jinhu/ui";

import { Download, Edit3, Eye, FileDown, FileImage, FileUp, History, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult, type UserContext } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { API_PREFIX, apiFormRequest, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";
import { hasPermission } from "../../../lib/permissions";

type EnabledStatus = 0 | 1;

interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
}

interface FloorRow {
  id: string;
  buildingId: string;
  floorCode: string;
  floorName: string;
  floorNo: number;
}

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  sortOrder: number;
  status: string;
  tagType: string | null;
}

interface UnitRow {
  id: string;
  unitCode: string;
  buildingId: string;
  floorId: string;
  building?: BuildingRow | null;
  floor?: FloorRow | null;
  unitName: string;
  usageType: number;
  unitArea: string;
  useArea: string;
  rentalStatus: number;
  fittingStatus: number;
  refPrice?: string | null;
  photoFileIds: string[] | null;
  photoUrls?: string[] | string | null;
  floorplanFileId: string | null;
  floorplanUrl: string | null;
  availableDate: string | null;
  lockReason: string | null;
  lockExpireTime: string | null;
  statusUpdateTime: string | null;
  statusUpdateBy: string | null;
  status: EnabledStatus;
  remark: string | null;
  updateTime: string;
}

interface UnitFormState {
  unitCode: string;
  buildingId: string;
  floorId: string;
  unitName: string;
  usageType: string;
  unitArea: string;
  useArea: string;
  rentalStatus: string;
  fittingStatus: string;
  refPrice: string;
  availableDate: string;
  status: EnabledStatus;
  remark: string;
}

type UnitAttachmentMode = "photos" | "floorplan";
type UnitStatusPanelMode = "change" | "logs";

interface UnitStatusLogRow {
  id: string;
  beforeStatus: number;
  afterStatus: number;
  reason: string;
  sourceType: string;
  operatorName: string | null;
  createBy: string | null;
  createTime: string;
  opTime: string;
}

interface UnitWorkOrderRow {
  id: string;
  wo_code: string;
  title: string;
  wo_type: string;
  priority: string;
  urgency: string | null;
  status: string;
  location: string | null;
  reporter_name: string | null;
  reporter_mobile?: string | null;
  assignee_name: string | null;
  overdue_flag: boolean;
  create_time: string;
  update_time: string;
}

interface UnitWorkOrdersResponse {
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
  };
  recent_items: UnitWorkOrderRow[];
}

interface UnitHazardRow {
  id: string;
  hazard_code: string;
  title: string;
  hazard_type: string | null;
  risk_level: string | null;
  source_type: string;
  status: string;
  location: string;
  rectify_user_name: string | null;
  rectify_deadline: string | null;
  overdue_flag: boolean;
  update_time: string;
}

interface UnitHazardsResponse {
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
    major_count: number;
  };
  recent_items: UnitHazardRow[];
}

interface ImportResult {
  total: number;
  success_count: number;
  fail_count: number;
  rows: Array<{
    row_no: number;
    success: boolean;
    unit_code: string;
    id: string | null;
    errors: string[];
  }>;
}

const emptyPage: PaginatedResult<UnitRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyStatusLogPage: PaginatedResult<UnitStatusLogRow> = { items: [], page: 1, page_size: 20, total: 0 };

const ALLOWED_RENTAL_STATUS_TARGETS = new Map<number, number[]>([
  [10, [20, 50, 60]],
  [20, [10, 30, 50]],
  [30, [40, 50]],
  [40, [30, 10]],
  [50, [10, 60]],
  [60, [10, 50]],
  [70, []]
]);

const emptyForm: UnitFormState = {
  unitCode: "",
  buildingId: "",
  floorId: "",
  unitName: "",
  usageType: "10",
  unitArea: "0",
  useArea: "0",
  rentalStatus: "10",
  fittingStatus: "10",
  refPrice: "0",
  availableDate: "",
  status: 1,
  remark: ""
};

const UNIT_FIELD_REF_PRICE = "ref_price";
const UNIT_FIELD_REMARK = "remark";
const UNIT_FIELD_PHOTO_URLS = "photo_urls";

interface UnitsPageProps {
  title?: string;
}

export default function UnitsPage({ title = "房间/房源管理" }: UnitsPageProps = {}) {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<UnitRow>>(emptyPage);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [filters, setFilters] = useState({
    buildingId: "",
    floorId: "",
    usageType: "",
    rentalStatus: "",
    fittingStatus: "",
    keyword: "",
    minArea: "",
    maxArea: ""
  });
  const [form, setForm] = useState<UnitFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<UnitRow | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [attachmentTarget, setAttachmentTarget] = useState<{ unit: UnitRow; mode: UnitAttachmentMode } | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<UnitRow | null>(null);
  const [transitionPanelMode, setTransitionPanelMode] = useState<UnitStatusPanelMode>("change");
  const [transitionStatus, setTransitionStatus] = useState("10");
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionLockReason, setTransitionLockReason] = useState("");
  const [transitionLockExpireTime, setTransitionLockExpireTime] = useState("");
  const [statusLogPage, setStatusLogPage] = useState<PaginatedResult<UnitStatusLogRow>>(emptyStatusLogPage);
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const canForceChangeStatus = hasPermission(authUser, SYSTEM_PERMISSIONS.UNIT_FORCE_CHANGE_STATUS);
  const canChangeStatus = hasPermission(authUser, SYSTEM_PERMISSIONS.UNIT_CHANGE_STATUS);
  const canReadStatusLog = hasPermission(authUser, SYSTEM_PERMISSIONS.UNIT_STATUS_LOG);
  const canViewRefPrice = canViewField(authUser, "asset", "unit", UNIT_FIELD_REF_PRICE);
  const canEditRefPrice = canEditField(authUser, "asset", "unit", UNIT_FIELD_REF_PRICE);
  const canViewRemark = canViewField(authUser, "asset", "unit", UNIT_FIELD_REMARK);
  const canEditRemark = canEditField(authUser, "asset", "unit", UNIT_FIELD_REMARK);
  const canEditPhotoUrls = canEditField(authUser, "asset", "unit", UNIT_FIELD_PHOTO_URLS);

  const visibleFloors = useMemo(
    () => floors.filter((floor) => !filters.buildingId || floor.buildingId === filters.buildingId),
    [floors, filters.buildingId]
  );
  const formFloors = useMemo(
    () => floors.filter((floor) => !form.buildingId || floor.buildingId === form.buildingId),
    [floors, form.buildingId]
  );

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-updateTime" });
    if (filters.buildingId) params.set("building_id", filters.buildingId);
    if (filters.floorId) params.set("floor_id", filters.floorId);
    if (filters.usageType) params.set("usage_type", filters.usageType);
    if (filters.rentalStatus) params.set("rental_status", filters.rentalStatus);
    if (filters.fittingStatus) params.set("fitting_status", filters.fittingStatus);
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.minArea) params.set("min_area", filters.minArea);
    if (filters.maxArea) params.set("max_area", filters.maxArea);
    const response = await apiRequest<PaginatedResult<UnitRow>>(`/park-units?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadLookups = useCallback(async () => {
    const [buildingResponse, floorResponse, dictTypeResponse] = await Promise.all([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100&sort=sortNo", { token: getAccessToken() }),
      apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=100&sort=floorNo", { token: getAccessToken() }),
      apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() })
    ]);
    setBuildings(buildingResponse.data.items);
    setFloors(floorResponse.data.items);

    const dictCodes = [
      "unit_usage_type",
      "unit_rental_status",
      "unit_fitting_status",
      "workorder_status",
      "workorder_type",
      "workorder_priority",
      "safety_hazard_status",
      "safety_hazard_type",
      "safety_risk_level",
      "safety_hazard_source_type"
    ];
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const dictEntries = await Promise.all(
      dictCodes.map(async (code) => {
        const dictTypeId = dictTypeMap.get(code);
        if (!dictTypeId) {
          return [code, []] as const;
        }
        const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
          token: getAccessToken()
        });
        return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
      })
    );
    setDicts(Object.fromEntries(dictEntries));
  }, []);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void loadLookups().catch((error: Error) => setMessage(error.message));
  }, [loadLookups]);

  function openCreate() {
    const defaultBuildingId = filters.buildingId || buildings[0]?.id || "";
    const defaultFloorId = filters.floorId || floors.find((floor) => floor.buildingId === defaultBuildingId)?.id || "";
    setEditingId(null);
    setForm({ ...emptyForm, buildingId: defaultBuildingId, floorId: defaultFloorId });
    setShowForm(true);
    setMessage("");
  }

  function openEdit(row: UnitRow) {
    setEditingId(row.id);
    setForm({
      unitCode: row.unitCode,
      buildingId: row.buildingId,
      floorId: row.floorId,
      unitName: row.unitName,
      usageType: String(row.usageType),
      unitArea: row.unitArea,
      useArea: row.useArea,
      rentalStatus: String(row.rentalStatus),
      fittingStatus: String(row.fittingStatus),
      refPrice: canEditRefPrice ? String(row.refPrice ?? "0") : "0",
      availableDate: row.availableDate ?? "",
      status: row.status,
      remark: canEditRemark ? row.remark ?? "" : ""
    });
    setShowForm(true);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      unitCode: form.unitCode.trim(),
      buildingId: form.buildingId,
      floorId: form.floorId,
      unitName: form.unitName.trim(),
      usageType: Number(form.usageType),
      unitArea: Number(form.unitArea || 0),
      useArea: Number(form.useArea || 0),
      rentalStatus: Number(form.rentalStatus),
      fittingStatus: Number(form.fittingStatus),
      availableDate: form.availableDate || undefined,
      status: form.status
    };
    if (canEditRefPrice) {
      body.refPrice = Number(form.refPrice || 0);
    }
    if (canEditRemark) {
      body.remark = form.remark.trim();
    }
    await apiRequest<UnitRow>(editingId ? `/park-units/${editingId}` : "/park-units", {
      method: editingId ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingId ? "unit-update" : "unit-create"),
      body
    });
    setShowForm(false);
    setEditingId(null);
    setMessage("保存成功");
    await load(pageData.page);
  }

  async function remove(row: UnitRow) {
    if (!window.confirm(`确认删除房源「${row.unitName}」？删除后仅做软删除，可保留追溯记录。`)) {
      return;
    }
    await apiRequest<{ id: string }>(`/park-units/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("unit-delete")
    });
    setMessage("删除成功");
    await load(pageData.page);
  }

  async function downloadTemplate() {
    await downloadFile("/park-units/import-template", "房源导入模板.xlsx");
  }

  async function exportUnits() {
    await downloadPostFile("/park-units/export", `金湖房源台账_${formatYmd(new Date())}.xlsx`, {
      ...(filters.buildingId ? { building_id: filters.buildingId } : {}),
      ...(filters.floorId ? { floor_id: filters.floorId } : {}),
      ...(filters.usageType ? { usage_type: Number(filters.usageType) } : {}),
      ...(filters.rentalStatus ? { rental_status: Number(filters.rentalStatus) } : {}),
      ...(filters.fittingStatus ? { fitting_status: Number(filters.fittingStatus) } : {}),
      ...(filters.keyword.trim() ? { keyword: filters.keyword.trim() } : {}),
      ...(filters.minArea ? { min_area: Number(filters.minArea) } : {}),
      ...(filters.maxArea ? { max_area: Number(filters.maxArea) } : {})
    });
  }

  async function importUnits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) {
      setMessage("请选择 Excel 文件");
      return;
    }
    const formData = new FormData();
    formData.set("file", importFile);
    const response = await apiFormRequest<ImportResult>("/park-units/import", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("unit-import"),
      body: formData
    });
    const result = response.data;
    setImportResult(result);
    setMessage(`导入完成：成功 ${result.success_count}，失败 ${result.fail_count}`);
    await load(1);
  }

  async function openStatusPanel(row: UnitRow, mode: UnitStatusPanelMode) {
    setTransitionTarget(row);
    setTransitionPanelMode(mode);
    const options = getTransitionOptions(row.rentalStatus, dicts.unit_rental_status, canForceChangeStatus);
    setTransitionStatus(options[0]?.itemValue ?? "");
    setTransitionReason("");
    setTransitionLockReason("");
    setTransitionLockExpireTime("");
    setStatusLogPage(emptyStatusLogPage);
    if (canReadStatusLog) {
      await loadStatusLogs(row.id, 1);
    }
  }

  async function openTransition(row: UnitRow) {
    await openStatusPanel(row, "change");
  }

  async function openStatusLogs(row: UnitRow) {
    await openStatusPanel(row, "logs");
  }

  async function loadStatusLogs(unitId: string, page = 1) {
    const response = await apiRequest<PaginatedResult<UnitStatusLogRow>>(`/park-units/${unitId}/status-logs?page=${page}&page_size=20`, {
      token: getAccessToken()
    });
    setStatusLogPage(response.data);
  }

  async function submitTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transitionTarget) {
      return;
    }
    if (!transitionReason.trim()) {
      setMessage("请填写流转原因");
      return;
    }
    const response = await apiRequest<{ id: string; unit_code: string; before_status: number; after_status: number; status_update_time: string }>(`/park-units/${transitionTarget.id}/change-status`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("unit-change-status"),
      body: {
        after_status: Number(transitionStatus),
        reason: transitionReason.trim(),
        lock_reason: Number(transitionStatus) === 20 ? transitionLockReason.trim() || undefined : undefined,
        lock_expire_time: Number(transitionStatus) === 20 ? transitionLockExpireTime || undefined : undefined
      }
    });
    const afterStatus = response.data.after_status;
    const lockReason = afterStatus === 20 ? transitionLockReason.trim() || null : null;
    const lockExpireTime = afterStatus === 20 && transitionLockExpireTime ? new Date(transitionLockExpireTime).toISOString() : null;
    setMessage("状态流转成功");
    await load(pageData.page);
    setTransitionTarget({
      ...transitionTarget,
      rentalStatus: afterStatus,
      lockReason,
      lockExpireTime,
      statusUpdateTime: response.data.status_update_time
    });
    setDetail((current) => current?.id === transitionTarget.id
      ? { ...current, rentalStatus: afterStatus, lockReason, lockExpireTime, statusUpdateTime: response.data.status_update_time }
      : current);
    if (canReadStatusLog) {
      await loadStatusLogs(transitionTarget.id, 1);
    }
  }

  function handleUploaded(_file: FileRecord) {
    setRefreshKey((value) => value + 1);
    void load(pageData.page).catch((error: Error) => setMessage(error.message));
  }

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "buildingId" ? { floorId: "" } : {})
    }));
  }

  function updateFormBuilding(buildingId: string) {
    const firstFloorId = floors.find((floor) => floor.buildingId === buildingId)?.id ?? "";
    setForm((current) => ({ ...current, buildingId, floorId: firstFloorId }));
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.UNIT_READ} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>{title}</strong>
            <span>维护招商、合同、应收、工单、安全隐患共用的空间主数据</span>
          </div>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.UNIT_CREATE} type="button" onClick={openCreate}>
            <Plus size={16} />
            新增房源
          </PermissionButton>
          <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_IMPORT_TEMPLATE} type="button" onClick={() => void downloadTemplate().catch((error: Error) => setMessage(error.message))}>
            <FileDown size={16} />
            下载模板
          </PermissionButton>
          <PermissionButton
            permission={SYSTEM_PERMISSIONS.UNIT_IMPORT}
            type="button"
            onClick={() => {
              setImportFile(null);
              setImportResult(null);
              setShowImport(true);
            }}
          >
            <FileUp size={16} />
            批量导入
          </PermissionButton>
          <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_EXPORT} type="button" onClick={() => void exportUnits().catch((error: Error) => setMessage(error.message))}>
            <Download size={16} />
            导出
          </PermissionButton>
        </header>

        <Card >
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <SelectField label="楼栋" value={filters.buildingId} onChange={(value) => updateFilter("buildingId", value)}>
                <option value="">全部楼栋</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                ))}
              </SelectField>
              <SelectField label="楼层" value={filters.floorId} onChange={(value) => updateFilter("floorId", value)}>
                <option value="">全部楼层</option>
                {visibleFloors.map((floor) => (
                  <option key={floor.id} value={floor.id}>{floor.floorCode} {floor.floorName}</option>
                ))}
              </SelectField>
              <DictSelect label="用途" value={filters.usageType} items={dicts.unit_usage_type} onChange={(value) => updateFilter("usageType", value)} />
              <DictSelect label="出租状态" value={filters.rentalStatus} items={dicts.unit_rental_status} onChange={(value) => updateFilter("rentalStatus", value)} />
              <DictSelect label="装修状态" value={filters.fittingStatus} items={dicts.unit_fitting_status} onChange={(value) => updateFilter("fittingStatus", value)} />
              <TextField label="关键词" value={filters.keyword} placeholder="房源编码或名称" onChange={(value) => updateFilter("keyword", value)} />
              <NumberField label="最小面积" value={filters.minArea} step="0.01" onChange={(value) => updateFilter("minArea", value)} />
              <NumberField label="最大面积" value={filters.maxArea} step="0.01" onChange={(value) => updateFilter("maxArea", value)} />
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
                <th>房源编码</th>
                <th>房源名称</th>
                <th>楼栋</th>
                <th>楼层</th>
                <th>用途</th>
                <th>建筑面积</th>
                <th>使用面积</th>
                <th>出租状态</th>
                <th>装修状态</th>
                <th>参考租金</th>
                <th>可租日期</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.unitCode}</td>
                  <td>{row.unitName}</td>
                  <td>{row.building ? `${row.building.buildingCode} ${row.building.buildingName}` : "-"}</td>
                  <td>{row.floor ? `${row.floor.floorCode} ${row.floor.floorName}` : "-"}</td>
                  <td>{dictLabel(dicts.unit_usage_type, row.usageType)}</td>
                  <td>{formatArea(row.unitArea)}</td>
                  <td>{formatArea(row.useArea)}</td>
                  <td><DictBadge items={dicts.unit_rental_status} value={row.rentalStatus} /></td>
                  <td><DictBadge items={dicts.unit_fitting_status} value={row.fittingStatus} /></td>
                  <td>{canViewRefPrice ? formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, row.refPrice)) : "-"}</td>
                  <td>{row.availableDate ?? "-"}</td>
                  <td>{formatDateTime(row.updateTime)}</td>
                  <td>
                    <span className="data-table-actions">
                      <button title="详情" type="button" onClick={() => setDetail(row)}><Eye size={16} /></button>
                      <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_UPDATE} title="编辑" type="button" onClick={() => openEdit(row)}>
                        <Edit3 size={16} />
                      </PermissionButton>
                      {canEditPhotoUrls ? (
                        <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_UPDATE} title="附件" type="button" onClick={() => setAttachmentTarget({ unit: row, mode: "photos" })}>
                          <FileImage size={16} />
                        </PermissionButton>
                      ) : null}
                      <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_CHANGE_STATUS} title="状态流转" type="button" onClick={() => void openTransition(row).catch((error: Error) => setMessage(error.message))}>
                        <RefreshCw size={16} />
                      </PermissionButton>
                      <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_STATUS_LOG} title="状态日志" type="button" onClick={() => void openStatusLogs(row).catch((error: Error) => setMessage(error.message))}>
                        <History size={16} />
                      </PermissionButton>
                      <PermissionButton permission={SYSTEM_PERMISSIONS.UNIT_DELETE} title="删除" type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                        <Trash2 size={16} />
                      </PermissionButton>
                    </span>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={13}>暂无房源数据</td>
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
          <Drawer size="lg" onClose={() => setShowForm(false)}>
            <div className="task-item">
              <h2 className="panel-title">{editingId ? "编辑房源" : "新增房源"}</h2>
              <button type="button" title="关闭" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form className="form-stack" onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
              <SelectField label="所属楼栋" value={form.buildingId} required onChange={updateFormBuilding}>
                <option value="">请选择楼栋</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.buildingCode} {building.buildingName}</option>
                ))}
              </SelectField>
              <SelectField label="所属楼层" value={form.floorId} required onChange={(value) => setForm((current) => ({ ...current, floorId: value }))}>
                <option value="">请选择楼层</option>
                {formFloors.map((floor) => (
                  <option key={floor.id} value={floor.id}>{floor.floorCode} {floor.floorName}</option>
                ))}
              </SelectField>
              <TextField label="房源编码" value={form.unitCode} required placeholder="请输入或生成房源编码" onChange={(value) => setForm((current) => ({ ...current, unitCode: value }))} />
              <TextField label="房源名称" value={form.unitName} required onChange={(value) => setForm((current) => ({ ...current, unitName: value }))} />
              <DictSelect label="用途" value={form.usageType} required items={dicts.unit_usage_type} onChange={(value) => setForm((current) => ({ ...current, usageType: value }))} />
              <NumberField label="建筑面积" value={form.unitArea} required step="0.01" onChange={(value) => setForm((current) => ({ ...current, unitArea: value }))} />
              <NumberField label="使用面积" value={form.useArea} required step="0.01" onChange={(value) => setForm((current) => ({ ...current, useArea: value }))} />
              {editingId ? (
                <DetailItem label="出租状态" value={<DictBadge items={dicts.unit_rental_status} value={Number(form.rentalStatus)} />} />
              ) : (
                <DictSelect label="出租状态" value={form.rentalStatus} required items={dicts.unit_rental_status} onChange={(value) => setForm((current) => ({ ...current, rentalStatus: value }))} />
              )}
              <DictSelect label="装修状态" value={form.fittingStatus} required items={dicts.unit_fitting_status} onChange={(value) => setForm((current) => ({ ...current, fittingStatus: value }))} />
              {canEditRefPrice ? (
                <NumberField label="参考租金" value={form.refPrice} required step="0.01" onChange={(value) => setForm((current) => ({ ...current, refPrice: value }))} />
              ) : canViewRefPrice ? (
                <DetailItem label="参考租金" value={formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, form.refPrice))} />
              ) : null}
              <div className="field">
                <label>可租日期</label>
                <input type="date" value={form.availableDate} onChange={(event) => setForm((current) => ({ ...current, availableDate: event.target.value }))} />
              </div>
              <SelectField label="状态" value={String(form.status)} onChange={(value) => setForm((current) => ({ ...current, status: Number(value) as EnabledStatus }))}>
                <option value="1">启用</option>
                <option value="0">停用</option>
              </SelectField>
              {canEditRemark ? (
                <TextField label="备注" value={form.remark} onChange={(value) => setForm((current) => ({ ...current, remark: value }))} />
              ) : canViewRemark ? (
                <DetailItem label="备注" value={fieldText(maskUnitField(authUser, UNIT_FIELD_REMARK, form.remark))} />
              ) : null}
              <button className="primary-button" type="submit">保存</button>
              <button type="button" onClick={() => setShowForm(false)}>取消</button>
            </form>
          </Drawer>
        ) : null}

        {showImport ? (
          <Drawer size="md" onClose={() => setShowImport(false)}>
            <div className="task-item">
              <h2 className="panel-title">房源批量导入</h2>
              <button type="button" title="关闭" onClick={() => setShowImport(false)}><X size={16} /></button>
            </div>
            <form className="form-stack" onSubmit={(event) => void importUnits(event).catch((error: Error) => setMessage(error.message))}>
              <div className="field">
                <label>Excel 文件</label>
                <input
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  required
                  type="file"
                  onChange={(event) => {
                    setImportFile(event.target.files?.[0] ?? null);
                    setImportResult(null);
                  }}
                />
              </div>
              <button className="primary-button" type="submit">开始导入</button>
              <button type="button" onClick={() => void downloadTemplate().catch((error: Error) => setMessage(error.message))}>下载模板</button>
            </form>
            {importResult ? (
              <Card >
                <div className="task-item">
                  <span>导入结果</span>
                  <strong>总计 {importResult.total}，成功 {importResult.success_count}，失败 {importResult.fail_count}</strong>
                </div>
                <DataTable >
                  <thead>
                    <tr><th>行号</th><th>房源编码</th><th>错误原因</th></tr>
                  </thead>
                  <tbody>
                    {importResult.rows.filter((row) => !row.success).map((row) => (
                      <tr key={row.row_no}>
                        <td>{row.row_no}</td>
                        <td>{row.unit_code || "-"}</td>
                        <td>{row.errors.join("；")}</td>
                      </tr>
                    ))}
                    {importResult.rows.every((row) => row.success) ? <tr><td colSpan={3}>全部导入成功</td></tr> : null}
                  </tbody>
                </DataTable>
              </Card>
            ) : null}
          </Drawer>
        ) : null}

        {detail ? (
          <UnitDetailDrawer
            unit={detail}
            dicts={dicts}
            onClose={() => setDetail(null)}
            onOpenAttachments={(mode) => setAttachmentTarget({ unit: detail, mode })}
            onOpenTransition={() => void openTransition(detail).catch((error: Error) => setMessage(error.message))}
            onOpenStatusLogs={() => void openStatusLogs(detail).catch((error: Error) => setMessage(error.message))}
          />
        ) : null}

        {attachmentTarget ? (
          <Drawer size="md" onClose={() => setAttachmentTarget(null)}>
            <div className="task-item">
              <h2 className="panel-title">{attachmentTarget.unit.unitName} {attachmentTarget.mode === "photos" ? "照片" : "平面图"}</h2>
              <button type="button" title="关闭" onClick={() => setAttachmentTarget(null)}><X size={16} /></button>
            </div>
            <PermissionGuard permission={SYSTEM_PERMISSIONS.UNIT_UPDATE}>
              <FileUploader
                bizType={attachmentTarget.mode === "photos" ? "unit_photo" : "unit_floorplan"}
                bizId={attachmentTarget.unit.id}
                uploadPath={`/park-units/${attachmentTarget.unit.id}/${attachmentTarget.mode}`}
                onUploaded={handleUploaded}
              />
            </PermissionGuard>
            <AttachmentList
              bizType={attachmentTarget.mode === "photos" ? "unit_photo" : "unit_floorplan"}
              bizId={attachmentTarget.unit.id}
              refreshKey={refreshKey}
            />
          </Drawer>
        ) : null}

        {transitionTarget ? (
          <Drawer size="md" onClose={() => setTransitionTarget(null)}>
            <div className="task-item">
              <h2 className="panel-title">{transitionTarget.unitName} {transitionPanelMode === "change" ? "状态流转" : "状态日志"}</h2>
              <button type="button" title="关闭" onClick={() => setTransitionTarget(null)}><X size={16} /></button>
            </div>
            <div className="task-item">
              <span>当前状态</span>
              <strong><DictBadge items={dicts.unit_rental_status} value={transitionTarget.rentalStatus} /></strong>
            </div>
            {canChangeStatus && transitionPanelMode === "change" ? (
              <form className="form-stack" onSubmit={(event) => void submitTransition(event).catch((error: Error) => setMessage(error.message))}>
                <DictSelect
                  label="目标状态"
                  value={transitionStatus}
                  required
                  items={getTransitionOptions(transitionTarget.rentalStatus, dicts.unit_rental_status, canForceChangeStatus)}
                  onChange={setTransitionStatus}
                />
                <TextField label="流转原因" value={transitionReason} required onChange={setTransitionReason} />
                {Number(transitionStatus) === 20 ? (
                  <>
                    <TextField label="锁定原因" value={transitionLockReason} onChange={setTransitionLockReason} />
                    <div className="field">
                      <label>锁定到期时间</label>
                      <input type="datetime-local" value={transitionLockExpireTime} onChange={(event) => setTransitionLockExpireTime(event.target.value)} />
                    </div>
                  </>
                ) : null}
                <button className="primary-button" type="submit" disabled={!transitionStatus}>确认流转</button>
              </form>
            ) : null}
            <PermissionGuard permission={SYSTEM_PERMISSIONS.UNIT_STATUS_LOG}>
              <Card >
                <h3 className="panel-title">状态日志</h3>
                <DataTable >
                  <thead><tr><th>原状态</th><th>新状态</th><th>原因</th><th>来源</th><th>操作人</th><th>时间</th></tr></thead>
                  <tbody>
                    {statusLogPage.items.map((log) => (
                      <tr key={log.id}>
                        <td>{dictLabel(dicts.unit_rental_status, log.beforeStatus)}</td>
                        <td>{dictLabel(dicts.unit_rental_status, log.afterStatus)}</td>
                        <td>{log.reason || "-"}</td>
                        <td>{log.sourceType}</td>
                        <td>{log.operatorName ?? log.createBy ?? "-"}</td>
                        <td>{formatDateTime(log.opTime ?? log.createTime)}</td>
                      </tr>
                    ))}
                    {statusLogPage.items.length === 0 ? <tr><td colSpan={6}>暂无状态日志</td></tr> : null}
                  </tbody>
                </DataTable>
                <div className="task-item">
                  <span>共 {statusLogPage.total} 条，第 {statusLogPage.page} / {Math.max(1, Math.ceil(statusLogPage.total / statusLogPage.page_size))} 页</span>
                  <span>
                    <button type="button" disabled={statusLogPage.page <= 1} onClick={() => void loadStatusLogs(transitionTarget.id, Math.max(1, statusLogPage.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
                    <button
                      type="button"
                      disabled={statusLogPage.page >= Math.max(1, Math.ceil(statusLogPage.total / statusLogPage.page_size))}
                      onClick={() => void loadStatusLogs(transitionTarget.id, statusLogPage.page + 1).catch((error: Error) => setMessage(error.message))}
                    >
                      下一页
                    </button>
                  </span>
                </div>
              </Card>
            </PermissionGuard>
          </Drawer>
        ) : null}

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function UnitDetailDrawer({
  unit,
  dicts,
  onClose,
  onOpenAttachments,
  onOpenTransition,
  onOpenStatusLogs
}: {
  unit: UnitRow;
  dicts: Record<string, DictItemRow[]>;
  onClose: () => void;
  onOpenAttachments: (mode: UnitAttachmentMode) => void;
  onOpenTransition: () => void;
  onOpenStatusLogs: () => void;
}) {
  const authUser = useAuthUser();
  const [activeTab, setActiveTab] = useState<"info" | "workorders" | "hazards">("info");
  const [workorders, setWorkorders] = useState<UnitWorkOrdersResponse | null>(null);
  const [workordersLoading, setWorkordersLoading] = useState(false);
  const [workordersError, setWorkordersError] = useState("");
  const [hazards, setHazards] = useState<UnitHazardsResponse | null>(null);
  const [hazardsLoading, setHazardsLoading] = useState(false);
  const [hazardsError, setHazardsError] = useState("");
  const canViewRefPrice = canViewField(authUser, "asset", "unit", UNIT_FIELD_REF_PRICE);
  const canViewRemark = canViewField(authUser, "asset", "unit", UNIT_FIELD_REMARK);
  const canViewPhotoUrls = canViewField(authUser, "asset", "unit", UNIT_FIELD_PHOTO_URLS);
  const canViewWorkOrderReporterMobile = canViewField(authUser, "workorder", "work_order", "reporterMobile");

  useEffect(() => {
    setActiveTab("info");
    setWorkorders(null);
    setWorkordersError("");
    setHazards(null);
    setHazardsError("");
  }, [unit.id]);

  useEffect(() => {
    if (activeTab !== "workorders" || workorders) {
      return;
    }
    setWorkordersLoading(true);
    setWorkordersError("");
    void apiRequest<UnitWorkOrdersResponse>(`/park-units/${unit.id}/workorders`, { token: getAccessToken() })
      .then((response) => setWorkorders(response.data))
      .catch((error: Error) => setWorkordersError(error.message))
      .finally(() => setWorkordersLoading(false));
  }, [activeTab, unit.id, workorders]);

  useEffect(() => {
    if (activeTab !== "hazards" || hazards) {
      return;
    }
    setHazardsLoading(true);
    setHazardsError("");
    void apiRequest<UnitHazardsResponse>(`/park-units/${unit.id}/hazards`, { token: getAccessToken() })
      .then((response) => setHazards(response.data))
      .catch((error: Error) => setHazardsError(error.message))
      .finally(() => setHazardsLoading(false));
  }, [activeTab, unit.id, hazards]);

  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="房源详情"
        title={unit.unitName}
        description={`${unit.unitCode} · ${unit.building ? unit.building.buildingName : "未关联楼栋"} · ${unit.floor ? unit.floor.floorName : "未关联楼层"}`}
        onClose={onClose}
        closeIcon={<X size={18} />}
      />
      <DrawerActions>
        <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.UNIT_CHANGE_STATUS} type="button" onClick={onOpenTransition}>
          <RefreshCw size={14} />状态流转
        </PermissionButton>
        <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.UNIT_STATUS_LOG} type="button" onClick={onOpenStatusLogs}>
          <History size={14} />状态日志
        </PermissionButton>
        {canViewPhotoUrls ? <button className="drawer-action-button" type="button" onClick={() => onOpenAttachments("photos")}>查看照片</button> : null}
        <button className="drawer-action-button" type="button" onClick={() => onOpenAttachments("floorplan")}>查看平面图</button>
      </DrawerActions>
      <div className="system-tabs">
        <button className={activeTab === "info" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("info")}>基础信息</button>
        <button className={activeTab === "workorders" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("workorders")}>关联工单</button>
        <button className={activeTab === "hazards" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("hazards")}>安全隐患</button>
      </div>
      {activeTab === "info" ? (
        <DrawerDetailGrid>
          <DrawerDetailItem label="房源编码" value={unit.unitCode} />
          <DrawerDetailItem label="房源名称" value={unit.unitName} />
          <DrawerDetailItem label="楼栋" value={unit.building ? `${unit.building.buildingCode} ${unit.building.buildingName}` : "-"} />
          <DrawerDetailItem label="楼层" value={unit.floor ? `${unit.floor.floorCode} ${unit.floor.floorName}` : "-"} />
          <DrawerDetailItem label="用途" value={dictLabel(dicts.unit_usage_type, unit.usageType)} />
          <DrawerDetailItem label="建筑面积" value={formatArea(unit.unitArea)} />
          <DrawerDetailItem label="使用面积" value={formatArea(unit.useArea)} />
          <DrawerDetailItem label="出租状态" value={<DictBadge items={dicts.unit_rental_status} value={unit.rentalStatus} />} />
          <DrawerDetailItem label="状态更新时间" value={unit.statusUpdateTime ? formatDateTime(unit.statusUpdateTime) : "-"} />
          <DrawerDetailItem label="锁定原因" value={unit.lockReason ?? "-"} />
          <DrawerDetailItem label="锁定到期" value={unit.lockExpireTime ? formatDateTime(unit.lockExpireTime) : "-"} />
          <DrawerDetailItem label="装修状态" value={<DictBadge items={dicts.unit_fitting_status} value={unit.fittingStatus} />} />
          {canViewRefPrice ? <DrawerDetailItem label="参考租金" value={formatMoney(maskUnitField(authUser, UNIT_FIELD_REF_PRICE, unit.refPrice))} /> : null}
          <DrawerDetailItem label="可租日期" value={unit.availableDate ?? "-"} />
          <DrawerDetailItem label="状态" value={<StatusBadge status={unit.status} />} />
          {canViewRemark ? <DrawerDetailItem label="备注" value={fieldText(maskUnitField(authUser, UNIT_FIELD_REMARK, unit.remark))} /> : null}
        </DrawerDetailGrid>
      ) : null}
      {activeTab === "workorders" ? (
        <UnitWorkordersPanel
          data={workorders}
          loading={workordersLoading}
          error={workordersError}
          dicts={dicts}
          authUser={authUser}
          canViewReporterMobile={canViewWorkOrderReporterMobile}
        />
      ) : null}
      {activeTab === "hazards" ? (
        <UnitHazardsPanel
          data={hazards}
          loading={hazardsLoading}
          error={hazardsError}
          dicts={dicts}
        />
      ) : null}
      <DrawerFooter>
        <button type="button" onClick={onClose}>关闭</button>
      </DrawerFooter>
    </Drawer>
  );
}

function UnitWorkordersPanel({
  data,
  loading,
  error,
  dicts,
  authUser,
  canViewReporterMobile
}: {
  data: UnitWorkOrdersResponse | null;
  loading: boolean;
  error: string;
  dicts: Record<string, DictItemRow[]>;
  authUser: UserContext | null;
  canViewReporterMobile: boolean;
}) {
  if (loading) {
    return <p className="muted-text">正在加载工单数据...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>工单总数</span></Card>
        <Card><strong>{data?.summary.open_count ?? 0}</strong><span>未闭环</span></Card>
        <Card><strong>{data?.summary.overdue_count ?? 0}</strong><span>超时</span></Card>
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>工单编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>优先级</th>
            <th>状态</th>
            <th>报告人</th>
            <th>处理人</th>
            <th>超时</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.wo_code}</td>
              <td>{row.title}</td>
              <td>{dictLabelText(dicts.workorder_type, row.wo_type)}</td>
              <td><StringDictBadge items={dicts.workorder_priority} value={row.priority} /></td>
              <td><StringDictBadge items={dicts.workorder_status} value={row.status} /></td>
              <td>
                {fieldText(row.reporter_name)}
                {canViewReporterMobile ? ` / ${fieldText(maskField(authUser, "workorder", "work_order", "reporterMobile", row.reporter_mobile))}` : ""}
              </td>
              <td>{fieldText(row.assignee_name)}</td>
              <td><span className={`status-pill ${row.overdue_flag ? "status-danger" : "status-success"}`}>{row.overdue_flag ? "超时" : "正常"}</span></td>
              <td>
                <button type="button" onClick={() => { window.location.href = `/workorders/${row.id}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={9}>暂无关联工单</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function UnitHazardsPanel({
  data,
  loading,
  error,
  dicts
}: {
  data: UnitHazardsResponse | null;
  loading: boolean;
  error: string;
  dicts: Record<string, DictItemRow[]>;
}) {
  if (loading) {
    return <p className="muted-text">正在加载隐患数据...</p>;
  }
  if (error) {
    return <p className="status-pill status-warning">{error}</p>;
  }
  const items = data?.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <Card><strong>{data?.summary.total_count ?? 0}</strong><span>隐患总数</span></Card>
        <Card><strong>{data?.summary.open_count ?? 0}</strong><span>未闭环</span></Card>
        <Card><strong>{data?.summary.overdue_count ?? 0}</strong><span>超期</span></Card>
        <Card><strong>{data?.summary.major_count ?? 0}</strong><span>重大隐患</span></Card>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>隐患编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>风险</th>
            <th>状态</th>
            <th>位置</th>
            <th>整改人</th>
            <th>超期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.hazard_code}</td>
              <td>{row.title}</td>
              <td>{dictLabelText(dicts.safety_hazard_type, row.hazard_type)}</td>
              <td><StringDictBadge items={dicts.safety_risk_level} value={row.risk_level} /></td>
              <td><StringDictBadge items={dicts.safety_hazard_status} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.rectify_user_name)}</td>
              <td><span className={`status-pill ${row.overdue_flag ? "status-danger" : "status-success"}`}>{row.overdue_flag ? "超期" : "正常"}</span></td>
              <td>
                <button type="button" onClick={() => { window.location.href = `/safety/hazards?hazard_id=${encodeURIComponent(row.id)}`; }}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={9}>暂无关联隐患</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
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

function SelectField({
  label,
  value,
  required,
  onChange,
  children
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

function DictSelect({
  label,
  value,
  required,
  items = [],
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  items?: DictItemRow[];
  onChange: (value: string) => void;
}) {
  return (
    <SelectField label={label} value={value} required={required} onChange={onChange}>
      <option value="">{required ? "请选择" : "全部"}</option>
      {items.map((item) => (
        <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
      ))}
    </SelectField>
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

function DictBadge({ items = [], value }: { items?: DictItemRow[]; value: number }) {
  const item = items.find((option) => Number(option.itemValue) === value);
  return <span className="status-pill">{item?.itemLabel ?? value}</span>;
}

function StringDictBadge({ items = [], value }: { items?: DictItemRow[]; value: string | null }) {
  const item = items.find((option) => option.itemValue === value);
  return <span className={`status-pill ${dictStatusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function StatusBadge({ status }: { status: EnabledStatus }) {
  const option = status === 1
    ? { label: "启用", className: "status-success" }
    : { label: "停用", className: "status-danger" };
  return <span className={`status-pill ${option.className}`}>{option.label}</span>;
}

function dictLabel(items: DictItemRow[] | undefined, value: number): string {
  return items?.find((item) => Number(item.itemValue) === value)?.itemLabel ?? String(value);
}

function dictLabelText(items: DictItemRow[] | undefined, value: string | null): string {
  return items?.find((item) => item.itemValue === value)?.itemLabel ?? value ?? "-";
}

function dictStatusClass(tagType?: string | null): string {
  if (tagType === "success" || tagType === "warning" || tagType === "danger" || tagType === "primary" || tagType === "info") {
    return `status-${tagType}`;
  }
  return "status-muted";
}

function getTransitionOptions(currentStatus: number, items: DictItemRow[] | undefined, canForceChangeStatus: boolean): DictItemRow[] {
  const allowedValues = new Set(ALLOWED_RENTAL_STATUS_TARGETS.get(currentStatus) ?? []);
  if (currentStatus === 30 && canForceChangeStatus) {
    allowedValues.add(10);
  }
  return (items ?? []).filter((item) => allowedValues.has(Number(item.itemValue)));
}

function formatArea(value: string): string {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ㎡` : String(value || "-");
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 元` : String(value);
}

function maskUnitField(user: UserContext | null, fieldKey: string, value: unknown): unknown {
  return maskField(user, "asset", "unit", fieldKey, value);
}

function fieldText(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function downloadFile(path: string, filename: string) {
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`
    }
  });
  if (!response.ok) {
    throw new Error("文件下载失败");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadPostFile(path: string, filename: string, body: Record<string, unknown>) {
  const response = await fetch(`${API_PREFIX}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Idempotency-Key": createIdempotencyKey("unit-export"),
      Authorization: `Bearer ${getAccessToken()}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "文件下载失败");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatYmd(value: Date): string {
  return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`;
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card >
        <h1 className="panel-title">403</h1>
        <p>当前账号没有房源管理访问权限。</p>
      </Card>
    </main>
  );
}
