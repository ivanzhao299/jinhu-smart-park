import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { HrService } from "./hr.service";
import type { HrLeaveLedgerPageDto } from "./dto/hr-attendance-leave-ledger.dto";
import type { PutHrEmployeeRestDayDto } from "./dto/hr-employee-rest-day.dto";
type RestDay = { id: string; employeeId: string; workDate: string; isRest: boolean; version: number; updatedAt: Date };
const fields = `id,employee_id "employeeId",work_date::text "workDate",is_rest "isRest",version,updated_at "updatedAt"`;
@Injectable()
export class HrEmployeeRestDayService {
 constructor(private readonly db: DataSource, private readonly audit: AuditService, private readonly hr: HrService) {}
 private authorize(s: TenantParkScope, a: JwtPrincipal, day: string) {
  if (s.tenantId !== a.tenantId || s.parkId !== a.parkId || !(a.isSuper || a.permissions.includes("*") || a.permissions.includes(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE))) throw new ForbiddenException("当前园区考勤操作权限不足。");
  if (!/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new BadRequestException("请选择1900至2199年的有效工作日期。");
 }
 private async employee(m: EntityManager, s: TenantParkScope, id: string, lock = false) {
  const rows = await m.query(`SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted${lock ? " FOR UPDATE" : ""}`, [s.tenantId, s.parkId, id]);
  if (!rows.length) throw new NotFoundException("员工不存在或无权访问。");
 }
 private recordRead(s: TenantParkScope, a: JwtPrincipal, count: number) { return this.audit.recordOperationRequired({ ...s, userId: a.sub, module: "人力资源管理", resource: "hr.employee_rest_day", action: "读取个人休息安排", bizType: "hr_employee_rest_day", afterJson: { itemCount: count }, method: "GET", path: "/hr/attendance/employee-rest-days/:employeeId/:date", success: true, requestId: null }); }
 async get(s: TenantParkScope, a: JwtPrincipal, employeeId: string, date: string) {
  this.authorize(s, a, date);
  const result = await this.db.transaction("REPEATABLE READ", async m => { await m.query("SET TRANSACTION READ ONLY"); await this.employee(m, s, employeeId); const rows = await m.query(`SELECT ${fields} FROM hr_employee_rest_day WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND work_date=$4`, [s.tenantId, s.parkId, employeeId, date]) as RestDay[]; return rows[0] ?? null; });
  await this.recordRead(s, a, result ? 1 : 0); return result;
 }
 async history(s: TenantParkScope, a: JwtPrincipal, employeeId: string, date: string, q: HrLeaveLedgerPageDto) {
  this.authorize(s, a, date);
  const result = await this.db.transaction("REPEATABLE READ", async m => {
   await m.query("SET TRANSACTION READ ONLY"); await this.employee(m, s, employeeId);
   const from = "FROM hr_employee_rest_day_history h JOIN hr_employee_rest_day d ON d.tenant_id=h.tenant_id AND d.park_id=h.park_id AND d.id=h.rest_day_id WHERE d.tenant_id=$1 AND d.park_id=$2 AND d.employee_id=$3 AND d.work_date=$4", params = [s.tenantId, s.parkId, employeeId, date];
   const [count] = await m.query(`SELECT count(*)::int n ${from}`, params) as Array<{ n: number }>; if (!count) throw new Error("Rest-day history count unavailable");
   const items = await m.query(`SELECT h.id,h.version,h.is_rest "isRest",h.change_reason reason,h.occurred_at "occurredAt",COALESCE((SELECT display_name FROM sys_user u WHERE u.tenant_id=h.tenant_id AND u.park_id=h.park_id AND u.id=h.actor_user_id),'操作账号不可用') "actorName" ${from} ORDER BY h.version DESC LIMIT $5 OFFSET $6`, [...params, q.page_size, (q.page - 1) * q.page_size]);
   return { items, total: count.n, page: q.page, page_size: q.page_size };
  }); await this.recordRead(s, a, result.items.length); return result;
 }
 async put(s: TenantParkScope, a: JwtPrincipal, employeeId: string, date: string, d: PutHrEmployeeRestDayDto) {
  this.authorize(s, a, date); if (!d.reason.trim()) throw new BadRequestException("请填写办理原因。");
  try { return await this.db.transaction(async m => {
   await this.hr.prepareEmployeeRestDayChange(m, s, date, a.sub); await this.employee(m, s, employeeId, true);
   const params = [s.tenantId, s.parkId, employeeId, date];
   const [before] = await m.query(`SELECT ${fields} FROM hr_employee_rest_day WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND work_date=$4 FOR UPDATE`, params) as RestDay[];
   if ((before?.version ?? 0) !== d.expectedVersion) throw new ConflictException("休息安排已变化，请重新读取并核对。");
   if (d.isRest && (await m.query("SELECT id FROM hr_employee_schedule WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND work_date=$4 AND NOT is_deleted", params)).length) throw new ConflictException("该工作日期已有排班，不能同时登记休息。");
   const [saved] = await m.query(`INSERT INTO hr_employee_rest_day AS r(id,tenant_id,park_id,employee_id,work_date,is_rest,version,updated_by) VALUES($1,$2,$3,$4,$5,$6,1,$7) ON CONFLICT(tenant_id,park_id,employee_id,work_date) DO UPDATE SET is_rest=EXCLUDED.is_rest,version=r.version+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp() RETURNING ${fields}`, [before?.id ?? randomUUID(), ...params, d.isRest, a.sub]) as RestDay[];
   if (!saved) throw new Error("Rest-day write receipt unavailable");
   await m.query("INSERT INTO hr_employee_rest_day_history(tenant_id,park_id,rest_day_id,version,is_rest,change_reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)", [s.tenantId, s.parkId, saved.id, saved.version, saved.isRest, d.reason.trim(), a.sub]);
   await this.audit.recordOperationRequired({ ...s, userId: a.sub, module: "人力资源管理", resource: "hr.employee_rest_day", action: "登记个人休息安排", bizType: "hr_employee_rest_day", bizId: saved.id, beforeJson: before ?? null, afterJson: { ...saved, reason: d.reason.trim() }, method: "PUT", path: "/hr/attendance/employee-rest-days/:employeeId/:date", success: true, requestId: null }, m); return saved;
  }); } catch (error) { if ((error as { driverError?: { code?: string; message?: string } }).driverError?.code === "23514" && (error as { driverError: { message: string } }).driverError.message.includes("conflicts with schedule")) throw new ConflictException("该工作日期已有排班，不能同时登记休息。"); throw error; }
 }
}
