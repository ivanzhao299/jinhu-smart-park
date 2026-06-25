import { OperationsTerminalClient } from "../../../components/operations/OperationsTerminalClient";
import type { DictMap, InspectTaskRow, WorkOrderRow } from "../../../components/operations/terminal-types";

const now = new Date();
const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

const dicts: DictMap = {
  safety_inspect_task_status: [
    { id: "task-10", itemLabel: "待执行", itemValue: "10", status: "enabled" },
    { id: "task-20", itemLabel: "执行中", itemValue: "20", status: "enabled" },
    { id: "task-30", itemLabel: "已完成", itemValue: "30", status: "enabled" },
    { id: "task-40", itemLabel: "异常完成", itemValue: "40", status: "enabled" }
  ],
  safety_inspect_item_result: [
    { id: "normal", itemLabel: "正常", itemValue: "normal", status: "enabled" },
    { id: "abnormal", itemLabel: "异常", itemValue: "abnormal", status: "enabled" },
    { id: "skipped", itemLabel: "跳过", itemValue: "skipped", status: "enabled" }
  ],
  workorder_priority: [
    { id: "medium", itemLabel: "中", itemValue: "medium", status: "enabled" },
    { id: "high", itemLabel: "高", itemValue: "high", status: "enabled" }
  ],
  workorder_status: [
    { id: "10", itemLabel: "待受理", itemValue: "10", status: "enabled" },
    { id: "20", itemLabel: "处理中", itemValue: "20", status: "enabled" },
    { id: "60", itemLabel: "已闭环", itemValue: "60", status: "enabled" }
  ],
  workorder_type: [
    { id: "repair", itemLabel: "现场报修", itemValue: "repair", status: "enabled" }
  ],
  workorder_urgency: [
    { id: "normal", itemLabel: "普通", itemValue: "normal", status: "enabled" },
    { id: "urgent", itemLabel: "紧急", itemValue: "urgent", status: "enabled" }
  ]
};

const tasks: InspectTaskRow[] = [
  {
    id: "task-fire-passage",
    taskCode: "ST-PREVIEW-001",
    planId: "plan-fire",
    templateId: "template-fire",
    pointId: "point-fire-passage",
    handlerName: "物业安全负责人",
    planTime: now.toISOString(),
    dueTime: inOneHour.toISOString(),
    actualStartTime: null,
    actualEndTime: null,
    scanOk: false,
    gpsLng: null,
    gpsLat: null,
    photoFileIds: [],
    result: null,
    status: "10",
    remark: "消防通道每日巡检",
    point: {
      id: "point-fire-passage",
      pointCode: "SP-PREVIEW-001",
      pointName: "1 号楼消防通道",
      requiredScan: true,
      requiredGps: true,
      requiredPhotoCount: 2,
      qrCode: "SP-PREVIEW-001"
    },
    template: { id: "template-fire", templateName: "消防安全巡检", templateType: "fire" },
    items: [
      { id: "item-fire-1", itemName: "消防通道是否畅通", required: true },
      { id: "item-fire-2", itemName: "灭火器是否在有效期内", required: true },
      { id: "item-fire-3", itemName: "应急照明是否正常", required: true }
    ],
    results: []
  },
  {
    id: "task-power",
    taskCode: "ST-PREVIEW-002",
    planId: "plan-power",
    templateId: "template-power",
    pointId: "point-power",
    handlerName: "设备安全负责人",
    planTime: inOneHour.toISOString(),
    dueTime: inTwoHours.toISOString(),
    actualStartTime: now.toISOString(),
    actualEndTime: null,
    scanOk: true,
    gpsLng: "118.123456",
    gpsLat: "33.123456",
    photoFileIds: [],
    result: null,
    status: "20",
    remark: "配电房巡检",
    point: {
      id: "point-power",
      pointCode: "SP-PREVIEW-002",
      pointName: "配电房 A 区",
      requiredScan: true,
      requiredGps: true,
      requiredPhotoCount: 1,
      qrCode: "SP-PREVIEW-002"
    },
    template: { id: "template-power", templateName: "用电安全巡检", templateType: "electrical" },
    items: [
      { id: "item-power-1", itemName: "配电箱是否上锁", required: true },
      { id: "item-power-2", itemName: "是否存在私拉乱接", required: true }
    ],
    results: []
  },
  {
    id: "task-clean",
    taskCode: "ST-PREVIEW-003",
    planId: "plan-clean",
    templateId: "template-clean",
    pointId: "point-clean",
    handlerName: "招商负责人",
    planTime: now.toISOString(),
    dueTime: inTwoHours.toISOString(),
    actualStartTime: now.toISOString(),
    actualEndTime: inOneHour.toISOString(),
    scanOk: true,
    gpsLng: "118.123456",
    gpsLat: "33.123456",
    photoFileIds: [],
    result: "abnormal",
    status: "40",
    remark: "卫生巡检发现公共走廊堆放杂物",
    point: {
      id: "point-clean",
      pointCode: "SP-PREVIEW-003",
      pointName: "2 号楼公共走廊",
      requiredScan: false,
      requiredGps: true,
      requiredPhotoCount: 1
    },
    template: { id: "template-clean", templateName: "卫生环境巡检", templateType: "public_area" },
    items: [
      { id: "item-clean-1", itemName: "公共区域是否整洁", required: true },
      { id: "item-clean-2", itemName: "垃圾桶是否满溢", required: true }
    ],
    results: []
  }
];

const recentWorkOrders: WorkOrderRow[] = [
  {
    id: "wo-1",
    woCode: "WO-PREVIEW-001",
    title: "鲁商中心办公室门口照明异常",
    status: "20",
    priority: "high",
    urgency: "urgent",
    createTime: now.toISOString()
  },
  {
    id: "wo-2",
    woCode: "WO-PREVIEW-002",
    title: "停车场入口道闸识别延迟",
    status: "10",
    priority: "medium",
    urgency: "normal",
    createTime: inOneHour.toISOString()
  }
];

export default function OperationsTerminalPreviewPage() {
  return (
    <OperationsTerminalClient
      previewMode
      previewData={{
        tasks,
        recentWorkOrders,
        dicts,
        plans: [{ id: "plan-fire", planCode: "PLAN-PREVIEW", planName: "现场每日巡检", status: "enabled" }],
        units: [
          {
            id: "unit-1",
            unitCode: "U-PREVIEW-001",
            unitName: "1 号楼 101",
            buildingId: "building-1",
            floorId: "floor-1",
            building: { buildingName: "1 号楼", buildingCode: "B001" },
            floor: { floorName: "1 层", floorCode: "F001" }
          }
        ],
        parkTenants: [{ id: "tenant-1", companyName: "鲁商中心办公室", parkTenantCode: "PT-PREVIEW" }],
        users: [{ id: "user-1", username: "ops", realName: "现场负责人", displayName: "现场负责人" }]
      }}
    />
  );
}
