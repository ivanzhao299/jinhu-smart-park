export function validateDailyReportPeopleCount(value: string | number, label = "人数"): string {
  if (String(value).trim() === "") return "";
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    return `${label}不能为负数`;
  }
  return "";
}

export function validateDailyReportProgress(value: string | number): string {
  const progress = Number(value);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    return "日报进度必须在 0 到 100 之间";
  }
  return "";
}

export function isDailyReportEditable(status: string): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

export function isDailyReportSubmittable(status: string): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

export function isDailyReportReviewable(status: string): boolean {
  return status === "SUBMITTED";
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
