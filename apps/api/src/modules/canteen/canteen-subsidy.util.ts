/**
 * 补贴 M2 辅助：账期(YYYY-MM)计算、姓名脱敏、余额恒等。
 */
import type { TenantParkScope } from "@jinhu/shared";

/** 本地账期 YYYY-MM。 */
export function periodOf(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** 业务日期串 YYYY-MM-DD。 */
export function businessDateOf(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 餐段按小时粗分（与 M1 checkout 一致）。 */
export function mealPeriodOf(date: Date = new Date()): string {
  const h = date.getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : "dinner";
}

/** 中文姓名脱敏：张* / 欧** ；空值原样返回。 */
export function maskName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed[0] + "*".repeat(trimmed.length - 1);
}

/** 月末日期（某月最后一天，1-31）。period=YYYY-MM。 */
export function lastDayOfPeriod(period: string): number {
  const parts = period.split("-");
  const y = Number(parts[0] ?? 1970);
  const m = Number(parts[1] ?? 1);
  // 下月 0 日 = 本月最后一天。
  return new Date(y, m, 0).getDate();
}

export interface ScopeLike {
  tenantId: string;
  parkId: string;
}

export function asScope(s: ScopeLike | TenantParkScope): ScopeLike {
  return { tenantId: s.tenantId, parkId: s.parkId };
}
