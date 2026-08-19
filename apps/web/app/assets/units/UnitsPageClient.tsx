"use client";
import { Card } from "@jinhu/ui";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult, type UserContext, type UserParkContext } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { API_PREFIX, apiFormRequest, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { loadDictMapByCodes } from "../../../lib/dict-client";
import { getStoredUser, getToken, switchParkContext } from "../../../lib/auth";
import { useAuthSessionActions, useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField } from "../../../lib/field-policy";
import { hasPermission } from "../../../lib/permissions";
import { UnitFormDialog } from "./components/UnitFormDialog";
import { UnitAttachmentsPanel } from "./components/UnitAttachmentsPanel";
import { UnitDetailDrawer, type UnitDetailTab } from "./components/UnitDetailDrawer";
import { UnitImportDrawer } from "./components/UnitImportDrawer";
import { UnitImportExportActions } from "./components/UnitImportExportActions";
import { UnitStatusDrawer } from "./components/UnitStatusDrawer";
import { UnitsTable } from "./components/UnitsTable";
import { UnitsToolbar } from "./components/UnitsToolbar";
import {
  formatYmd,
  getTransitionOptions,
  UNIT_FIELD_PHOTO_URLS,
  UNIT_FIELD_REF_PRICE,
  UNIT_FIELD_REMARK
} from "./lib/unit-page-utils";

type EnabledStatus = 0 | 1;

interface BuildingRow {
  id: string;
  parkId?: string;
  buildingCode: string;
  buildingName: string;
}

interface FloorRow {
  id: string;
  parkId?: string;
  buildingId: string;
  floorCode: string;
  floorName: string;
  floorNo: number;
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
  parkId?: string;
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
  parkId: string;
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
const emptyFilters = {
  buildingId: "",
  floorId: "",
  usageType: "",
  rentalStatus: "",
  fittingStatus: "",
  keyword: "",
  minArea: "",
  maxArea: ""
};

const emptyForm: UnitFormState = {
  parkId: "",
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
  const router = useRouter();
  const authUser = useAuthUser();
  const sessionActions = useAuthSessionActions();
  const [pageData, setPageData] = useState<PaginatedResult<UnitRow>>(emptyPage);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [listParkId, setListParkId] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
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
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [listParkSwitching, setListParkSwitching] = useState(false);
  const [formParkSwitching, setFormParkSwitching] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const unitSubmitLock = useRef(false);
  const listParkSwitchLock = useRef(false);
  const formParkSwitchLock = useRef(false);
  const scopedDataGeneration = useRef(0);
  const storedUser = authUser ?? getStoredUser();
  const accessibleParks = useMemo(() => enabledParks(storedUser?.accessible_parks, storedUser?.park_id, storedUser?.park_name), [storedUser?.accessible_parks, storedUser?.park_id, storedUser?.park_name]);
  const effectiveParkId = listParkId || storedUser?.park_id || "";
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

  const load = useCallback(async (page = 1, override?: Partial<typeof filters>) => {
    const generation = scopedDataGeneration.current;
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-updateTime" });
    const query = { ...filters, ...override };
    if (query.buildingId) params.set("building_id", query.buildingId);
    if (query.floorId) params.set("floor_id", query.floorId);
    if (query.usageType) params.set("usage_type", query.usageType);
    if (query.rentalStatus) params.set("rental_status", query.rentalStatus);
    if (query.fittingStatus) params.set("fitting_status", query.fittingStatus);
    if (query.keyword.trim()) params.set("keyword", query.keyword.trim());
    if (query.minArea) params.set("min_area", query.minArea);
    if (query.maxArea) params.set("max_area", query.maxArea);
    const response = await apiRequest<PaginatedResult<UnitRow>>(`/park-units?${params.toString()}`, {
      token: getAccessToken()
    });
    if (generation === scopedDataGeneration.current) setPageData(response.data);
  }, [filters]);

  const loadLookups = useCallback(async () => {
    const generation = scopedDataGeneration.current;
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
    const [buildingResponse, floorResponse, dictMap] = await Promise.all([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100&sort=sortNo", { token: getAccessToken() }),
      apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=100&sort=floorNo", { token: getAccessToken() }),
      loadDictMapByCodes<DictItemRow>(dictCodes)
    ]);
    if (generation === scopedDataGeneration.current) {
      setBuildings(buildingResponse.data.items);
      setFloors(floorResponse.data.items);
      setDicts(dictMap);
    }
  }, []);

  const handleSwitchError = useCallback((error: Error, publish: (message: string) => void) => {
    publish(error.message);
    if (!getToken()) router.replace("/login");
  }, [router]);

  const resetFilters = useCallback(() => {
    setFilters(emptyFilters);
  }, []);

  const ensureParkContext = useCallback(async (targetParkId: string, options: { publishSession?: boolean } = {}) => {
    const publishSession = options.publishSession ?? true;
    const currentUser = getStoredUser() ?? authUser;
    if (!targetParkId) throw new Error("请选择所属园区");
    if (!accessibleParks.some((park) => park.park_id === targetParkId)) throw new Error("当前账号无法访问所选园区");
    if (currentUser?.park_id === targetParkId) {
      if (publishSession && authUser?.park_id !== targetParkId) sessionActions?.publishUser(currentUser);
      return currentUser;
    }
    const nextUser = await switchParkContext(targetParkId);
    if (publishSession) sessionActions?.publishUser(nextUser);
    setListParkId(nextUser.park_id);
    return nextUser;
  }, [accessibleParks, authUser, sessionActions]);

  const reloadParkScopedData = useCallback(async () => {
    resetFilters();
    scopedDataGeneration.current += 1;
    setBuildings([]);
    setFloors([]);
    setPageData(emptyPage);
    await loadLookups();
    await load(1, emptyFilters);
  }, [load, loadLookups, resetFilters]);

  const changeListPark = useCallback(async (targetParkId: string) => {
    if (listParkSwitchLock.current || !targetParkId) return;
    listParkSwitchLock.current = true;
    setListParkSwitching(true);
    setMessage("");
    try {
      if (targetParkId !== effectiveParkId) {
        const nextUser = await ensureParkContext(targetParkId);
        setListParkId(nextUser?.park_id ?? targetParkId);
      }
      await reloadParkScopedData();
    } finally {
      listParkSwitchLock.current = false;
      setListParkSwitching(false);
    }
  }, [effectiveParkId, ensureParkContext, reloadParkScopedData]);

  const changeFormPark = useCallback(async (targetParkId: string) => {
    if (formParkSwitchLock.current || targetParkId === form.parkId) return;
    const previousParkId = form.parkId;
    formParkSwitchLock.current = true;
    setFormParkSwitching(true);
    setFormMessage("");
    setForm((current) => ({ ...current, parkId: targetParkId, buildingId: "", floorId: "" }));
    let contextCommitted = false;
    try {
      let nextUser: UserContext;
      try {
        nextUser = await ensureParkContext(targetParkId, { publishSession: false });
        contextCommitted = true;
      } catch (error) {
        setForm((current) => current.parkId === targetParkId
          ? { ...current, parkId: previousParkId, buildingId: "", floorId: "" }
          : current);
        throw error;
      }
      sessionActions?.publishUser(nextUser);
      await reloadParkScopedData();
    } catch (error) {
      if (!contextCommitted) throw error;
      throw new Error(`园区已切换，但数据刷新失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      formParkSwitchLock.current = false;
      setFormParkSwitching(false);
    }
  }, [ensureParkContext, form.parkId, reloadParkScopedData, sessionActions]);

  const retryCurrentParkData = useCallback(async () => {
    setMessage("");
    setFormMessage("");
    await reloadParkScopedData();
  }, [reloadParkScopedData]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void loadLookups().catch((error: Error) => setMessage(error.message));
  }, [loadLookups]);

  useEffect(() => {
    setListParkId(storedUser?.park_id ?? "");
  }, [storedUser?.park_id]);

  function openCreate() {
    if (listParkSwitchLock.current) {
      setMessage("园区切换中，请稍后");
      return;
    }
    const defaultBuildingId = filters.buildingId || "";
    const defaultFloorId = defaultBuildingId ? filters.floorId || "" : "";
    setEditingId(null);
    setForm({ ...emptyForm, parkId: effectiveParkId, buildingId: defaultBuildingId, floorId: defaultFloorId });
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

  function openEdit(row: UnitRow) {
    setEditingId(row.id);
    setForm({
      parkId: row.parkId ?? effectiveParkId,
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
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unitSubmitLock.current || formParkSwitchLock.current) return;
    unitSubmitLock.current = true;
    setSubmitting(true);
    setFormMessage("");
    try {
      if (!editingId) await ensureParkContext(form.parkId);
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
      try {
        await load(editingId ? pageData.page : 1);
      } catch (refreshError) {
        setMessage(`保存成功，但列表刷新失败：${refreshError instanceof Error ? refreshError.message : "未知错误"}`);
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "房源保存失败");
    } finally {
      setSubmitting(false);
      unitSubmitLock.current = false;
    }
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
    <PermissionGuard permission={SYSTEM_PERMISSIONS.ASSET_UNIT_LIST} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>{title}</strong>
            <span>维护招商、合同、应收、工单、安全隐患共用的空间主数据</span>
          </div>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.UNIT_CREATE} type="button" disabled={listParkSwitching} onClick={openCreate}>
            <Plus size={16} />
            新增房源
          </PermissionButton>
          <UnitImportExportActions
            onDownloadTemplate={() => void downloadTemplate().catch((error: Error) => setMessage(error.message))}
            onOpenImport={() => {
              setImportFile(null);
              setImportResult(null);
              setShowImport(true);
            }}
            onExport={() => void exportUnits().catch((error: Error) => setMessage(error.message))}
          />
        </header>

        <UnitsToolbar
          filters={filters}
          listParkId={effectiveParkId}
          listParkOptions={accessibleParks}
          listParkSwitching={listParkSwitching}
          buildings={buildings}
          visibleFloors={visibleFloors}
          dicts={dicts}
          onListParkChange={(parkId) => void changeListPark(parkId).catch((error: Error) => handleSwitchError(error, setMessage))}
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
            parkOptions={accessibleParks}
            formMessage={formMessage}
            submitting={submitting}
            formParkSwitching={formParkSwitching}
            buildings={buildings}
            formFloors={formFloors}
            dicts={dicts}
            authUser={authUser}
            canEditRefPrice={canEditRefPrice}
            canViewRefPrice={canViewRefPrice}
            canEditRemark={canEditRemark}
            canViewRemark={canViewRemark}
            onClose={closeForm}
            onSubmit={(event) => void submit(event)}
            onParkChange={(parkId) => void changeFormPark(parkId).catch((error: Error) => handleSwitchError(error, setFormMessage))}
            onRetryParkLoad={() => void retryCurrentParkData().catch((error: Error) => handleSwitchError(error, setFormMessage))}
            onBuildingChange={updateFormBuilding}
            onFormChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))}
          />
        ) : null}

        {showImport ? (
          <UnitImportDrawer
            importResult={importResult}
            onClose={() => setShowImport(false)}
            onFileChange={(file) => {
              setImportFile(file);
              setImportResult(null);
            }}
            onSubmit={(event) => void importUnits(event).catch((error: Error) => setMessage(error.message))}
            onDownloadTemplate={() => void downloadTemplate().catch((error: Error) => setMessage(error.message))}
          />
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
          <UnitStatusDrawer
            unit={transitionTarget}
            panelMode={transitionPanelMode}
            dicts={dicts}
            canChangeStatus={canChangeStatus}
            canForceChangeStatus={canForceChangeStatus}
            transitionStatus={transitionStatus}
            transitionReason={transitionReason}
            transitionLockReason={transitionLockReason}
            transitionLockExpireTime={transitionLockExpireTime}
            statusLogPage={statusLogPage}
            onClose={() => setTransitionTarget(null)}
            onSubmit={(event) => void submitTransition(event).catch((error: Error) => setMessage(error.message))}
            onTransitionStatusChange={setTransitionStatus}
            onTransitionReasonChange={setTransitionReason}
            onTransitionLockReasonChange={setTransitionLockReason}
            onTransitionLockExpireTimeChange={setTransitionLockExpireTime}
            onStatusLogPageChange={(page) => void loadStatusLogs(transitionTarget.id, page).catch((error: Error) => setMessage(error.message))}
          />
        ) : null}

        {message ? (
          <p className="status-pill">
            {message}
            <button className="inline-action-button" type="button" onClick={() => void retryCurrentParkData().catch((error: Error) => handleSwitchError(error, setMessage))}>
              重新加载当前园区数据
            </button>
          </p>
        ) : null}
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

function enabledParks(
  parks: UserParkContext[] | undefined,
  currentParkId: string | undefined,
  currentParkName: string | null | undefined
): UserParkContext[] {
  const enabled = (parks ?? []).filter((park) => park.status === "enabled");
  if (!currentParkId || enabled.some((park) => park.park_id === currentParkId)) return enabled;
  return [{ park_id: currentParkId, park_name: currentParkName ?? currentParkId, is_default: true, status: "enabled" }, ...enabled];
}
