import type { HrLeaveQuota, HrLeaveType, PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";
export interface LeaveTypeChange { expectedVersion: number; typeName: string; enabled: boolean; reason: string }
export interface LeaveQuotaChange { expectedVersion: number; openingMinutes: number; adjustmentMinutes: number; reason: string }
export interface LeaveQuotaCreate extends Omit<LeaveQuotaChange, "expectedVersion"> { employeeId: string; leaveTypeId: string; periodStart: string; periodEnd: string }
export interface LeaveHistory { id: string; version: number; reason: string; occurredAt: string; actorName: string; typeName?: string; enabled?: boolean; openingMinutes?: number; adjustmentMinutes?: number }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const positive = (v: unknown): v is number => integer(v) && v > 0;
const day = (v: unknown): v is string => typeof v === "string" && /^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const type = (v: unknown): v is HrLeaveType => object(v) && text(v.id) && text(v.typeCode) && /^[A-Z][A-Z0-9_]{0,31}$/.test(v.typeCode) && text(v.typeName) && typeof v.enabled === "boolean" && positive(v.version);
const quota = (v: unknown): v is HrLeaveQuota => object(v) && text(v.id) && text(v.employeeId) && text(v.leaveTypeId) && day(v.periodStart) && day(v.periodEnd) && v.periodEnd > v.periodStart && integer(v.openingMinutes) && v.openingMinutes >= 0 && integer(v.adjustmentMinutes) && positive(v.version) && [v.employeeName, v.employeeCode, v.typeName].every(value => value === undefined || text(value));
function page<T>(v: unknown, row: (item: unknown) => item is T): PaginatedResult<T> {
 if (!object(v) || !integer(v.total) || v.total < 0 || !positive(v.page) || v.page_size !== 20 || !Array.isArray(v.items) || v.items.length > 20 || !v.items.every(row)) throw new Error("假期台账返回不完整，请重新读取。");
 return v as unknown as PaginatedResult<T>;
}
const history = (kind: "type" | "quota") => (v: unknown): v is LeaveHistory => object(v) && text(v.id) && positive(v.version) && text(v.reason) && text(v.actorName) && text(v.occurredAt) && Number.isFinite(Date.parse(v.occurredAt)) && (kind === "type" ? text(v.typeName) && typeof v.enabled === "boolean" : integer(v.openingMinutes) && v.openingMinutes >= 0 && integer(v.adjustmentMinutes));
const q = (pageNumber: number) => new URLSearchParams({ page: String(pageNumber), page_size: "20" });
const root = "/hr/attendance";
export const leaveLedgerApi = {
 async types(pageNumber: number, token?: string, signal?: AbortSignal) { return page((await apiRequest<unknown>(`${root}/leave-types?${q(pageNumber)}`, { token, signal })).data, type); },
 async quotas(pageNumber: number, employeeId: string, token?: string, signal?: AbortSignal) { const query = q(pageNumber); if (employeeId) query.set("employee_id", employeeId); return page((await apiRequest<unknown>(`${root}/leave-quotas?${query}`, { token, signal })).data, quota); },
 async history(kind: "type" | "quota", id: string, pageNumber: number, token?: string, signal?: AbortSignal) { const path = kind === "type" ? "leave-types" : "leave-quotas"; return page((await apiRequest<unknown>(`${root}/${path}/${encodeURIComponent(id)}/history?${q(pageNumber)}`, { token, signal })).data, history(kind)); },
 async putType(code: string, body: LeaveTypeChange, token: string | undefined, key: string) { const v = (await apiRequest<unknown>(`${root}/leave-types/${encodeURIComponent(code)}`, { method: "PUT", body, token, idempotencyKey: key })).data; if (!type(v) || v.typeCode !== code || v.version !== body.expectedVersion + 1 || v.typeName !== body.typeName.trim() || v.enabled !== body.enabled) throw new Error("类型保存回执不完整，请保持原表单重试。"); return v; },
 async createQuota(body: LeaveQuotaCreate, token: string | undefined, key: string) { const v = (await apiRequest<unknown>(`${root}/leave-quotas`, { method: "POST", body, token, idempotencyKey: key })).data; if (!quota(v) || v.employeeId !== body.employeeId || v.leaveTypeId !== body.leaveTypeId || v.periodStart !== body.periodStart || v.periodEnd !== body.periodEnd || v.openingMinutes !== body.openingMinutes || v.adjustmentMinutes !== body.adjustmentMinutes) throw new Error("额度保存回执不完整，请保持原表单重试。"); return v; },
 async putQuota(id: string, body: LeaveQuotaChange, token: string | undefined, key: string) { const v = (await apiRequest<unknown>(`${root}/leave-quotas/${encodeURIComponent(id)}`, { method: "PUT", body, token, idempotencyKey: key })).data; if (!quota(v) || v.id !== id || v.version !== body.expectedVersion + 1 || v.openingMinutes !== body.openingMinutes || v.adjustmentMinutes !== body.adjustmentMinutes) throw new Error("额度保存回执不完整，请保持原表单重试。"); return v; },
};
