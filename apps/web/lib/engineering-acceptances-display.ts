import type { EngineeringAcceptanceStatus, EngineeringAcceptanceType } from "./engineering-acceptances-types";

type StatusVariant = "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted";

export const engineeringAcceptanceTypeLabels: Record<EngineeringAcceptanceType, string> = {
  HIDDEN_WORK: "隐蔽工程验收",
  STAGE: "阶段验收",
  SPECIAL: "专项验收",
  COMPLETION: "竣工验收",
  TRANSFER_PRECHECK: "移交预验收"
};

export const engineeringAcceptanceStatusLabels: Record<EngineeringAcceptanceStatus, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  REVIEWING: "验收中",
  PASSED: "通过",
  FAILED: "未通过",
  RECTIFICATION_REQUIRED: "需整改",
  CLOSED: "关闭"
};

export function acceptanceStatusVariant(status: EngineeringAcceptanceStatus): StatusVariant {
  if (status === "PASSED" || status === "CLOSED") return "success";
  if (status === "FAILED" || status === "RECTIFICATION_REQUIRED") return "danger";
  if (status === "SUBMITTED" || status === "REVIEWING") return "warning";
  return "muted";
}

export function acceptanceTypeVariant(type: EngineeringAcceptanceType): StatusVariant {
  if (type === "COMPLETION") return "primary";
  if (type === "TRANSFER_PRECHECK") return "info";
  if (type === "HIDDEN_WORK") return "warning";
  return "default";
}

export const engineeringAcceptanceTypeOptions = Object.entries(engineeringAcceptanceTypeLabels).map(([value, label]) => ({
  value: value as EngineeringAcceptanceType,
  label
}));

export const engineeringAcceptanceStatusOptions = Object.entries(engineeringAcceptanceStatusLabels).map(([value, label]) => ({
  value: value as EngineeringAcceptanceStatus,
  label
}));
