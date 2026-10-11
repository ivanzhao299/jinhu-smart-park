import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { DataSource, type EntityManager } from "typeorm";
import { HR_PERMISSIONS as P } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
import * as entities from "./entities/hr.entities";
import { HrService } from "./hr.service";
import { HrAttendanceLeaveLedgerService } from "./hr-attendance-leave-ledger.service";
import { HrAttendanceLeaveCancellationService } from "./hr-attendance-leave-cancellation.service";
import { HrAttendanceLeaveBalanceService } from "./hr-attendance-leave-balance.service";

const enabled = process.env.HR_LEAVE_LEDGER_PG === "1";
if (enabled) {
 assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15432");
 assert.equal(process.env.HR_LEAVE_LEDGER_ISOLATED, "yes");
 assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_review_leave_ledger_[a-f0-9]{8}$/);
 assert.ok(process.env.POSTGRES_PASSWORD);
}
(enabled ? describe : describe.skip)("Leave type/quota and request/cancellation PostgreSQL workflow", () => {
 let db: DataSource, ledger: HrAttendanceLeaveLedgerService, hr: HrService, cancel: HrAttendanceLeaveCancellationService, balance: HrAttendanceLeaveBalanceService;
 let failAudit = false, typeId = "", quotaId = "";
 const scope = { tenantId: "10000001", parkId: "20000001" }, adminId = randomUUID(), ownerId = randomUUID(), employeeId = randomUUID();
 const actor = (sub: string, permissions: string[]): JwtPrincipal => ({ ...scope, sub, username: "synthetic-leave", roles: [], permissions });
 const admin = actor(adminId, [P.HR_ATTENDANCE_OPERATE, P.HR_ATTENDANCE_READ, P.HR_ATTENDANCE_APPROVE]);
 const owner = actor(ownerId, [P.HR_ATTENDANCE_REQUEST, P.HR_ATTENDANCE_SELF_READ]);
 const page = { page: 1, page_size: 20 };
 before(async () => {
  db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15432, username: "jinhu", password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, entities: Object.values(entities).filter(value => typeof value === "function") }); await db.initialize();
  await db.query("CREATE TABLE leave_ledger_gate_audit(event jsonb NOT NULL)");
  for (const id of [adminId, ownerId]) await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1::uuid,$2,$3,$1::text,'Synthetic account','not-a-login-hash')", [id, scope.tenantId, scope.parkId]);
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status) VALUES($1,$2,$3,'LEAVE-QUOTA-GATE','Synthetic employee',$4,'active')", [employeeId, scope.tenantId, scope.parkId, ownerId]);
  const audit = { recordOperationRequired: async (event: { method: string }, m?: EntityManager) => {
   if (failAudit) throw new Error("Synthetic required audit failure");
   if (event.method !== "GET") { assert.ok(m); await m.query("INSERT INTO leave_ledger_gate_audit(event) VALUES($1::jsonb)", [JSON.stringify(event)]); }
  } } as unknown as AuditService;
  ledger = new HrAttendanceLeaveLedgerService(db, audit);
  balance = new HrAttendanceLeaveBalanceService(db, audit);
  const args = Array(33).fill(undefined); args[0] = db.getRepository(entities.HrEmployeeEntity); args[18] = db.getRepository(entities.HrApprovalRequestEntity); args[26] = db.getRepository(entities.HrAttendanceRequestEntity); args[29] = { publishAttendanceRequestSubmitted: async () => undefined, publishAttendanceRequestReviewed: async () => undefined }; args[30] = db; args[31] = audit;
  hr = Reflect.construct(HrService, args) as HrService; cancel = new HrAttendanceLeaveCancellationService(db, audit, hr);
 });
 after(async () => { if (db?.isInitialized) await db.destroy(); });
 const putType = (version: number, enabled = true) => ledger.putType(scope, admin, "ANNUAL", { expectedVersion: version, typeName: `合成年假${version + 1}`, enabled, reason: "合成配置核对" });
 it("creates explicit type, separates catalog permission from quota authority, and preserves unknown absence", async () => {
  assert.equal((await ledger.types(scope, owner, page)).total, 0); assert.equal((await ledger.quotas(scope, admin, page)).total, 0);
  const saved = await putType(0); typeId = saved.id; assert.equal(saved.version, 1);
  assert.equal((await ledger.types(scope, owner, page)).items[0]!.typeName, "合成年假1");
  await assert.rejects(ledger.quotas(scope, owner, page), /权限不足/); await assert.rejects(putType(0), /已变化/);
 });
 it("serializes concurrent type CAS and keeps every immutable version", async () => {
  const results = await Promise.allSettled([putType(1), putType(1)]); assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await ledger.typeHistory(scope, admin, "ANNUAL", page)).total, 2);
  await assert.rejects(db.query("UPDATE hr_attendance_leave_type_history SET enabled=false WHERE leave_type_id=$1", [typeId]), /append-only/);
 });
 it("required audit failure rolls back type/current/history together", async () => {
  failAudit = true; try { await assert.rejects(putType(2), /audit failure/); } finally { failAudit = false; }
  assert.equal((await ledger.types(scope, admin, page)).items[0]!.version, 2); assert.equal((await ledger.typeHistory(scope, admin, "ANNUAL", page)).total, 2);
 });
 const quota = () => ({ employeeId, leaveTypeId: typeId, periodStart: "2026-07-01", periodEnd: "2026-08-01", openingMinutes: 0, adjustmentMinutes: 0, reason: "合成期初核对" });
 it("stores explicit zero opening, rejects overlapping periods and allows touching periods", async () => {
  const saved = await ledger.createQuota(scope, admin, quota()); quotaId = saved.id; assert.equal(saved.openingMinutes, 0);
  await assert.rejects(ledger.createQuota(scope, admin, { ...quota(), periodStart: "2026-07-15" }), /重叠/);
  await ledger.createQuota(scope, admin, { ...quota(), periodStart: "2026-08-01", periodEnd: "2026-09-01" });
  assert.equal((await ledger.quotas(scope, admin, { ...page, employee_id: employeeId })).total, 2);
 });
 it("quota CAS has one winner, audit rollback and append-only paged history", async () => {
  const write = (version: number) => ledger.putQuota(scope, admin, quotaId, { expectedVersion: version, openingMinutes: 480, adjustmentMinutes: -60, reason: "合成额度调整" });
  const results = await Promise.allSettled([write(1), write(1)]); assert.equal(results.filter(r => r.status === "fulfilled").length, 1,
   results.map(r => r.status === "rejected" ? String(r.reason) : "committed").join("; "));
  failAudit = true; try { await assert.rejects(write(2), /audit failure/); } finally { failAudit = false; }
  assert.equal((await ledger.quotaHistory(scope, admin, quotaId, page)).total, 2);
  for (let version = 2; version < 23; version++) await write(version);
  const first = await ledger.quotaHistory(scope, admin, quotaId, page), second = await ledger.quotaHistory(scope, admin, quotaId, { ...page, page: 2 });
  assert.equal(first.total, 23); assert.equal(first.items.length, 20); assert.equal(second.items.length, 3);
  await assert.rejects(db.query("DELETE FROM hr_attendance_leave_quota_history WHERE quota_id=$1", [quotaId]), /append-only/);
 });
 it("foreign scopes return no ledger rows and reject cross-scope actors or foreign employees", async () => {
  const foreign = { ...scope, parkId: "another-park" }, foreignActor = { ...admin, ...foreign };
  assert.equal((await ledger.quotas(foreign, foreignActor, page)).total, 0);
  assert.equal((await ledger.quotaHistory(foreign, foreignActor, quotaId, page)).total, 0);
  await assert.rejects(ledger.types(foreign, admin, page), /权限不足/);
  await assert.rejects(ledger.createQuota(foreign, foreignActor, quota()), /员工不可用/);
 });
 it("request classification freezes type history, supports omission/clear and preserves original approval and cancellation", async () => {
  const input = { requestType: "leave", startAt: "2028-01-15T09:00:00+08:00", endAt: "2028-01-15T17:00:00+08:00", reason: "Synthetic classified leave", leaveTypeId: typeId, expectedLeaveTypeVersion: 2 };
  const created = await hr.createAttendanceRequest(scope, owner, input); assert.equal(created.leaveTypeName, "合成年假2");
  await putType(2, false);
  const changed = await hr.updateAttendanceRequest(scope, owner, created.id, { ...input, expectedVersion: created.editVersion!, reason: "Synthetic timing correction" });
  assert.equal(changed.leaveTypeVersion, 2); assert.equal(changed.leaveTypeName, "合成年假2");
  await assert.rejects(db.query("UPDATE hr_attendance_request SET leave_type_name='forged' WHERE id=$1", [created.id]), /foreign key/);
  await assert.rejects(hr.createAttendanceRequest(scope, owner, input), /停用/);
  failAudit = true;
  try { await assert.rejects(hr.updateAttendanceRequest(scope, owner, created.id, { requestType: "leave", startAt: input.startAt, endAt: input.endAt, reason: "Synthetic clear rollback", leaveTypeId: null, expectedVersion: changed.editVersion! }), /audit failure/); }
  finally { failAudit = false; }
  assert.equal((await db.getRepository(entities.HrAttendanceRequestEntity).findOneByOrFail({ ...scope, id: created.id })).leaveTypeVersion, 2);
  const cleared = await hr.updateAttendanceRequest(scope, owner, created.id, { requestType: "leave", startAt: input.startAt, endAt: input.endAt, reason: "Synthetic clear", leaveTypeId: null, expectedVersion: changed.editVersion! }); assert.equal(cleared.leaveTypeId, null);
  await putType(3);
  const restored = await hr.updateAttendanceRequest(scope, owner, created.id, { ...input, expectedLeaveTypeVersion: 4, expectedVersion: cleared.editVersion! });
  const preserved = await hr.updateAttendanceRequest(scope, owner, created.id, { requestType: "leave", startAt: input.startAt, endAt: input.endAt, reason: "Synthetic omit type", expectedVersion: restored.editVersion! }); assert.equal(preserved.leaveTypeVersion, 4);
  await hr.submitAttendanceRequest(scope, owner, created.id); await hr.reviewAttendanceRequest(scope, admin, created.id, "approve", {});
  const approved = await db.getRepository(entities.HrAttendanceRequestEntity).findOneByOrFail({ ...scope, id: created.id }); assert.equal(approved.leaveTypeVersion, 4);
  await assert.rejects(db.query("UPDATE hr_attendance_request SET leave_type_id=NULL,leave_type_version=NULL,leave_type_name=NULL WHERE id=$1", [created.id]), /immutable/);
  const cut = await cancel.create(scope, owner, { sourceRequestId: created.id, expectedSourceVersion: approved.version, startAt: "2028-01-15T10:00:00+08:00", endAt: "2028-01-15T11:00:00+08:00", reason: "Synthetic return" });
  const submitted = await cancel.act(scope, owner, cut.id, { expectedVersion: cut.version, action: "submit" });
  await cancel.act(scope, admin, cut.id, { expectedVersion: submitted.version, action: "approve" });
  const after = await db.getRepository(entities.HrAttendanceRequestEntity).findOneByOrFail({ ...scope, id: created.id }); assert.equal(after.leaveTypeVersion, 4); assert.equal(after.version, approved.version);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_attendance_leave_cancellation WHERE source_request_id=$1 AND status='approved'", [created.id]))[0].n, 1);
 });
 it("pages every type and history version without changing frozen request labels", async () => {
  for (let version = 4; version < 23; version++) await putType(version);
  const first = await ledger.typeHistory(scope, admin, "ANNUAL", page), second = await ledger.typeHistory(scope, admin, "ANNUAL", { ...page, page: 2 });
  assert.equal(first.total, 23); assert.equal(first.items.length, 20); assert.equal(second.items.length, 3);
  for (let index = 0; index < 20; index++) await ledger.putType(scope, admin, `TYPE_${String(index).padStart(2, "0")}`, { expectedVersion: 0, typeName: `合成类型${index}`, enabled: true, reason: "分页核对" });
  assert.equal((await ledger.types(scope, owner, page)).items.length, 20);
  assert.equal((await ledger.types(scope, owner, { ...page, page: 2 })).items.length, 1);
  const [request] = await db.query("SELECT leave_type_name name,leave_type_version version FROM hr_attendance_request WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND status='approved'", [scope.tenantId, scope.parkId, employeeId]);
  assert.equal(request.version, 4); assert.equal(request.name, "合成年假4");
 });
 const range = () => ({ ...page, from: "2026-07-01", to: "2026-07-02" });
 const annual = (report: Awaited<ReturnType<HrAttendanceLeaveBalanceService["report"]>>) => report.items.find(row => row.leaveTypeId === typeId)!;
 it("balance identifies missing schedules and openings, pages all types and never assigns missing quota adjustments zero", async () => {
  const report = await balance.report(scope, owner, range());
  assert.deepEqual(report.missingScheduleDates, ["2026-07-01"]); assert.equal(annual(report).balanceMinutes, null);
  assert.equal(annual(report).observedMinutes, 0); assert.equal(annual(report).openingMinutes, 480);
  assert.equal(report.total, 21); assert.equal(report.items.length, 20);
  const last = await balance.report(scope, owner, { ...range(), page: 2 }); assert.equal(last.items.length, 1);
  assert.equal(last.items[0]!.openingMinutes, null); assert.equal(last.items[0]!.adjustmentMinutes, null);
  assert.equal(report.basis, "registered_system_facts"); assert.match(report.basisHash, /^[a-f0-9]{64}$/);
 });
 it("balance consumes actual approved leave and source-bound cancellation using current saved shift", async () => {
  const shift = randomUUID();
  await db.query("INSERT INTO hr_attendance_shift(id,tenant_id,park_id,shift_code,shift_name,start_local,end_local,rule_version) VALUES($1,$2,$3,'BALANCE-DAY','Synthetic day','09:00','17:00','v1')", [shift, scope.tenantId, scope.parkId]);
  await db.query("INSERT INTO hr_employee_schedule(tenant_id,park_id,employee_id,shift_id,work_date) VALUES($1,$2,$3,$4,'2026-07-01')", [scope.tenantId, scope.parkId, employeeId, shift]);
  const request = await hr.createAttendanceRequest(scope, owner, { requestType: "leave", startAt: "2026-07-01T09:00:00+08:00", endAt: "2026-07-01T12:00:00+08:00", reason: "Synthetic balance leave", leaveTypeId: typeId, expectedLeaveTypeVersion: 23 });
  await hr.submitAttendanceRequest(scope, owner, request.id); await hr.reviewAttendanceRequest(scope, admin, request.id, "approve", {});
  const before = await balance.report(scope, owner, range()); assert.equal(annual(before).consumedMinutes, 180); assert.equal(annual(before).balanceMinutes, 240);
  const source = await db.getRepository(entities.HrAttendanceRequestEntity).findOneByOrFail({ id: request.id });
  const cut = await cancel.create(scope, owner, { sourceRequestId: source.id, expectedSourceVersion: source.version, startAt: "2026-07-01T10:00:00+08:00", endAt: "2026-07-01T11:00:00+08:00", reason: "Synthetic returned hour" });
  const submitted = await cancel.act(scope, owner, cut.id, { expectedVersion: cut.version, action: "submit" }); await cancel.act(scope, admin, cut.id, { expectedVersion: submitted.version, action: "approve" });
  const after = await balance.report(scope, owner, range()); assert.equal(annual(after).consumedMinutes, 120); assert.equal(annual(after).balanceMinutes, 300);
  assert.notEqual(after.basisHash, before.basisHash); assert.equal(after.sources.cancellations.length, 1); assert.equal(after.sources.requests[0]!.version, source.version);
  const shiftedOpening = await balance.report(scope, owner, { ...page, from: "2026-07-02", to: "2026-07-03" }); assert.equal(annual(shiftedOpening).openingMinutes, null);
 });
 it("overnight work includes the preceding work-date window and clips at opening midnight", async () => {
  const shift = randomUUID();
  await db.query("INSERT INTO hr_attendance_shift(id,tenant_id,park_id,shift_code,shift_name,start_local,end_local,crosses_midnight,rule_version) VALUES($1,$2,$3,'BALANCE-NIGHT','Synthetic night','23:00','07:00',true,'v1')", [shift, scope.tenantId, scope.parkId]);
  await db.query("INSERT INTO hr_employee_schedule(tenant_id,park_id,employee_id,shift_id,work_date) VALUES($1,$2,$3,$4,'2026-06-30')", [scope.tenantId, scope.parkId, employeeId, shift]);
  const request = await hr.createAttendanceRequest(scope, owner, { requestType: "leave", startAt: "2026-06-30T23:00:00+08:00", endAt: "2026-07-01T07:00:00+08:00", reason: "Synthetic overnight", leaveTypeId: typeId, expectedLeaveTypeVersion: 23 });
  await hr.submitAttendanceRequest(scope, owner, request.id); await hr.reviewAttendanceRequest(scope, admin, request.id, "approve", {});
  const report = await balance.report(scope, owner, range()); assert.equal(annual(report).consumedMinutes, 540); assert.equal(annual(report).balanceMinutes, -120);
  assert.equal(report.sources.schedules.length, 2); assert.deepEqual(report.missingScheduleDates, []);
 });
 it("unclassified actual working leave marks balances unknown and full cancellation restores exact projection", async () => {
  const request = await hr.createAttendanceRequest(scope, owner, { requestType: "leave", startAt: "2026-07-01T14:00:00+08:00", endAt: "2026-07-01T15:00:00+08:00", reason: "Synthetic unclassified" });
  await hr.submitAttendanceRequest(scope, owner, request.id); await hr.reviewAttendanceRequest(scope, admin, request.id, "approve", {});
  const before = await balance.report(scope, owner, range()); assert.equal(before.unclassifiedMinutes, 60); assert.equal(annual(before).balanceMinutes, null); assert.ok(annual(before).blockers.includes("leave_classification_incomplete"));
  const source = await db.getRepository(entities.HrAttendanceRequestEntity).findOneByOrFail({ id: request.id });
  const cut = await cancel.create(scope, owner, { sourceRequestId: source.id, expectedSourceVersion: source.version, startAt: source.startAt!.toISOString(), endAt: source.endAt!.toISOString(), reason: "Synthetic complete return" });
  const submitted = await cancel.act(scope, owner, cut.id, { expectedVersion: cut.version, action: "submit" }); await cancel.act(scope, admin, cut.id, { expectedVersion: submitted.version, action: "approve" });
  const after = await balance.report(scope, owner, range()); assert.equal(after.unclassifiedMinutes, 0); assert.equal(annual(after).balanceMinutes, -120);
 });
 it("uses one repeatable read snapshot even while another transaction changes quota", async () => {
  const createRunner = db.createQueryRunner.bind(db); let reached!: () => void, resume!: () => void, paused = false;
  const ready = new Promise<void>(resolve => { reached = resolve; }), release = new Promise<void>(resolve => { resume = resolve; });
  db.createQueryRunner = mode => {
   const runner = createRunner(mode), query = runner.query.bind(runner);
   runner.query = (async (sql: string, params?: unknown[], structured?: boolean) => {
    const rows = structured ? await query(sql, params, true) : await query(sql, params);
    if (!paused && sql.startsWith("SELECT id,type_code")) {
     paused = true;
     const [settings] = await query("SELECT current_setting('transaction_isolation') isolation,current_setting('transaction_read_only') readonly");
     assert.equal(settings.isolation, "repeatable read"); assert.equal(settings.readonly, "on"); reached(); await release;
    }
    return rows;
   }) as typeof runner.query; return runner;
  };
  const pending = balance.report(scope, owner, range());
  try {
   await Promise.race([ready, pending.then(() => { throw new Error("Read did not reach snapshot barrier"); })]);
   await ledger.putQuota(scope, admin, quotaId, { expectedVersion: 23, openingMinutes: 600, adjustmentMinutes: 0, reason: "Synthetic concurrent quota correction" });
   resume(); const old = await pending; assert.equal(annual(old).openingMinutes, 480); assert.equal(annual(old).balanceMinutes, -120);
  } finally { resume(); db.createQueryRunner = createRunner; }
  const fresh = await balance.report(scope, owner, range()); assert.equal(annual(fresh).openingMinutes, 600); assert.equal(annual(fresh).balanceMinutes, 60);
 });
 it("scopes employee options and balances to self, managed descendants or park operation", async () => {
  const managerUser = randomUUID(), managerEmployee = randomUUID(), otherUser = randomUUID(), otherEmployee = randomUUID(), parent = randomUUID(), child = randomUUID();
  for (const id of [managerUser, otherUser]) await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1::uuid,$2,$3,$1::text,'Synthetic account','not-a-login-hash')", [id, scope.tenantId, scope.parkId]);
  for (const [id, user] of [[managerEmployee, managerUser], [otherEmployee, otherUser]]) await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status) VALUES($1::uuid,$2,$3,$1::text,'Synthetic employee',$4,'active')", [id, scope.tenantId, scope.parkId, user]);
  await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,leader_user_id,status) VALUES($1::uuid,$2,$3,$1::text,'Synthetic parent','department',$4,'enabled')", [parent, scope.tenantId, scope.parkId, managerUser]);
  await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,parent_id,status) VALUES($1::uuid,$2,$3,$1::text,'Synthetic child','department',$4,'enabled')", [child, scope.tenantId, scope.parkId, parent]);
  await db.query("UPDATE hr_employee SET primary_org_id=$2 WHERE id=$1", [employeeId, child]);
  const manager = actor(managerUser, [P.HR_ATTENDANCE_TEAM_READ]);
  assert.deepEqual((await balance.employees(scope, manager, page)).items.map(row => row.id), [employeeId]);
  assert.deepEqual((await balance.employees(scope, owner, page)).items.map(row => row.id), [employeeId]);
  await balance.report(scope, manager, { ...range(), employee_id: employeeId });
  await assert.rejects(balance.report(scope, manager, { ...range(), employee_id: otherEmployee }), /无权查看/);
  await assert.rejects(balance.report(scope, owner, { ...range(), employee_id: managerEmployee }), /无权查看/);
  await assert.rejects(balance.employees({ ...scope, parkId: "foreign" }, owner, page), /园区不匹配/);
  const operator = actor(adminId, [P.HR_ATTENDANCE_OPERATE]); const first = await balance.employees(scope, operator, { page: 1, page_size: 1 }), second = await balance.employees(scope, operator, { page: 2, page_size: 1 });
  assert.equal(first.total, 3); assert.notEqual(first.items[0]!.id, second.items[0]!.id); assert.ok(!("userId" in first.items[0]!));
 });
});
