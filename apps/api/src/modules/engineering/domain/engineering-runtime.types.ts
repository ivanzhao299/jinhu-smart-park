export const ENGINEERING_RUNTIME_CODE = "engineering";
export const ENGINEERING_RUNTIME_NAME = "Engineering Project Delivery Runtime";
export const ENGINEERING_RUNTIME_CN_NAME = "工程项目交付运行时";

export type EngineeringRuntimePhase = "phase_1_mvp" | "phase_2_extension";
export type EngineeringRuntimeSkeletonStatus = "SKELETON_READY" | "IN_PROGRESS";

export interface EngineeringSubRuntimeDescriptor {
  code: string;
  name: string;
  phase: EngineeringRuntimePhase;
  responsibility: string;
}

export interface EngineeringIntegrationBoundary {
  target_runtime: "finance" | "asset" | "facility" | "ai" | "iot" | "workflow" | "notification";
  phase_1_mode: "placeholder" | "read_only" | "event_reserved";
  note: string;
}

export interface EngineeringRuntimeDescriptor {
  runtime_code: typeof ENGINEERING_RUNTIME_CODE;
  runtime_name: typeof ENGINEERING_RUNTIME_NAME;
  runtime_cn_name: typeof ENGINEERING_RUNTIME_CN_NAME;
  status: EngineeringRuntimeSkeletonStatus;
  phase: EngineeringRuntimePhase;
  api_prefix: string;
  sub_runtimes: EngineeringSubRuntimeDescriptor[];
  integration_boundaries: EngineeringIntegrationBoundary[];
}

export const ENGINEERING_PHASE_1_SUB_RUNTIMES: EngineeringSubRuntimeDescriptor[] = [
  {
    code: "EPDR-P1",
    name: "Project Runtime",
    phase: "phase_1_mvp",
    responsibility: "工程项目中心，承载立项、状态机、DataScope 与项目级上下文。"
  },
  {
    code: "EPDR-P2",
    name: "Planning Runtime",
    phase: "phase_1_mvp",
    responsibility: "工程计划管理，承载计划编制、审批预留与后续进度基线。"
  },
  {
    code: "EPDR-P3",
    name: "Construction Runtime",
    phase: "phase_1_mvp",
    responsibility: "施工日报管理，承载施工单位每日进度、人员、材料与现场记录。"
  },
  {
    code: "EPDR-P4",
    name: "Inspection Runtime",
    phase: "phase_1_mvp",
    responsibility: "工程现场巡检，承载质量、安全、进度现场检查记录。"
  },
  {
    code: "EPDR-P5",
    name: "Rectification Runtime",
    phase: "phase_1_mvp",
    responsibility: "整改闭环管理，承载问题下达、整改反馈、复查和关闭。"
  },
  {
    code: "EPDR-P6",
    name: "Acceptance Runtime",
    phase: "phase_1_mvp",
    responsibility: "验收管理，承载隐蔽、阶段、专项、竣工和移交预验收。"
  }
];

export const ENGINEERING_INTEGRATION_BOUNDARIES: EngineeringIntegrationBoundary[] = [
  {
    target_runtime: "workflow",
    phase_1_mode: "placeholder",
    note: "立项审批、计划审批、验收审批、整改复查与项目关闭预留 workflowInstanceId。"
  },
  {
    target_runtime: "notification",
    phase_1_mode: "event_reserved",
    note: "关键节点先发布工程事件，后续由通知 Runtime 订阅。"
  },
  {
    target_runtime: "finance",
    phase_1_mode: "placeholder",
    note: "预留结算、付款和合同引用字段，不在 Phase 1 执行真实财务动作。"
  },
  {
    target_runtime: "asset",
    phase_1_mode: "placeholder",
    note: "预留资产形成、设备移交、空间改造结果接口。"
  },
  {
    target_runtime: "facility",
    phase_1_mode: "placeholder",
    note: "预留物业运维接管和设施台账生成接口。"
  },
  {
    target_runtime: "ai",
    phase_1_mode: "event_reserved",
    note: "预留 AI Agent 可调用 API 与事件上下文，不在 Phase 1 调用真实模型。"
  },
  {
    target_runtime: "iot",
    phase_1_mode: "read_only",
    note: "预留 IoT 设备点位、传感器验收和现场数据读取边界。"
  }
];
