import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { OpLogEntity } from "../audit/entities/op-log.entity";
import * as entities from "./entities/hr.entities";
import { HrService } from "./hr.service";
function assertIsolatedDatabase() {
  assert.equal(process.env.HR_TRIP_FORMAL_ISOLATED, "yes");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(process.env.POSTGRES_HOST ?? ""));
  const database = process.env.POSTGRES_DB ?? "";
  const ownedLab = /^jinhu_hr_migration_lab_trip_formal_[a-f0-9]{8}$/.test(database);
  const releaseSmoke = process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true" && database === "jinhu_release_smoke";
  assert.ok(ownedLab || releaseSmoke, "Trip fixtures require an owned lab or the disposable CI release-smoke database");
}

test("isolated PostgreSQL: formal declared days preserve legacy values and require controlled approved amendments", { skip: process.env.HR_TRIP_FORMAL_PG_REQUIRED !== "1" }, async () => {
  assertIsolatedDatabase();
  const client = new DataSource({ type: "postgres", host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
  await client.initialize();
  const scope = { tenant: `trip-${randomUUID()}`, park: `park-${randomUUID()}` }, employee = randomUUID(), actor = randomUUID(), draft = randomUUID(), approved = randomUUID();
  try {
    await client.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,'synthetic-trip','Synthetic','disabled-fixture')", [actor, scope.tenant, scope.park]);
    await client.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status) VALUES($1,$2,$3,'TRIP-PG','Synthetic','active')", [employee, scope.tenant, scope.park]);
    await client.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,request_no,employee_id,request_type,start_at,end_at,duration_minutes,reason,status,is_historical_import,legacy_source_table,legacy_source_id,legacy_declared_days,declared_days,legacy_source_identity_sha256,legacy_source_row_sha256) VALUES($1,$2,$3,'TRIP-LEGACY',$4,'business_trip',date_trunc('minute',now()),date_trunc('minute',now())+interval '1 day',1440,'synthetic','approved',true,'dbo.errand',1,-2,-2,repeat('a',64),repeat('b',64))", [approved, scope.tenant, scope.park, employee]);
    await client.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,request_no,employee_id,request_type,start_at,end_at,duration_minutes,reason,status) VALUES($1,$2,$3,'TRIP-DRAFT',$4,'business_trip',date_trunc('minute',now()),date_trunc('minute',now())+interval '1 day',1440,'synthetic','draft')", [draft, scope.tenant, scope.park, employee]);
    const legacy = await client.query("SELECT declared_days FROM hr_attendance_request WHERE id=$1", [approved]);
    assert.equal(legacy[0]?.declared_days, -2);
    for (const [index, value] of [null, 0, 3, -7].entries()) {
      const imported = randomUUID();
      // Use the unchanged sealed import columns, deliberately omitting the new formal field.
      await client.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,request_no,employee_id,request_type,start_at,end_at,duration_minutes,reason,status,is_historical_import,legacy_source_table,legacy_source_id,legacy_declared_days,legacy_source_identity_sha256,legacy_source_row_sha256) VALUES($1,$2,$3,$4,$5,'business_trip',date_trunc('minute',now()),date_trunc('minute',now())+interval '1 day',1440,'synthetic','approved',true,'dbo.errand',$6,$7,$8,repeat('e',64))", [imported, scope.tenant, scope.park, `TRIP-INSERT-${index}`, employee, index + 100, value, String(index).repeat(64)]);
      const [inserted] = await client.query("SELECT declared_days,legacy_declared_days FROM hr_attendance_request WHERE id=$1", [imported]);
      assert.equal(inserted.declared_days, value);
      assert.equal(inserted.legacy_declared_days, value);
    }
    await client.query("UPDATE hr_attendance_request SET declared_days=0 WHERE id=$1", [draft]);
    await assert.rejects(client.query("UPDATE hr_attendance_request SET declared_days=0 WHERE id=$1", [approved]), /controlled amendment path/);
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.hr_business_trip_declared_days_amendment','on',true)");
    await client.query("UPDATE hr_attendance_request SET declared_days=0,version=version+1 WHERE id=$1", [approved]);
    await client.query("INSERT INTO hr_business_trip_declared_days_history(tenant_id,park_id,request_id,request_version,declared_days,change_reason,actor_user_id) VALUES($2,$3,$1,2,0,'synthetic correction',$4)", [approved, scope.tenant, scope.park, actor]);
    await client.query("COMMIT");
    const [beforeReplay] = await client.query("SELECT to_jsonb(request) snapshot FROM hr_attendance_request request WHERE id=$1", [approved]);
    await client.query("INSERT INTO hr_attendance_request SELECT * FROM hr_attendance_request WHERE id=$1 ON CONFLICT DO NOTHING", [approved]);
    const [afterReplay] = await client.query("SELECT to_jsonb(request) snapshot FROM hr_attendance_request request WHERE id=$1", [approved]);
    assert.deepEqual(afterReplay, beforeReplay);
    assert.equal((await client.query("SELECT declared_days FROM hr_attendance_request WHERE id=$1", [approved]))[0].declared_days, 0);
    await assert.rejects(client.query("UPDATE hr_business_trip_declared_days_history SET change_reason='changed' WHERE request_id=$1", [approved]), /append-only/);
  } finally { await client.destroy(); }
});

test("isolated PostgreSQL: real amendments invalidate month facts, preserve closed input and recover through explicit correction", { skip: process.env.HR_TRIP_FORMAL_PG_REQUIRED !== "1" }, async () => {
  assertIsolatedDatabase();
  const db = new DataSource({ type: "postgres", host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, entities: [...entities.HR_ENTITIES, OpLogEntity] });
  await db.initialize();
  try {
    const scope = { tenantId: `service-${randomUUID()}`, parkId: `park-${randomUUID()}` }, user = randomUUID();
    const actor: JwtPrincipal = { sub: user, username: "synthetic-trip", ...scope, permissions: [H.HR_ATTENDANCE_OPERATE], roles: [], isSuper: false };
    await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,'synthetic-trip','Synthetic','disabled-fixture')", [user, scope.tenantId, scope.parkId]);
    const employee = await db.getRepository(entities.HrEmployeeEntity).save({ ...scope, employeeCode: "TRIP-SERVICE", fullName: "Synthetic", employmentStatus: "active", userId: user });
    const audit = new AuditService(undefined!, db.getRepository(OpLogEntity));
    let failAudit = false;
    const args = Array(32).fill(undefined);
    args[0] = db.getRepository(entities.HrEmployeeEntity);
    args[26] = db.getRepository(entities.HrAttendanceRequestEntity);
    args[29] = { publishAttendanceRequestSubmitted: async () => {}, publishAttendanceRequestReviewed: async () => {} };
    args[30] = db;
    args[31] = { recordOperationRequired: async (...input: Parameters<AuditService["recordOperationRequired"]>) => { if (failAudit) throw new Error("synthetic audit failure"); return audit.recordOperationRequired(...input); } };
    const service = Reflect.construct(HrService, args) as HrService;
    const request = randomUUID();
    await db.query("INSERT INTO hr_attendance_request(id,tenant_id,park_id,request_no,employee_id,request_type,start_at,end_at,duration_minutes,reason,status,is_historical_import,legacy_source_table,legacy_source_id,legacy_declared_days,declared_days,legacy_source_identity_sha256,legacy_source_row_sha256) VALUES($1,$2,$3,'TRIP-SERVICE',$4,'business_trip','2026-07-12T08:00:00+08:00','2026-07-12T17:00:00+08:00',540,'synthetic','approved',true,'dbo.errand',12,-2,-2,repeat('c',64),repeat('d',64))", [request, scope.tenantId, scope.parkId, employee.id]);
    const period = await service.createAttendancePeriod(scope, actor, { periodMonth: "2026-07-01" });
    const recalculate = () => service.recalculateAttendanceDay(scope, actor, { employeeId: employee.id, workDate: "2026-07-12", ruleVersion: "synthetic-trip-v1" });
    await recalculate();
    await service.calculateAttendancePeriod(scope, actor, period.id);
    const dto = { declaredDays: 0, expectedVersion: 1, reason: "synthetic correction" };
    await assert.rejects(service.amendBusinessTripDeclaredDays(scope, { ...actor, permissions: [] }, request, dto), ForbiddenException);
    await assert.rejects(service.amendBusinessTripDeclaredDays({ ...scope, parkId: "foreign" }, { ...actor, parkId: "foreign" }, request, dto), NotFoundException);
    failAudit = true;
    await assert.rejects(service.amendBusinessTripDeclaredDays(scope, actor, request, dto), /synthetic audit failure/);
    failAudit = false;
    assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1", [period.id]))[0].status, "review");
    assert.equal((await db.query("SELECT version FROM hr_attendance_request WHERE id=$1", [request]))[0].version, 1);
    assert.equal((await service.businessTripDeclaredDaysHistory(scope, actor, request, { page: 1, page_size: 20 })).total, 0);
    const race = await Promise.allSettled([service.amendBusinessTripDeclaredDays(scope, actor, request, dto), service.amendBusinessTripDeclaredDays(scope, actor, request, { ...dto, declaredDays: 1 })]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(race.filter(result => result.status === "rejected" && result.reason instanceof ConflictException).length, 1);
    const current = (await db.query("SELECT declared_days,legacy_declared_days,version,status FROM hr_attendance_request WHERE id=$1", [request]))[0];
    assert.equal(current.legacy_declared_days, -2);
    assert.equal(current.version, 2);
    assert.equal(current.status, "approved");
    const history = await service.businessTripDeclaredDaysHistory(scope, actor, request, { page: 1, page_size: 20 });
    assert.equal(history.total, 1);
    assert.equal(history.items[0].beforeDeclaredDays, -2);
    assert.equal(history.items[0].declaredDays, current.declared_days);
    await assert.rejects(service.calculateAttendancePeriod(scope, actor, period.id), /出差申报天数已变化/);
    await recalculate();
    await service.calculateAttendancePeriod(scope, actor, period.id);
    await service.closeAttendancePeriod(scope, actor, period.id);
    const frozen = await db.query("SELECT id,source_daily_trace FROM hr_attendance_month_summary WHERE tenant_id=$1 AND park_id=$2 ORDER BY summary_version", [scope.tenantId, scope.parkId]);
    assert.equal(frozen.length, 2);
    const frozenBefore = JSON.stringify(frozen);
    await service.amendBusinessTripDeclaredDays(scope, actor, request, { declaredDays: null, expectedVersion: 2, reason: "synthetic clear" });
    assert.equal((await db.query("SELECT status FROM hr_attendance_period WHERE id=$1", [period.id]))[0].status, "closed");
    assert.equal(JSON.stringify(await db.query("SELECT id,source_daily_trace FROM hr_attendance_month_summary WHERE tenant_id=$1 AND park_id=$2 ORDER BY summary_version", [scope.tenantId, scope.parkId])), frozenBefore);
    await assert.rejects(service.createAttendanceCorrectionBatch(scope, actor, period.id, { reason: "synthetic correction batch" }), /出差申报天数已变化/);
    await recalculate();
    await service.createAttendanceCorrectionBatch(scope, actor, period.id, { reason: "synthetic correction batch" });
    const summaries = await db.query("SELECT source_daily_trace FROM hr_attendance_month_summary WHERE tenant_id=$1 AND park_id=$2 ORDER BY summary_version DESC", [scope.tenantId, scope.parkId]);
    assert.deepEqual(summaries[0].source_daily_trace[0].businessTripDeclaredDaysSources, [{ id: request, version: 3, declaredDays: null }]);
    assert.equal((await service.businessTripDeclaredDaysHistory(scope, actor, request, { page: 2, page_size: 1 })).items[0].requestVersion, 2);
    await db.query("UPDATE hr_attendance_period SET status='calculating' WHERE id=$1", [period.id]);
    await assert.rejects(service.amendBusinessTripDeclaredDays(scope, actor, request, { declaredDays: 2, expectedVersion: 3, reason: "synthetic calculation race" }), ConflictException);
    assert.equal((await db.query("SELECT version FROM hr_attendance_request WHERE id=$1", [request]))[0].version, 3);
    // Platform-created trips follow the same correction path after their original approval.
    const requester = { ...actor, permissions: [H.HR_ATTENDANCE_REQUEST, H.HR_ATTENDANCE_OPERATE] };
    const initial = { requestType: "business_trip", startAt: "2026-08-12T08:00:00+08:00", endAt: "2026-08-12T17:00:00+08:00", reason: "synthetic new trip", declaredDays: 2 };
    const created = await service.createAttendanceRequest(scope, requester, initial);
    assert.equal(created.declaredDays, 2);
    const { declaredDays: originalDays, ...timing } = initial;
    assert.equal(originalDays, 2);
    const preserved = await service.updateAttendanceRequest(scope, requester, created.id, { ...timing, expectedVersion: created.editVersion! });
    assert.equal(preserved.declaredDays, 2);
    const cleared = await service.updateAttendanceRequest(scope, requester, created.id, { ...initial, declaredDays: null, expectedVersion: preserved.editVersion! });
    assert.equal(cleared.declaredDays, null);
    const submitted = await service.submitAttendanceRequest(scope, requester, created.id);
    assert.equal(submitted.declaredDays, null);
    await service.reviewAttendanceRequest(scope, { ...actor, sub: randomUUID(), permissions: [H.HR_ATTENDANCE_APPROVE, H.HR_ATTENDANCE_READ] }, created.id, "approve", {});
    const approvedNew = await db.getRepository(entities.HrAttendanceRequestEntity).findOneByOrFail({ id: created.id });
    const amendedNew = await service.amendBusinessTripDeclaredDays(scope, actor, created.id, { declaredDays: 1, expectedVersion: approvedNew.version, reason: "synthetic approved new correction" });
    assert.equal(amendedNew.declaredDays, 1);
    const afterNew = await db.getRepository(entities.HrAttendanceRequestEntity).findOneByOrFail({ id: created.id });
    assert.equal(afterNew.approvalRequestId, approvedNew.approvalRequestId);
    assert.equal(afterNew.status, "approved");
    assert.equal(afterNew.isHistoricalImport, false);
    assert.equal(afterNew.legacyDeclaredDays, null);
    assert.deepEqual((await db.query("SELECT action FROM hr_approval_action WHERE request_id=$1 ORDER BY create_time,id", [approvedNew.approvalRequestId])).map((item: { action: string }) => item.action), ["submit", "approve"]);
  } finally { await db.destroy(); }
});
