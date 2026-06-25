import { TenantServiceEntryClient } from "../../../components/tenant-service/TenantServiceEntryClient";
import type { DictMap, ParkTenantRow, UnitRow, UserRow } from "../../../components/operations/terminal-types";
import type { TenantServiceWorkOrderRow } from "../../../components/tenant-service/TenantServiceEntryClient";

const now = new Date();
const previousHour = new Date(now.getTime() - 60 * 60 * 1000);
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

const dicts: DictMap = {
  workorder_status: [
    { id: "status-10", itemLabel: "待受理", itemValue: "10", status: "enabled" },
    { id: "status-20", itemLabel: "处理中", itemValue: "20", status: "enabled" },
    { id: "status-60", itemLabel: "待确认", itemValue: "60", status: "enabled" },
    { id: "status-70", itemLabel: "已评价", itemValue: "70", status: "enabled" }
  ],
  workorder_type: [
    { id: "type-repair", itemLabel: "维修报修", itemValue: "repair", status: "enabled" },
    { id: "type-cleaning", itemLabel: "保洁服务", itemValue: "cleaning", status: "enabled" },
    { id: "type-security", itemLabel: "安防协助", itemValue: "security", status: "enabled" }
  ],
  workorder_priority: [
    { id: "priority-normal", itemLabel: "普通", itemValue: "normal", status: "enabled" },
    { id: "priority-high", itemLabel: "高", itemValue: "high", status: "enabled" }
  ],
  workorder_urgency: [
    { id: "urgency-normal", itemLabel: "普通", itemValue: "normal", status: "enabled" },
    { id: "urgency-urgent", itemLabel: "紧急", itemValue: "urgent", status: "enabled" }
  ],
  workorder_source_type: [
    { id: "source-tenant", itemLabel: "租户诉求", itemValue: "tenant_request", status: "enabled" }
  ]
};

const parkTenants: ParkTenantRow[] = [
  { id: "tenant-1", companyName: "鲁商中心办公室", parkTenantCode: "PT-PREVIEW" }
];

const units: UnitRow[] = [
  {
    id: "unit-1",
    unitCode: "U-PREVIEW-001",
    unitName: "1 号楼 101",
    buildingId: "building-1",
    floorId: "floor-1",
    building: { buildingName: "1 号楼", buildingCode: "B001" },
    floor: { floorName: "1 层", floorCode: "F001" }
  }
];

const users: UserRow[] = [
  { id: "user-1", username: "service", realName: "客服调度", displayName: "客服调度" }
];

const workOrders: TenantServiceWorkOrderRow[] = [
  {
    id: "wo-preview-1",
    woCode: "WO-TENANT-001",
    title: "办公室门口照明不亮",
    status: "20",
    priority: "high",
    urgency: "urgent",
    createTime: previousHour.toISOString(),
    sourceType: "tenant_request",
    parkTenantId: "tenant-1",
    unitId: "unit-1",
    location: "1 号楼 / 1 层 / 101",
    assigneeName: "维修班组",
    parkTenant: parkTenants[0]
  },
  {
    id: "wo-preview-2",
    woCode: "WO-TENANT-002",
    title: "公共走廊保洁补扫",
    status: "60",
    priority: "normal",
    urgency: "normal",
    createTime: yesterday.toISOString(),
    sourceType: "tenant_request",
    parkTenantId: "tenant-1",
    unitId: "unit-1",
    location: "2 号楼公共走廊",
    assigneeName: "环境服务",
    parkTenant: parkTenants[0]
  }
];

export default function TenantServicePreviewPage() {
  return (
    <TenantServiceEntryClient
      previewMode
      previewData={{
        dicts,
        workOrders,
        parkTenants,
        units,
        users
      }}
    />
  );
}
