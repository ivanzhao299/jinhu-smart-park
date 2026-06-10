"use client";
import { Card, DataTable, Drawer } from "@jinhu/ui";

import { Download, FileDown, FileUp, Plus, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { API_PREFIX, apiFormRequest, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField } from "../../../lib/field-policy";
import { hasPermission } from "../../../lib/permissions";
import { UnitFormDialog } from "./components/UnitFormDialog";
import { UnitAttachmentsPanel } from "./components/UnitAttachmentsPanel";
import { UnitDetailDrawer, type UnitDetailTab } from "./components/UnitDetailDrawer";
import { DictBadge, DictSelect, TextField } from "./components/UnitPageFields";
import { UnitsTable } from "./components/UnitsTable";
import { UnitsToolbar } from "./components/UnitsToolbar";
import {
  dictLabel,
  formatDateTime,
  formatYmd,
  getTransitionOptions,
  UNIT_FIELD_PHOTO_URLS,
  UNIT_FIELD_REF_PRICE,
  UNIT_FIELD_REMARK
} from "./lib/unit-page-utils";

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

interface UnitEmergencyRow {
  id: string;
  emergency_code: string;
  title: string;
  incident_type: string;
  severity_level: string;
  response_level: string | null;
  status: string;
  location: string;
  reporter_name: string | null;
  report_time: string;
  update_time: string;
}

interface UnitEmergenciesResponse {
  summary: {
    total_count: number;
    open_count: number;
    closed_count: number;
    major_count: number;
  };
  recent_items: UnitEmergencyRow[];
}

interface UnitWorkPermitRow {
  id: string;
  permit_code: string;
  permit_type: string;
  risk_level: string;
  status: string;
  location: string;
  apply_user_name: string | null;
  contractor_name: string | null;
  monitor_user_name: string | null;
  time_start: string;
  time_end: string;
  violation_count: number;
  update_time: string;
}

interface UnitWorkPermitsResponse {
  summary: {
    total_count: number;
    in_progress_count: number;
    violation_count: number;
    closed_count: number;
  };
  recent_items: UnitWorkPermitRow[];
}

interface UnitIotDeviceRow {
  id: string;
  device_code: string;
  device_name: string;
  device_type: string;
  online_status: string;
  status: string;
  location: string | null;
  last_data_time: string | null;
}

interface UnitIotAlertRow {
  id: string;
  alert_code: string;
  alert_title: string;
  alert_level: string;
  status: string;
  device_id: string;
  device_code: string;
  device_name: string;
  metric_code: string;
  trigger_value: string | null;
  last_trigger_time: string;
}

interface UnitDevicesResponse {
  summary: {
    device_count: number;
    online_count: number;
    offline_count: number;
    active_alert_count: number;
  };
  recent_devices: UnitIotDeviceRow[];
  recent_alerts: UnitIotAlertRow[];
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
      "safety_hazard_source_type",
      "safety_emergency_status",
      "safety_emergency_incident_type",
      "safety_emergency_severity",
      "safety_emergency_response_level",
      "safety_work_permit_status",
      "safety_work_permit_type",
      "iot_device_type",
      "iot_device_status",
      "iot_alert_level",
      "iot_alert_status"
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

        <UnitsToolbar
          filters={filters}
          buildings={buildings}
          visibleFloors={visibleFloors}
          dicts={dicts}
          onFilterChange={updateFilter}
          onSubmit={() => void load(1).catch((error: Error) => setMessage(error.message))}
        />

        <UnitsTable
          pageData={pageData}
          dicts={dicts}
          authUser={authUser}
          canViewRefPrice={canViewRefPrice}
          canEditPhotoUrls={canEditPhotoUrls}
          onView={setDetail}
          onEdit={openEdit}
          onOpenAttachments={(row) => setAttachmentTarget({ unit: row, mode: "photos" })}
          onOpenTransition={(row) => void openTransition(row).catch((error: Error) => setMessage(error.message))}
          onOpenStatusLogs={(row) => void openStatusLogs(row).catch((error: Error) => setMessage(error.message))}
          onRemove={(row) => void remove(row).catch((error: Error) => setMessage(error.message))}
          onPageChange={(page) => void load(page).catch((error: Error) => setMessage(error.message))}
        />

        {showForm ? (
          <UnitFormDialog
            editingId={editingId}
            form={form}
            buildings={buildings}
            formFloors={formFloors}
            dicts={dicts}
            authUser={authUser}
            canEditRefPrice={canEditRefPrice}
            canViewRefPrice={canViewRefPrice}
            canEditRemark={canEditRemark}
            canViewRemark={canViewRemark}
            onClose={() => setShowForm(false)}
            onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}
            onBuildingChange={updateFormBuilding}
            onFormChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))}
          />
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
          <UnitDetailDrawerController
            unit={detail}
            dicts={dicts}
            onClose={() => setDetail(null)}
            onOpenAttachments={(mode) => setAttachmentTarget({ unit: detail, mode })}
            onOpenTransition={() => void openTransition(detail).catch((error: Error) => setMessage(error.message))}
            onOpenStatusLogs={() => void openStatusLogs(detail).catch((error: Error) => setMessage(error.message))}
          />
        ) : null}

        {attachmentTarget ? (
          <UnitAttachmentsPanel
            unit={attachmentTarget.unit}
            mode={attachmentTarget.mode}
            refreshKey={refreshKey}
            onClose={() => setAttachmentTarget(null)}
            onUploaded={handleUploaded}
          />
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

function UnitDetailDrawerController({
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
  const [activeTab, setActiveTab] = useState<UnitDetailTab>("info");
  const [workorders, setWorkorders] = useState<UnitWorkOrdersResponse | null>(null);
  const [workordersLoading, setWorkordersLoading] = useState(false);
  const [workordersError, setWorkordersError] = useState("");
  const [hazards, setHazards] = useState<UnitHazardsResponse | null>(null);
  const [hazardsLoading, setHazardsLoading] = useState(false);
  const [hazardsError, setHazardsError] = useState("");
  const [emergencies, setEmergencies] = useState<UnitEmergenciesResponse | null>(null);
  const [emergenciesLoading, setEmergenciesLoading] = useState(false);
  const [emergenciesError, setEmergenciesError] = useState("");
  const [workPermits, setWorkPermits] = useState<UnitWorkPermitsResponse | null>(null);
  const [workPermitsLoading, setWorkPermitsLoading] = useState(false);
  const [workPermitsError, setWorkPermitsError] = useState("");
  const [devices, setDevices] = useState<UnitDevicesResponse | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");
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
    setEmergencies(null);
    setEmergenciesError("");
    setWorkPermits(null);
    setWorkPermitsError("");
    setDevices(null);
    setDevicesError("");
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

  useEffect(() => {
    if (activeTab !== "emergencies" || emergencies) {
      return;
    }
    setEmergenciesLoading(true);
    setEmergenciesError("");
    void apiRequest<UnitEmergenciesResponse>(`/park-units/${unit.id}/emergencies`, { token: getAccessToken() })
      .then((response) => setEmergencies(response.data))
      .catch((error: Error) => setEmergenciesError(error.message))
      .finally(() => setEmergenciesLoading(false));
  }, [activeTab, unit.id, emergencies]);

  useEffect(() => {
    if (activeTab !== "workPermits" || workPermits) {
      return;
    }
    setWorkPermitsLoading(true);
    setWorkPermitsError("");
    void apiRequest<UnitWorkPermitsResponse>(`/park-units/${unit.id}/work-permits`, { token: getAccessToken() })
      .then((response) => setWorkPermits(response.data))
      .catch((error: Error) => setWorkPermitsError(error.message))
      .finally(() => setWorkPermitsLoading(false));
  }, [activeTab, unit.id, workPermits]);

  useEffect(() => {
    if ((activeTab !== "devices" && activeTab !== "deviceAlerts") || devices) {
      return;
    }
    setDevicesLoading(true);
    setDevicesError("");
    void apiRequest<UnitDevicesResponse>(`/park-units/${unit.id}/devices`, { token: getAccessToken() })
      .then((response) => setDevices(response.data))
      .catch((error: Error) => setDevicesError(error.message))
      .finally(() => setDevicesLoading(false));
  }, [activeTab, unit.id, devices]);

  return (
    <UnitDetailDrawer
      unit={unit}
      dicts={dicts}
      activeTab={activeTab}
      authUser={authUser}
      canViewRefPrice={canViewRefPrice}
      canViewRemark={canViewRemark}
      canViewPhotoUrls={canViewPhotoUrls}
      canViewWorkOrderReporterMobile={canViewWorkOrderReporterMobile}
      workorders={workorders}
      workordersLoading={workordersLoading}
      workordersError={workordersError}
      hazards={hazards}
      hazardsLoading={hazardsLoading}
      hazardsError={hazardsError}
      emergencies={emergencies}
      emergenciesLoading={emergenciesLoading}
      emergenciesError={emergenciesError}
      workPermits={workPermits}
      workPermitsLoading={workPermitsLoading}
      workPermitsError={workPermitsError}
      devices={devices}
      devicesLoading={devicesLoading}
      devicesError={devicesError}
      onTabChange={setActiveTab}
      onClose={onClose}
      onOpenAttachments={onOpenAttachments}
      onOpenTransition={onOpenTransition}
      onOpenStatusLogs={onOpenStatusLogs}
    />
  );
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
