import type {
  EngineeringInspectionStatus,
  EngineeringInspectionType,
  EngineeringIssueSeverity,
  EngineeringIssueStatus,
  EngineeringIssueType
} from "./engineering-inspections-types";

export const engineeringInspectionTypeLabels: Record<EngineeringInspectionType, string> = {
  ROUTINE: "例行巡检",
  QUALITY: "质量巡检",
  SAFETY: "安全巡检",
  PROGRESS: "进度巡检",
  MATERIAL: "材料巡检",
  HIDDEN_WORK: "隐蔽工程",
  SPECIAL: "专项巡检",
  ACCEPTANCE_PRECHECK: "验收预检",
  OTHER: "其他"
};

export const engineeringInspectionStatusLabels: Record<EngineeringInspectionStatus, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

export const engineeringIssueTypeLabels: Record<EngineeringIssueType, string> = {
  QUALITY: "质量问题",
  SAFETY: "安全问题",
  PROGRESS: "进度问题",
  DESIGN: "设计问题",
  MATERIAL: "材料问题",
  ENVIRONMENT: "环境问题",
  CIVILIZED_CONSTRUCTION: "文明施工",
  OTHER: "其他"
};

export const engineeringIssueSeverityLabels: Record<EngineeringIssueSeverity, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  CRITICAL: "重大"
};

export const engineeringIssueStatusLabels: Record<EngineeringIssueStatus, string> = {
  OPEN: "已发现",
  RECTIFICATION_PENDING: "待整改",
  RECTIFYING: "整改中",
  RECHECKING: "复查中",
  CLOSED: "已关闭",
  CANCELLED: "已取消"
};

export const engineeringInspectionTypeOptions = toOptions(engineeringInspectionTypeLabels);
export const engineeringInspectionStatusOptions = toOptions(engineeringInspectionStatusLabels);
export const engineeringIssueTypeOptions = toOptions(engineeringIssueTypeLabels);
export const engineeringIssueSeverityOptions = toOptions(engineeringIssueSeverityLabels);
export const engineeringIssueStatusOptions = toOptions(engineeringIssueStatusLabels);

export function inspectionStatusVariant(status: EngineeringInspectionStatus): "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted" {
  if (status === "COMPLETED") return "success";
  if (status === "SUBMITTED") return "primary";
  if (status === "CANCELLED") return "danger";
  return "muted";
}

export function issueSeverityVariant(severity: EngineeringIssueSeverity): "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted" {
  if (severity === "CRITICAL") return "danger";
  if (severity === "HIGH") return "warning";
  if (severity === "MEDIUM") return "primary";
  return "success";
}

export function issueStatusVariant(status: EngineeringIssueStatus): "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted" {
  if (status === "CLOSED") return "success";
  if (status === "CANCELLED") return "muted";
  if (status === "RECTIFYING" || status === "RECHECKING") return "primary";
  if (status === "RECTIFICATION_PENDING") return "warning";
  return "info";
}

function toOptions<T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> {
  return (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }));
}
