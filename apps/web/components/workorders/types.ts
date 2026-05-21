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

export interface ParkTenantRow {
  id: string;
  parkTenantCode?: string;
  companyName: string;
}

export interface UnitRow {
  id: string;
  code?: string | null;
  unitCode: string;
  unitName: string;
  buildingId?: string;
  floorId?: string;
  building?: {
    buildingCode: string;
    buildingName: string;
  } | null;
  floor?: {
    floorCode: string;
    floorName: string;
  } | null;
}

export interface UserRow {
  id: string;
  username: string;
  displayName?: string;
  realName?: string;
  mobile?: string | null;
  status?: string;
}

export interface WorkOrderRow {
  id: string;
  code: string | null;
  woCode: string;
  title: string;
  woType: string;
  woSubType: string | null;
  priority: string;
  urgency: string | null;
  status: string;
  sourceType: string;
  sourceId: string | null;
  parkTenantId: string | null;
  unitId: string | null;
  buildingId: string | null;
  floorId: string | null;
  roomLabel: string | null;
  location: string | null;
  reporterId: string | null;
  reporterName: string | null;
  reporterMobile?: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  description?: string | null;
  imageFileIds?: string[];
  videoFileIds?: string[];
  deviceId?: string | null;
  robotId?: string | null;
  slaDispatchMin: number | null;
  slaFinishMin: number | null;
  overdueFlag: boolean;
  overdueReason: string | null;
  dispatchTime?: string | null;
  acceptTime?: string | null;
  startTime?: string | null;
  waitMaterialTime?: string | null;
  finishTime?: string | null;
  confirmTime?: string | null;
  closeTime?: string | null;
  cancelTime?: string | null;
  satisfaction?: number | null;
  evaluation?: string | null;
  resolveNote?: string | null;
  createTime: string;
  updateTime: string;
  remark: string | null;
  parkTenant?: ParkTenantRow | null;
  unit?: UnitRow | null;
  building?: {
    buildingCode: string;
    buildingName: string;
  } | null;
  floor?: {
    floorCode: string;
    floorName: string;
  } | null;
}

export interface WorkOrderLogRow {
  id: string;
  code: string | null;
  logCode: string | null;
  workOrderId: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  operatorId: string | null;
  operatorName: string | null;
  reason: string | null;
  content: string | null;
  attachmentFileIds: string[];
  opTime: string;
  remark: string | null;
}

export type DictMap = Record<string, DictItemRow[]>;
