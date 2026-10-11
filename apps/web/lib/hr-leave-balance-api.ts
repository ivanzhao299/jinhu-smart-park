import { HR_LEAVE_BALANCE_BLOCKERS, type HrLeaveBalanceEmployee, type HrLeaveBalanceReport, type PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const nullableNumber = (v: unknown) => v === null || integer(v);
const nullableText = (v: unknown) => v === null || text(v);
const nonnegative = (v: unknown) => v === null || integer(v) && v >= 0;
const version = (v: unknown) => v === null || integer(v) && v > 0;
const date = (v: unknown) => typeof v === "string" && /^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const employee = (v: unknown): v is HrLeaveBalanceEmployee => object(v) && text(v.id) && text(v.employeeCode) && text(v.employeeName) && typeof v.isSelf === "boolean";
const paged = (v: Record<string, unknown>) => integer(v.total) && v.total >= 0 && integer(v.page) && v.page > 0 && integer(v.page_size) && v.page_size > 0 && Array.isArray(v.items) && v.items.length <= v.page_size;
export function decodeLeaveBalanceEmployees(v: unknown): PaginatedResult<HrLeaveBalanceEmployee> {
 if (!object(v) || !paged(v) || !Array.isArray(v.items) || !v.items.every(employee)) throw new Error("假期员工列表返回不完整，请重试。");
 return v as unknown as PaginatedResult<HrLeaveBalanceEmployee>;
}
export function decodeLeaveBalanceReport(v: unknown): HrLeaveBalanceReport {
 if (!object(v) || !paged(v) || !employee(v.employee) || !date(v.from) || !date(v.to) || v.timezone !== "Asia/Shanghai" || v.basis !== "registered_system_facts"
  || !text(v.observedAt) || !Number.isFinite(Date.parse(v.observedAt)) || typeof v.basisHash !== "string" || !/^[a-f0-9]{64}$/.test(v.basisHash)
  || !integer(v.unclassifiedMinutes) || v.unclassifiedMinutes < 0 || !integer(v.undatedApprovedRequestCount) || v.undatedApprovedRequestCount < 0
  || !Array.isArray(v.missingScheduleDates) || !v.missingScheduleDates.every(date) || !object(v.sources)
  || !Array.isArray(v.sources.restDays) || !v.sources.restDays.every(row => object(row) && text(row.id) && integer(row.version) && row.version > 0 && date(row.workDate) && typeof row.isRest === "boolean")
  || !Array.isArray(v.sources.schedules) || !v.sources.schedules.every(row => object(row) && text(row.id) && integer(row.version) && date(row.workDate) && text(row.shiftId) && nullableNumber(row.shiftVersion))
  || !Array.isArray(v.sources.requests) || !v.sources.requests.every(row => object(row) && text(row.id) && integer(row.version) && text(row.requestNo) && nullableText(row.leaveTypeId) && nullableNumber(row.leaveTypeVersion))
  || !Array.isArray(v.sources.cancellations) || !v.sources.cancellations.every(row => object(row) && text(row.id) && integer(row.version) && text(row.cancellationNo) && text(row.sourceRequestId))
  || !Array.isArray(v.sources.quotas) || !v.sources.quotas.every(row => object(row) && text(row.id) && integer(row.version) && text(row.leaveTypeId))
  || !Array.isArray(v.items) || !v.items.every(row => object(row) && text(row.leaveTypeId) && text(row.typeCode) && text(row.typeName) && typeof row.enabled === "boolean"
   && nullableText(row.quotaId) && version(row.quotaVersion) && nonnegative(row.openingMinutes) && nullableNumber(row.adjustmentMinutes) && integer(row.observedMinutes) && row.observedMinutes >= 0
   && nonnegative(row.consumedMinutes) && nullableNumber(row.balanceMinutes) && Array.isArray(row.blockers) && row.blockers.every(code => HR_LEAVE_BALANCE_BLOCKERS.some(known => known === code))
   && (row.openingMinutes !== null && row.blockers.length === 0 || row.balanceMinutes === null))) {
  throw new Error("假期余额返回不完整，请重新读取，不能按零处理。");
 }
 return v as unknown as HrLeaveBalanceReport;
}
export const leaveBalanceApi = {
 async employees(page: number, keyword: string, token: string | undefined, signal?: AbortSignal) {
  const q = new URLSearchParams({ page: String(page), page_size: "20" }); if (keyword) q.set("keyword", keyword);
  return decodeLeaveBalanceEmployees((await apiRequest<unknown>(`/hr/attendance/leave-balance-employees?${q}`, { token, signal })).data);
 },
 async report(employeeId: string, from: string, to: string, page: number, token: string | undefined, signal?: AbortSignal) {
  const q = new URLSearchParams({ employee_id: employeeId, from, to, page: String(page), page_size: "20" });
  return decodeLeaveBalanceReport((await apiRequest<unknown>(`/hr/attendance/leave-balances?${q}`, { token, signal })).data);
 },
};
