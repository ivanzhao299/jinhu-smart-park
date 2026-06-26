import type { EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanType } from "./engineering-plans-types";

export const engineeringPlanTypeLabels: Record<EngineeringPlanType, string> = {
  MASTER: "总计划",
  PHASE: "阶段计划",
  WEEKLY: "周计划",
  DAILY: "日计划",
  SPECIAL: "专项计划",
  MILESTONE: "里程碑"
};

export const engineeringPlanStatusLabels: Record<EngineeringPlanStatus, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  APPROVED: "已批准",
  IN_PROGRESS: "执行中",
  DELAYED: "已延期",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

export const engineeringPlanLevelLabels: Record<EngineeringPlanLevel, string> = {
  L1: "一级计划",
  L2: "二级计划",
  L3: "三级计划",
  L4: "四级计划"
};

export const engineeringPlanTypeOptions = toOptions(engineeringPlanTypeLabels);
export const engineeringPlanStatusOptions = toOptions(engineeringPlanStatusLabels);
export const engineeringPlanLevelOptions = toOptions(engineeringPlanLevelLabels);

export function planStatusVariant(status: EngineeringPlanStatus): "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted" {
  if (status === "COMPLETED") return "success";
  if (status === "APPROVED" || status === "IN_PROGRESS" || status === "SUBMITTED") return "primary";
  if (status === "DELAYED") return "warning";
  if (status === "CANCELLED") return "danger";
  return "muted";
}

export function planLevelVariant(level: EngineeringPlanLevel): "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted" {
  if (level === "L1") return "primary";
  if (level === "L2") return "info";
  if (level === "L3") return "warning";
  return "muted";
}

function toOptions<T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> {
  return (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }));
}
