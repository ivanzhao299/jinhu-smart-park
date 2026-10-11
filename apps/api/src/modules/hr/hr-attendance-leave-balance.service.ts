import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS as P, type HrLeaveBalanceEmployee, type HrLeaveBalanceReport, type HrLeaveBalanceSources, type HrLeaveQuota, type HrLeaveType, type TenantParkScope } from "@jinhu/shared";
import { createHash } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { HR_MANAGED_EMPLOYEE_IDS_SQL, resolveHrAttendanceAccessScope } from "./hr-access-policy";
import { calculateLeaveBalances, type ClassifiedLeaveSource } from "./hr-attendance-leave-balance";
import type { LeaveCancellationFact } from "./hr-attendance-leave-cancellation-effect";
import type { HrLeaveBalanceEmployeeQueryDto, HrLeaveBalanceQueryDto } from "./dto/hr-attendance-leave-ledger.dto";

type EmployeeRow = { id: string; employeeCode: string; employeeName: string; userId: string | null };
type RequestRow = ClassifiedLeaveSource & { version: number; requestNo: string; leaveTypeVersion: number | null };
type CutRow = LeaveCancellationFact & { id: string; version: number; cancellationNo: string };
type ScheduleRow = { id: string; version: number; workDate: string; shiftId: string; shiftVersion: number | null; startAt: Date | null; endAt: Date | null };
const employeeFields = `e.id,e.employee_code "employeeCode",e.full_name "employeeName",e.user_id "userId"`;

@Injectable()
export class HrAttendanceLeaveBalanceService {
 constructor(private readonly db: DataSource, private readonly audit: AuditService) {}
 private has(a: JwtPrincipal, permission: string) { return Boolean(a.isSuper || a.permissions.includes("*") || a.permissions.includes(permission)); }
 private async access(m: EntityManager, s: TenantParkScope, a: JwtPrincipal) {
  if (s.tenantId !== a.tenantId || s.parkId !== a.parkId) throw new ForbiddenException("当前园区不匹配。");
  const scope = resolveHrAttendanceAccessScope(a), operator = this.has(a, P.HR_ATTENDANCE_OPERATE), requester = this.has(a, P.HR_ATTENDANCE_REQUEST);
  if (scope === "none" && !operator && !requester) throw new ForbiddenException("没有假期余额读取权限。");
  const self = await m.query(`SELECT ${employeeFields} FROM hr_employee e WHERE e.tenant_id=$1 AND e.park_id=$2 AND e.user_id=$3 AND NOT e.is_deleted`, [s.tenantId, s.parkId, a.sub]) as EmployeeRow[];
  if (self.length > 1) throw new ConflictException("员工关联不唯一，请核对后查看。");
  const selfId = self[0]?.id ?? null;
  if (scope === "park" || operator) return { selfId, ids: null as string[] | null };
  const ids = scope === "managed_org_tree" && selfId ? (await m.query(HR_MANAGED_EMPLOYEE_IDS_SQL, [s.tenantId, s.parkId, a.sub, selfId]) as Array<{ id: string }>).map(row => row.id) : [];
  if (selfId && (scope === "self" || requester || this.has(a, P.HR_ATTENDANCE_SELF_READ))) ids.push(selfId);
  return { selfId, ids: [...new Set(ids)] };
 }
 private async read<T>(work: (m: EntityManager) => Promise<T>) {
  return this.db.transaction("REPEATABLE READ", async m => { await m.query("SET TRANSACTION READ ONLY"); return work(m); });
 }
 private async record(s: TenantParkScope, a: JwtPrincipal, path: string, count: number) {
  await this.audit.recordOperationRequired({ ...s, userId: a.sub, module: "人力资源管理", resource: "hr.attendance_leave_balance", action: "读取员工假期余额", bizType: "hr_attendance_leave_balance", afterJson: { itemCount: count }, method: "GET", path, success: true, requestId: null });
 }
 async employees(s: TenantParkScope, a: JwtPrincipal, q: HrLeaveBalanceEmployeeQueryDto) {
  const result = await this.read(async m => {
   const access = await this.access(m, s, a), params: unknown[] = [s.tenantId, s.parkId];
   let from = "FROM hr_employee e WHERE e.tenant_id=$1 AND e.park_id=$2 AND NOT e.is_deleted";
   if (access.ids !== null) { params.push(access.ids); from += ` AND e.id=ANY($${params.length}::uuid[])`; }
   if (q.keyword?.trim()) { params.push(`%${q.keyword.trim()}%`); from += ` AND (e.employee_code ILIKE $${params.length} OR e.full_name ILIKE $${params.length})`; }
   const [count] = await m.query(`SELECT count(*)::int n ${from}`, params) as Array<{ n: number }>;
   if (!count) throw new Error("Leave balance employee count unavailable");
   const rows = await m.query(`SELECT ${employeeFields} ${from} ORDER BY e.employee_code,e.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.page_size, (q.page - 1) * q.page_size]) as EmployeeRow[];
   return { items: rows.map(row => this.employee(row, access.selfId)), total: count.n, page: q.page, page_size: q.page_size };
  });
  await this.record(s, a, "/hr/attendance/leave-balance-employees", result.items.length); return result;
 }
 private employee(row: EmployeeRow, selfId: string | null): HrLeaveBalanceEmployee {
  return { id: row.id, employeeCode: row.employeeCode, employeeName: row.employeeName, isSelf: row.id === selfId };
 }
 private range(q: HrLeaveBalanceQueryDto) {
  const valid = (value: string) => /^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const days = (Date.parse(q.to) - Date.parse(q.from)) / 86400000;
  if (!valid(q.from) || !valid(q.to) || days < 1 || days > 366) throw new BadRequestException("请选择有效余额区间，截止日不含当天，最多366天。");
  return { from: new Date(`${q.from}T00:00:00+08:00`), to: new Date(`${q.to}T00:00:00+08:00`), days };
 }
 async report(s: TenantParkScope, a: JwtPrincipal, q: HrLeaveBalanceQueryDto): Promise<HrLeaveBalanceReport> {
  const range = this.range(q);
  const result = await this.read(async m => {
   const access = await this.access(m, s, a), employeeId = q.employee_id ?? access.selfId;
   if (!employeeId) throw new BadRequestException("请先选择要查看的员工。");
   if (access.ids !== null && !access.ids.includes(employeeId)) throw new NotFoundException("员工不存在或无权查看。");
   const [employee] = await m.query(`SELECT ${employeeFields} FROM hr_employee e WHERE e.tenant_id=$1 AND e.park_id=$2 AND e.id=$3 AND NOT e.is_deleted`, [s.tenantId, s.parkId, employeeId]) as EmployeeRow[];
   if (!employee) throw new NotFoundException("员工不存在或无权查看。");
   const types = await m.query(`SELECT id,type_code "typeCode",type_name "typeName",enabled,version FROM hr_attendance_leave_type WHERE tenant_id=$1 AND park_id=$2 ORDER BY type_code,id`, [s.tenantId, s.parkId]) as HrLeaveType[];
   const quotas = await m.query(`SELECT id,employee_id "employeeId",leave_type_id "leaveTypeId",period_start::text "periodStart",period_end::text "periodEnd",opening_minutes "openingMinutes",adjustment_minutes "adjustmentMinutes",version FROM hr_attendance_leave_quota WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND period_start=$4 AND period_end>=$5 ORDER BY leave_type_id,id`, [s.tenantId, s.parkId, employeeId, q.from, q.to]) as HrLeaveQuota[];
   const schedules = await m.query(`SELECT s.id,s.version,s.work_date::text "workDate",s.shift_id "shiftId",t.version "shiftVersion",
    (s.work_date+t.start_local) AT TIME ZONE 'Asia/Shanghai' "startAt",
    (s.work_date+t.end_local+CASE WHEN t.crosses_midnight THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE 'Asia/Shanghai' "endAt"
    FROM hr_employee_schedule s LEFT JOIN hr_attendance_shift t ON t.tenant_id=s.tenant_id AND t.park_id=s.park_id AND t.id=s.shift_id AND NOT t.is_deleted
    WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.employee_id=$3 AND NOT s.is_deleted AND s.work_date>=$4::date-1 AND s.work_date<$5 ORDER BY s.work_date,s.id`, [s.tenantId, s.parkId, employeeId, q.from, q.to]) as ScheduleRow[];
   const requests = await m.query(`SELECT r.id,r.version,r.request_no "requestNo",r.request_type "requestType",r.status,r.start_at "startAt",r.end_at "endAt",r.leave_type_id "leaveTypeId",r.leave_type_version "leaveTypeVersion"
    FROM hr_attendance_request r WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.employee_id=$3 AND NOT r.is_deleted AND r.request_type='leave' AND r.status='approved'
     AND (r.start_at IS NULL OR r.end_at IS NULL OR r.start_at<$5 AND r.end_at>$4) ORDER BY r.id`, [s.tenantId, s.parkId, employeeId, range.from, range.to]) as RequestRow[];
   const cuts = await m.query(`SELECT id,version,cancellation_no "cancellationNo",source_request_id "sourceRequestId",status,start_at "startAt",end_at "endAt" FROM hr_attendance_leave_cancellation
    WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND status='approved' AND source_request_id=ANY($4::uuid[]) ORDER BY id`, [s.tenantId, s.parkId, employeeId, requests.map(row => row.id)]) as CutRow[];
   const covered = new Set(schedules.filter(row => row.startAt && row.endAt).map(row => row.workDate));
   const missingScheduleDates = Array.from({ length: range.days }, (_, index) => new Date(Date.parse(q.from) + index * 86400000).toISOString().slice(0, 10)).filter(day => !covered.has(day));
   const quotaMap = new Map(quotas.map(row => [row.leaveTypeId, row]));
   let calculated: ReturnType<typeof calculateLeaveBalances>;
   try {
    calculated = calculateLeaveBalances({ ...range, scheduleCoverageComplete: missingScheduleDates.length === 0, sourceCoverageComplete: true,
     schedules: schedules.filter((row): row is ScheduleRow & { startAt: Date; endAt: Date } => row.startAt !== null && row.endAt !== null),
     sources: requests, cancellations: cuts, openings: types.map(type => ({ leaveTypeId: type.id, openingMinutes: quotaMap.get(type.id)?.openingMinutes ?? null, adjustmentMinutes: quotaMap.get(type.id)?.adjustmentMinutes ?? 0 })) });
   } catch (error) {
    if (error instanceof Error && /^(LEAVE_BALANCE_|ATTENDANCE_LEAVE_CANCELLATION_INVALID_FACT)/.test(error.message)) throw new ConflictException("该区间有无法准确计算的排班或请假来源，请核对其时段、分类和分钟数量。");
    throw error;
   }
   const sources: HrLeaveBalanceSources = {
    schedules: schedules.map(({ id, version, workDate, shiftId, shiftVersion }) => ({ id, version, workDate, shiftId, shiftVersion })),
    requests: requests.map(({ id, version, requestNo, leaveTypeId, leaveTypeVersion }) => ({ id, version, requestNo, leaveTypeId, leaveTypeVersion })),
    cancellations: cuts.map(({ id, version, cancellationNo, sourceRequestId }) => ({ id, version, cancellationNo, sourceRequestId })),
    quotas: quotas.map(({ id, version, leaveTypeId }) => ({ id, version, leaveTypeId })),
   };
   const items = calculated.items.map((row, index) => ({ ...row, typeCode: types[index]!.typeCode, typeName: types[index]!.typeName, enabled: types[index]!.enabled,
    quotaId: quotaMap.get(row.leaveTypeId)?.id ?? null, quotaVersion: quotaMap.get(row.leaveTypeId)?.version ?? null, adjustmentMinutes: quotaMap.get(row.leaveTypeId)?.adjustmentMinutes ?? null }));
   const [observed] = await m.query(`SELECT transaction_timestamp() "observedAt"`) as Array<{ observedAt: Date }>;
   if (!observed) throw new Error("Leave balance observation unavailable");
   return { employee: this.employee(employee, access.selfId), from: q.from, to: q.to, timezone: "Asia/Shanghai" as const, observedAt: observed.observedAt.toISOString(), basis: "registered_system_facts" as const,
    basisHash: createHash("sha256").update(JSON.stringify({ employeeId, from: q.from, to: q.to, types, quotas, schedules, requests, cuts })).digest("hex"),
    missingScheduleDates, unclassifiedMinutes: calculated.unclassifiedMinutes, undatedApprovedRequestCount: requests.filter(row => !row.startAt || !row.endAt).length, sources,
    items: items.slice((q.page - 1) * q.page_size, q.page * q.page_size), total: items.length, page: q.page, page_size: q.page_size };
  });
  await this.record(s, a, "/hr/attendance/leave-balances", result.items.length); return result;
 }
}
