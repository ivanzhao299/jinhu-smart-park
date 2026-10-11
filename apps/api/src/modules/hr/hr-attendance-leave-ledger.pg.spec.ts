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

const enabled = process.env.HR_LEAVE_LEDGER_PG === "1";
if (enabled) {
 assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15432");
 assert.equal(process.env.HR_LEAVE_LEDGER_ISOLATED, "yes");
 assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_review_leave_ledger_[a-f0-9]{8}$/);
 assert.ok(process.env.POSTGRES_PASSWORD);
}
(enabled ? describe : describe.skip)("Leave type/quota and request/cancellation PostgreSQL workflow", () => {
 let db: DataSource, ledger: HrAttendanceLeaveLedgerService, hr: HrService, cancel: HrAttendanceLeaveCancellationService;
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
});
