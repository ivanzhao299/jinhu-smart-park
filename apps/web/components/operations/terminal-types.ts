import type { FileRecord, PaginatedResult } from "@jinhu/shared";

export type DictMap = Record<string, DictItemRow[]>;

export interface DictTypeRow {
  id: string;
  dictCode: string;
}

export interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

export interface InspectPlanRow {
  id: string;
  planCode: string;
  planName: string;
  status: string;
}

export interface InspectPointRow {
  id: string;
  pointCode: string;
  pointName: string;
  requiredScan?: boolean;
  requiredGps?: boolean;
  requiredPhotoCount?: number;
  qrCode?: string | null;
}

export interface InspectTemplateRow {
  id: string;
  templateName: string;
  templateType?: string | null;
}

export interface InspectItemRow {
  id: string;
  itemName: string;
  required: boolean;
}

export interface InspectTaskResultRow {
  id: string;
  itemId: string;
  itemName: string;
  result: string;
  valueText: string | null;
  isAbnormal: boolean;
  hazardCreated: boolean;
}

export interface InspectTaskRow {
  id: string;
  taskCode: string;
  planId: string | null;
  templateId: string;
  pointId: string;
  handlerName: string;
  planTime: string;
  dueTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  scanOk: boolean;
  gpsLng: string | null;
  gpsLat: string | null;
  photoFileIds: string[];
  result: string | null;
  status: string;
  remark: string | null;
  point?: InspectPointRow | null;
  template?: InspectTemplateRow | null;
  items?: InspectItemRow[];
  results?: InspectTaskResultRow[];
}

export interface UnitRow {
  id: string;
  unitCode: string;
  unitName: string;
  buildingId: string;
  floorId: string;
  building?: { buildingName: string; buildingCode: string } | null;
  floor?: { floorName: string; floorCode: string } | null;
}

export interface ParkTenantRow {
  id: string;
  companyName: string;
  parkTenantCode: string;
}

export interface UserRow {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  mobile?: string | null;
}

export interface WorkOrderRow {
  id: string;
  woCode: string;
  title: string;
  status: string;
  priority: string;
  urgency: string | null;
  createTime: string;
}

export interface ResultInput {
  result: string;
  valueText: string;
  photoFileIds: string[];
  createHazard: boolean;
}

export interface CheckInForm {
  qrCode: string;
  gpsLng: string;
  gpsLat: string;
  photoFileIds: string[];
}

export interface WorkOrderForm {
  woType: string;
  priority: string;
  urgency: string;
  title: string;
  description: string;
  location: string;
  parkTenantId: string;
  unitId: string;
  reporterName: string;
  reporterMobile: string;
  assigneeId: string;
  imageFileIds: string[];
}

export type PaginatedRows<T> = PaginatedResult<T>;

export type UploadedFile = FileRecord;
