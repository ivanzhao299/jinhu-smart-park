import type { EngineeringIssueSeverity } from "./engineering-inspections-types";
import type { EngineeringRectificationAction, EngineeringRectificationStatus } from "./engineering-rectifications-types";
import { engineeringIssueSeverityLabels, issueSeverityVariant } from "./engineering-inspections-display";

type StatusVariant = "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted";

export const engineeringRectificationStatusLabels: Record<EngineeringRectificationStatus, string> = {
  PENDING: "待整改",
  IN_PROGRESS: "整改中",
  SUBMITTED: "已提交整改",
  RECHECKING: "待复查",
  PASSED: "复查通过",
  REJECTED: "复查驳回",
  OVERDUE: "已逾期",
  CLOSED: "已关闭"
};

export const engineeringRectificationActionLabels: Record<EngineeringRectificationAction, string> = {
  START: "开始整改",
  SUBMIT: "提交整改",
  START_RECHECK: "开始复查",
  PASS: "复查通过",
  REJECT: "复查驳回",
  CLOSE: "关闭整改",
  MARK_OVERDUE: "标记逾期"
};

export function rectificationStatusVariant(status: EngineeringRectificationStatus): StatusVariant {
  if (status === "CLOSED" || status === "PASSED") return "success";
  if (status === "OVERDUE" || status === "REJECTED") return "danger";
  if (status === "SUBMITTED" || status === "RECHECKING") return "warning";
  if (status === "IN_PROGRESS") return "info";
  return "muted";
}

export { engineeringIssueSeverityLabels, issueSeverityVariant };
export type { EngineeringIssueSeverity };

export const engineeringRectificationStatusOptions = Object.entries(engineeringRectificationStatusLabels).map(([value, label]) => ({
  value: value as EngineeringRectificationStatus,
  label
}));
