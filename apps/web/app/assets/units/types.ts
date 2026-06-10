import type { PaginatedResult } from "@jinhu/shared";

export type EnabledStatus = 0 | 1;

export interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
}

export interface FloorRow {
  id: string;
  buildingId: string;
  floorCode: string;
  floorName: string;
  floorNo: number;
}

export interface DictTypeRow {
  id: string;
  dictCode: string;
}

export interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  sortOrder: number;
  status: string;
  tagType: string | null;
}

export interface UnitRow {
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

export interface UnitFormState {
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

export interface UnitFilters {
  buildingId: string;
  floorId: string;
  usageType: string;
  rentalStatus: string;
  fittingStatus: string;
  keyword: string;
  minArea: string;
  maxArea: string;
}

export type UnitAttachmentMode = "photos" | "floorplan";
export type UnitStatusPanelMode = "change" | "logs";

export interface UnitStatusLogRow {
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

export interface UnitWorkOrderRow {
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

export interface UnitWorkOrdersResponse {
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
  };
  recent_items: UnitWorkOrderRow[];
}

export interface UnitHazardRow {
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

export interface UnitHazardsResponse {
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
    major_count: number;
  };
  recent_items: UnitHazardRow[];
}

export interface UnitEmergencyRow {
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

export interface UnitEmergenciesResponse {
  summary: {
    total_count: number;
    open_count: number;
    closed_count: number;
    major_count: number;
  };
  recent_items: UnitEmergencyRow[];
}

export interface UnitWorkPermitRow {
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

export interface UnitWorkPermitsResponse {
  summary: {
    total_count: number;
    in_progress_count: number;
    violation_count: number;
    closed_count: number;
  };
  recent_items: UnitWorkPermitRow[];
}

export interface UnitIotDeviceRow {
  id: string;
  device_code: string;
  device_name: string;
  device_type: string;
  online_status: string;
  status: string;
  location: string | null;
  last_data_time: string | null;
}

export interface UnitIotAlertRow {
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

export interface UnitDevicesResponse {
  summary: {
    device_count: number;
    online_count: number;
    offline_count: number;
    active_alert_count: number;
  };
  recent_devices: UnitIotDeviceRow[];
  recent_alerts: UnitIotAlertRow[];
}

export interface ImportResult {
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

export type UnitPage = PaginatedResult<UnitRow>;
export type UnitStatusLogPage = PaginatedResult<UnitStatusLogRow>;
