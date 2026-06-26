import type { EngineeringDailyReportStatus, EngineeringWeatherType } from "./engineering-daily-reports-types";

export const engineeringDailyReportStatusLabels: Record<EngineeringDailyReportStatus, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  REVIEWED: "已审核",
  REJECTED: "已驳回",
  ARCHIVED: "已归档"
};

export const engineeringWeatherTypeLabels: Record<EngineeringWeatherType, string> = {
  SUNNY: "晴",
  CLOUDY: "多云",
  OVERCAST: "阴",
  RAIN: "雨",
  SNOW: "雪",
  WINDY: "大风",
  FOG: "雾",
  OTHER: "其他"
};

export const engineeringDailyReportStatusOptions = toOptions(engineeringDailyReportStatusLabels);
export const engineeringWeatherTypeOptions = toOptions(engineeringWeatherTypeLabels);

export function dailyReportStatusVariant(
  status: EngineeringDailyReportStatus
): "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted" {
  if (status === "REVIEWED" || status === "ARCHIVED") return "success";
  if (status === "SUBMITTED") return "primary";
  if (status === "REJECTED") return "danger";
  return "muted";
}

export function weatherVariant(
  weather: EngineeringWeatherType
): "default" | "success" | "warning" | "danger" | "info" | "primary" | "muted" {
  if (weather === "SUNNY" || weather === "CLOUDY") return "success";
  if (weather === "RAIN" || weather === "SNOW" || weather === "WINDY") return "warning";
  if (weather === "FOG") return "info";
  return "muted";
}

function toOptions<T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> {
  return (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }));
}
