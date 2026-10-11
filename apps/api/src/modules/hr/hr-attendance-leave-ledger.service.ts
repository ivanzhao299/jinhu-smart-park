import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type { CreateHrLeaveQuotaDto, HrLeaveLedgerPageDto, HrLeaveQuotaListDto, PutHrLeaveQuotaDto, PutHrLeaveTypeDto } from "./dto/hr-attendance-leave-ledger.dto";

type TypeRow = { id: string; typeCode: string; typeName: string; enabled: boolean; version: number };
type QuotaRow = { id: string; employeeId: string; leaveTypeId: string; periodStart: string; periodEnd: string; openingMinutes: number; adjustmentMinutes: number; version: number };
const typeFields = `t.id,t.type_code "typeCode",t.type_name "typeName",t.enabled,t.version`;
const quotaFields = `q.id,q.employee_id "employeeId",q.leave_type_id "leaveTypeId",q.period_start::text "periodStart",q.period_end::text "periodEnd",q.opening_minutes "openingMinutes",q.adjustment_minutes "adjustmentMinutes",q.version`;
const historyActor = `COALESCE((SELECT display_name FROM sys_user u WHERE u.id=h.actor_user_id AND u.tenant_id=h.tenant_id AND u.park_id=h.park_id),'操作账号不可用') "actorName"`;

@Injectable()
export class HrAttendanceLeaveLedgerService {
 constructor(private readonly db: DataSource, private readonly audit: AuditService) {}
 private authorize(s: TenantParkScope, a: JwtPrincipal, catalog = false) {
  const has = (p: string) => Boolean(a.isSuper || a.permissions.includes("*") || a.permissions.includes(p));
  if (a.tenantId !== s.tenantId || a.parkId !== s.parkId ||
   !(has(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE) || catalog && [HR_PERMISSIONS.HR_ATTENDANCE_REQUEST, HR_PERMISSIONS.HR_ATTENDANCE_READ, HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ, HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ, HR_PERMISSIONS.HR_ATTENDANCE_APPROVE].some(has))) {
   throw new ForbiddenException("当前园区假期管理权限不足。");
  }
 }
 private async auditRead(s: TenantParkScope, a: JwtPrincipal, resource: string, count: number) {
  await this.audit.recordOperationRequired({ ...s, userId: a.sub, module: "人力资源管理", resource, action: "读取假期台账", bizType: resource, afterJson: { itemCount: count }, method: "GET", path: "/hr/attendance/leave-ledger", success: true, requestId: null });
 }
 private async page<T>(m: EntityManager, from: string, fields: string, params: unknown[], q: HrLeaveLedgerPageDto, order: string) {
  const [countRow] = await m.query(`SELECT count(*)::int count ${from}`, params) as Array<{ count: number }>;
  if (!countRow) throw new Error("Leave ledger count unavailable");
  const items = await m.query(`SELECT ${fields} ${from} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.page_size, (q.page - 1) * q.page_size]) as T[];
  return { items, total: countRow.count, page: q.page, page_size: q.page_size };
 }
 private async read<T>(work: (m: EntityManager) => Promise<T>) {
  return this.db.transaction("REPEATABLE READ", async m => { await m.query("SET TRANSACTION READ ONLY"); return work(m); });
 }
 async types(s: TenantParkScope, a: JwtPrincipal, q: HrLeaveLedgerPageDto) {
  this.authorize(s, a, true);
  const result = await this.read(m => this.page<TypeRow>(m, "FROM hr_attendance_leave_type t WHERE t.tenant_id=$1 AND t.park_id=$2", typeFields, [s.tenantId, s.parkId], q, "t.type_code,t.id"));
  await this.auditRead(s, a, "hr.attendance_leave_type", result.items.length); return result;
 }
 async typeHistory(s: TenantParkScope, a: JwtPrincipal, code: string, q: HrLeaveLedgerPageDto) {
  this.authorize(s, a);
  const result = await this.read(m => this.page(m, "FROM hr_attendance_leave_type_history h JOIN hr_attendance_leave_type t ON t.id=h.leave_type_id AND t.tenant_id=h.tenant_id AND t.park_id=h.park_id WHERE t.tenant_id=$1 AND t.park_id=$2 AND t.type_code=$3", `h.id,h.version,h.type_name "typeName",h.enabled,h.change_reason reason,h.occurred_at "occurredAt",${historyActor}`, [s.tenantId, s.parkId, code], q, "h.version DESC"));
  await this.auditRead(s, a, "hr.attendance_leave_type_history", result.items.length); return result;
 }
 async putType(s: TenantParkScope, a: JwtPrincipal, code: string, d: PutHrLeaveTypeDto) {
  this.authorize(s, a);
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(code) || !/\p{L}/u.test(d.typeName.replace(/\p{Default_Ignorable_Code_Point}/gu, "")) || !d.reason.trim()) throw new BadRequestException("请填写有效假期代码、名称和修改原因。");
  return this.db.transaction(async m => {
   await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["hr-leave-type", s.tenantId, s.parkId, code])]);
   const [before] = await m.query(`SELECT ${typeFields} FROM hr_attendance_leave_type t WHERE t.tenant_id=$1 AND t.park_id=$2 AND t.type_code=$3 FOR UPDATE`, [s.tenantId, s.parkId, code]) as TypeRow[];
   if ((before?.version ?? 0) !== d.expectedVersion) throw new ConflictException("假期类型已变化，请重新读取后核对。");
   const id = before?.id ?? randomUUID();
   const [saved] = await m.query(`INSERT INTO hr_attendance_leave_type AS t(id,tenant_id,park_id,type_code,type_name,enabled,version,updated_by) VALUES($1,$2,$3,$4,$5,$6,1,$7) ON CONFLICT(tenant_id,park_id,type_code) DO UPDATE SET type_name=EXCLUDED.type_name,enabled=EXCLUDED.enabled,version=t.version+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp() RETURNING ${typeFields}`, [id, s.tenantId, s.parkId, code, d.typeName.trim(), d.enabled, a.sub]) as TypeRow[];
   if (!saved) throw new Error("Leave type receipt unavailable");
   await m.query("INSERT INTO hr_attendance_leave_type_history(tenant_id,park_id,leave_type_id,version,type_name,enabled,change_reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [s.tenantId, s.parkId, id, saved.version, saved.typeName, saved.enabled, d.reason.trim(), a.sub]);
   await this.auditWrite(m, s, a, "hr.attendance_leave_type", id, before ?? null, saved, d.reason); return saved;
  });
 }
 async quotas(s: TenantParkScope, a: JwtPrincipal, q: HrLeaveQuotaListDto) {
  this.authorize(s, a);
  const params: unknown[] = [s.tenantId, s.parkId];
  const filter = q.employee_id ? (params.push(q.employee_id), " AND q.employee_id=$3") : "";
  const result = await this.read(m => this.page<QuotaRow & { employeeName: string; employeeCode: string; typeName: string }>(m,
   "FROM hr_attendance_leave_quota q JOIN hr_employee e ON e.id=q.employee_id AND e.tenant_id=q.tenant_id AND e.park_id=q.park_id AND NOT e.is_deleted JOIN hr_attendance_leave_type t ON t.id=q.leave_type_id AND t.tenant_id=q.tenant_id AND t.park_id=q.park_id WHERE q.tenant_id=$1 AND q.park_id=$2" + filter,
   quotaFields + `,e.full_name "employeeName",e.employee_code "employeeCode",t.type_name "typeName"`, params, q, "q.period_start DESC,q.id"));
  await this.auditRead(s, a, "hr.attendance_leave_quota", result.items.length); return result;
 }
 async quotaHistory(s: TenantParkScope, a: JwtPrincipal, id: string, q: HrLeaveLedgerPageDto) {
  this.authorize(s, a);
  const result = await this.read(m => this.page(m, "FROM hr_attendance_leave_quota_history h JOIN hr_attendance_leave_quota q ON q.id=h.quota_id AND q.tenant_id=h.tenant_id AND q.park_id=h.park_id JOIN hr_employee e ON e.id=q.employee_id AND e.tenant_id=q.tenant_id AND e.park_id=q.park_id AND NOT e.is_deleted WHERE q.tenant_id=$1 AND q.park_id=$2 AND q.id=$3",
   `h.id,h.version,h.opening_minutes "openingMinutes",h.adjustment_minutes "adjustmentMinutes",h.change_reason reason,h.occurred_at "occurredAt",${historyActor}`, [s.tenantId, s.parkId, id], q, "h.version DESC"));
  await this.auditRead(s, a, "hr.attendance_leave_quota_history", result.items.length); return result;
 }
 private quotaBody(d: { openingMinutes: number; adjustmentMinutes: number; reason: string }) {
  if (!Number.isInteger(d.openingMinutes) || d.openingMinutes < 0 || d.openingMinutes > 2147483647 || !Number.isInteger(d.adjustmentMinutes) || Math.abs(d.adjustmentMinutes) > 2147483647 || !d.reason.trim()) throw new BadRequestException("额度须为整分钟，期初非负，并填写修改原因。");
 }
 private async employee(m: EntityManager, s: TenantParkScope, id: string) {
  const rows = await m.query("SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted FOR UPDATE", [s.tenantId, s.parkId, id]);
  if (!rows.length) throw new NotFoundException("员工不可用或无权访问。");
 }
 async createQuota(s: TenantParkScope, a: JwtPrincipal, d: CreateHrLeaveQuotaDto) {
  this.authorize(s, a); this.quotaBody(d);
  const span = (Date.parse(d.periodEnd) - Date.parse(d.periodStart)) / 86400000;
  if (![d.periodStart, d.periodEnd].every(value => /^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) || span <= 0 || span > 366) throw new BadRequestException("额度区间须为有效日期，截止日不含当天，最多366天。");
  try { return await this.db.transaction(async m => {
   await this.employee(m, s, d.employeeId);
   const types = await m.query("SELECT id FROM hr_attendance_leave_type WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND enabled FOR SHARE", [s.tenantId, s.parkId, d.leaveTypeId]);
   if (!types.length) throw new ConflictException("假期类型不可用，请重新选择。");
   const [saved] = await m.query(`INSERT INTO hr_attendance_leave_quota AS q(tenant_id,park_id,employee_id,leave_type_id,period_start,period_end,opening_minutes,adjustment_minutes,version,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9) RETURNING ${quotaFields}`, [s.tenantId, s.parkId, d.employeeId, d.leaveTypeId, d.periodStart, d.periodEnd, d.openingMinutes, d.adjustmentMinutes, a.sub]) as QuotaRow[];
   if (!saved) throw new Error("Leave quota receipt unavailable");
   await this.recordQuota(m, s, a, saved, null, d.reason); return saved;
  }); } catch (error) { if ((error as { driverError?: { code?: string } }).driverError?.code === "23P01") throw new ConflictException("该员工此类假期已有重叠额度区间，请核对后调整。"); throw error; }
 }
 async putQuota(s: TenantParkScope, a: JwtPrincipal, id: string, d: PutHrLeaveQuotaDto) {
  this.authorize(s, a); this.quotaBody(d);
  return this.db.transaction(async m => {
   const [initial] = await m.query(`SELECT ${quotaFields} FROM hr_attendance_leave_quota q WHERE q.tenant_id=$1 AND q.park_id=$2 AND q.id=$3`, [s.tenantId, s.parkId, id]) as QuotaRow[];
   if (!initial) throw new NotFoundException("额度不存在或无权访问。");
   await this.employee(m, s, initial.employeeId);
   const [before] = await m.query(`SELECT ${quotaFields} FROM hr_attendance_leave_quota q WHERE q.tenant_id=$1 AND q.park_id=$2 AND q.id=$3 FOR UPDATE`, [s.tenantId, s.parkId, id]) as QuotaRow[];
   if (!before || before.version !== d.expectedVersion) throw new ConflictException("额度已变化，请重新读取后核对。");
   // PostgreSQL UPDATE returns a [rows, affected] tuple through TypeORM. A
   // SELECT over the changed row gives the same row-array contract as reads.
   const [saved] = await m.query(`WITH changed AS (UPDATE hr_attendance_leave_quota SET opening_minutes=$4,adjustment_minutes=$5,version=version+1,updated_by=$6,updated_at=clock_timestamp() WHERE tenant_id=$1 AND park_id=$2 AND id=$3 RETURNING *) SELECT ${quotaFields} FROM changed q`, [s.tenantId, s.parkId, id, d.openingMinutes, d.adjustmentMinutes, a.sub]) as QuotaRow[];
   if (!saved) throw new Error("Leave quota receipt unavailable");
   await this.recordQuota(m, s, a, saved, before, d.reason); return saved;
  });
 }
 private async recordQuota(m: EntityManager, s: TenantParkScope, a: JwtPrincipal, saved: QuotaRow, before: QuotaRow | null, reason: string) {
  await m.query("INSERT INTO hr_attendance_leave_quota_history(tenant_id,park_id,quota_id,version,opening_minutes,adjustment_minutes,change_reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [s.tenantId, s.parkId, saved.id, saved.version, saved.openingMinutes, saved.adjustmentMinutes, reason.trim(), a.sub]);
  await this.auditWrite(m, s, a, "hr.attendance_leave_quota", saved.id, before, saved, reason, before ? "PUT" : "POST");
 }
 private async auditWrite(m: EntityManager, s: TenantParkScope, a: JwtPrincipal, resource: string, id: string, before: Record<string, unknown> | null, saved: Record<string, unknown>, reason: string, method = "PUT") {
  const path = resource === "hr.attendance_leave_type" ? "/hr/attendance/leave-types/:code" : method === "POST" ? "/hr/attendance/leave-quotas" : "/hr/attendance/leave-quotas/:id";
  await this.audit.recordOperationRequired({ ...s, userId: a.sub, module: "人力资源管理", resource, action: "维护假期台账", bizType: resource, bizId: id, beforeJson: before, afterJson: { saved, reason: reason.trim() }, method, path, success: true, requestId: null }, m);
 }
}
