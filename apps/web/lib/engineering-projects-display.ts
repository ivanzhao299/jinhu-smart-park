import type {
  EngineeringProjectAction,
  EngineeringProjectLevel,
  EngineeringProjectStatus,
  EngineeringProjectType,
  EngineeringRiskLevel
} from "./engineering-projects-types";

export const engineeringProjectTypeLabels: Record<EngineeringProjectType, string> = {
  NEW_BUILD: "新建工程",
  RENOVATION: "改造工程",
  DECORATION: "装修工程",
  INSTALLATION: "安装工程",
  REPAIR: "维修工程",
  MUNICIPAL: "市政工程",
  LANDSCAPE: "园林工程",
  ELECTRICAL: "强电工程",
  WEAK_CURRENT: "弱电工程",
  FIRE_PROTECTION: "消防工程",
  HVAC: "暖通空调工程",
  OTHER: "其他工程"
};

export const engineeringProjectStatusLabels: Record<EngineeringProjectStatus, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  APPROVED: "已批准",
  PLANNING: "计划中",
  EXECUTING: "施工中",
  INSPECTING: "巡检中",
  RECTIFYING: "整改中",
  ACCEPTING: "验收中",
  ACCEPTED: "已验收",
  TRANSFER_READY: "待移交",
  SETTLEMENT_READY: "待结算",
  CLOSED: "已关闭",
  ARCHIVED: "已归档",
  CANCELLED: "已取消"
};

export const engineeringProjectLevelLabels: Record<EngineeringProjectLevel, string> = {
  NORMAL: "普通项目",
  IMPORTANT: "重点项目",
  MAJOR: "重大项目"
};

export const engineeringRiskLevelLabels: Record<EngineeringRiskLevel, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  CRITICAL: "严重"
};

export const engineeringProjectActionLabels: Record<EngineeringProjectAction, string> = {
  SUBMIT: "提交立项",
  APPROVE: "批准立项",
  CANCEL: "取消项目",
  START_PLANNING: "进入计划",
  START_EXECUTION: "进入施工",
  START_INSPECTION: "进入巡检",
  REQUIRE_RECTIFICATION: "要求整改",
  START_ACCEPTANCE: "进入验收",
  ACCEPTANCE_PASSED: "验收通过",
  ACCEPTANCE_FAILED: "验收未通过",
  MARK_TRANSFER_READY: "标记待移交",
  MARK_SETTLEMENT_READY: "标记待结算",
  CLOSE: "关闭项目",
  ARCHIVE: "归档项目"
};

export const engineeringProjectTypeOptions = toOptions(engineeringProjectTypeLabels);
export const engineeringProjectStatusOptions = toOptions(engineeringProjectStatusLabels);
export const engineeringProjectLevelOptions = toOptions(engineeringProjectLevelLabels);
export const engineeringRiskLevelOptions = toOptions(engineeringRiskLevelLabels);

export function projectStatusVariant(status: EngineeringProjectStatus): "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted" {
  if (status === "ACCEPTED" || status === "TRANSFER_READY" || status === "SETTLEMENT_READY" || status === "CLOSED" || status === "ARCHIVED") {
    return "success";
  }
  if (status === "SUBMITTED" || status === "PLANNING" || status === "EXECUTING" || status === "INSPECTING" || status === "ACCEPTING") {
    return "primary";
  }
  if (status === "RECTIFYING") {
    return "warning";
  }
  if (status === "CANCELLED") {
    return "danger";
  }
  return "muted";
}

export function projectRiskVariant(risk: EngineeringRiskLevel): "success" | "warning" | "danger" | "primary" {
  if (risk === "LOW") return "success";
  if (risk === "MEDIUM") return "primary";
  if (risk === "HIGH") return "warning";
  return "danger";
}

function toOptions<T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> {
  return (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }));
}
