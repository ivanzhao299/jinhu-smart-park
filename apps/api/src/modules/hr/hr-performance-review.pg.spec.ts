import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceReviewService } from "./hr-performance-review.service";
import { HrPerformanceEvaluationService } from "./hr-performance-evaluation.service";

const enabled = process.env.HR_PERFORMANCE_REVIEW_PG_REQUIRED === "1";
const scope = { tenantId: "10000001", parkId: "20000001" };
const users = Array.from({ length: 5 }, () => randomUUID());
const employees = Array.from({ length: 4 }, () => randomUUID());
const rootOrg = randomUUID(), teamOrg = randomUUID();
let db: DataSource, planning: HrPerformanceReviewService, evaluation: HrPerformanceEvaluationService;
let versionId: string;
const actor = (index: number, permissions: string[]): JwtPrincipal => ({
  sub: users[index]!, username: "performance-pg", tenantId: scope.tenantId, parkId: scope.parkId,
  roles: [], permissions,
});
const hr = actor(0, [HR_PERMISSIONS.HR_PERFORMANCE_READ, HR_PERMISSIONS.HR_PERFORMANCE_MANAGE,
  HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE, HR_PERMISSIONS.HR_PERFORMANCE_CALIBRATE,
  HR_PERMISSIONS.HR_PERFORMANCE_APPEAL_REVIEW]);
const manager = actor(1, [HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ, HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW]);
const self = (index: number) => actor(index + 2, [HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
  HR_PERMISSIONS.HR_PERFORMANCE_SELF_REVIEW, HR_PERMISSIONS.HR_PERFORMANCE_ACKNOWLEDGE,
  HR_PERMISSIONS.HR_PERFORMANCE_APPEAL]);

before(async () => {
  if (!enabled) return;
  const { POSTGRES_HOST: host, POSTGRES_DB: database, POSTGRES_PASSWORD: password } = process.env;
  assert.ok(host && ["127.0.0.1", "localhost", "::1"].includes(host));
  assert.match(database ?? "", /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/);
  assert.ok(password);
  db = new DataSource({ type: "postgres", host, database, password,
    port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER, extra: { max: 8 } });
  await db.initialize();
  assert.equal((await db.query("SELECT current_database() name"))[0].name, database);
  for (const id of users) await db.query(
    "INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'Synthetic performance actor','not-a-login-hash','enabled')",
    [id, scope.tenantId, scope.parkId, `perf-${id}`]);
  await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,status,leader_user_id) VALUES($1,$2,$3,$4,'Synthetic root','department','enabled',$5)",
    [rootOrg, scope.tenantId, scope.parkId, `P-${rootOrg}`, manager.sub]);
  await db.query("INSERT INTO sys_org(id,tenant_id,park_id,parent_id,org_code,org_name,org_type,status) VALUES($1,$2,$3,$4,$5,'Synthetic team','department','enabled')",
    [teamOrg, scope.tenantId, scope.parkId, rootOrg, `P-${teamOrg}`]);
  for (const [i, id] of employees.entries()) await db.query(
    "INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,manager_employee_id,employment_status) VALUES($1,$2,$3,$4,'Synthetic employee',$5,$6,$7,'active')",
    [id, scope.tenantId, scope.parkId, `P-${id}`, users[i + 1], i === 0 ? rootOrg : teamOrg, i === 0 ? null : employees[0]]);
  const audit = { recordOperationRequired: async () => undefined } as never;
  planning = new HrPerformanceReviewService(db, audit);
  evaluation = new HrPerformanceEvaluationService(db, audit);
  const template = await planning.createTemplate(scope, hr, {
    templateCode: `P-${randomUUID()}`, templateName: "Synthetic performance", versionName: "v1",
    dimensions: [{ code: "result", name: "Result", weight: 0.6 }, { code: "ability", name: "Ability", weight: 0.4 }],
    levels: [{ code: "C", name: "Pass", scoreMin: 0, scoreMax: 79.99 }, { code: "B", name: "Good", scoreMin: 80, scoreMax: 100 }],
  });
  versionId = String(template.versionId);
  await planning.publishTemplate(scope, hr, versionId);
});
after(async () => { if (db?.isInitialized) await db.destroy(); });

async function publishCycle() {
  const cycle = await planning.createCycle(scope, hr, { cycleCode: `P-${randomUUID()}`, cycleName: "Synthetic cycle",
    startDate: "2026-01-01", endDate: "2026-12-31", templateVersionId: versionId, applicableOrgIds: [teamOrg] });
  const id = String(cycle.id);
  assert.equal((await planning.publishCycle(scope, hr, id)).employeeCount, 3);
  const rows = await db.query("SELECT id,employee_id FROM hr_performance_cycle_employee WHERE cycle_id=$1", [id]) as Array<{ id: string; employee_id: string }>;
  return { id, reviews: employees.slice(1).map(employee => rows.find(row => row.employee_id === employee)!.id) };
}

test("service state chain recomputes scores, scopes roles, serializes actions and preserves terminal evidence", { skip: !enabled }, async () => {
  const baseline = (await db.query("SELECT (SELECT count(*) FROM hr_payroll_run) payroll,(SELECT count(*) FROM hr_payslip) payslips,(SELECT count(*) FROM hr_employee_attendance_daily_result) attendance,(SELECT md5(string_agg(id::text||':'||version,',' ORDER BY id)) FROM hr_employee) employee_hash"))[0];
  assert.equal((await planning.previewScore(scope, hr, { templateVersionId: versionId, dimensionScores: { result: 80.1, ability: 90.2 } })).score, "84.14");
  const { id, reviews } = await publishCycle();
  await assert.rejects(evaluation.submitSelf(scope, self(1), reviews[0]!, { dimensionScores: { result: 80, ability: 90 } }), NotFoundException);
  await assert.rejects(evaluation.submitSelf({ ...scope, parkId: "other" }, self(0), reviews[0]!, { dimensionScores: { result: 80, ability: 90 } }), NotFoundException);
  const attempts = await Promise.allSettled([0, 1].map(() => evaluation.submitSelf(scope, self(0), reviews[0]!, { dimensionScores: { result: 80.1, ability: 90.2 } })));
  assert.equal(attempts.filter(x => x.status === "fulfilled").length, 1);
  const failed = attempts.find(x => x.status === "rejected") as PromiseRejectedResult;
  assert.ok(failed.reason instanceof ConflictException);
  for (let i = 1; i < 3; i++) await evaluation.submitSelf(scope, self(i), reviews[i]!, { dimensionScores: { result: 80, ability: 90 } });
  for (const review of reviews) assert.equal((await evaluation.submitManager(scope, manager, review, { dimensionScores: { result: 90, ability: 80 } })).score, "86.00");
  const hidden = (await evaluation.reviews(scope, self(0), { cycleId: id }))[0]!;
  assert.equal(hidden.managerSubmission, null); assert.equal(hidden.result, null);
  assert.equal((await evaluation.reviews(scope, manager, { cycleId: id })).length, 3);
  assert.equal((await evaluation.reviews(scope, actor(0, []), { cycleId: id })).length, 0);
  const batch = await evaluation.createBatch(scope, hr, { cycleId: id, batchName: "Synthetic calibration",
    meetingAt: "2026-10-02T10:00:00Z", participantUserIds: [hr.sub, self(0).sub] });
  await assert.rejects(evaluation.addCalibration(scope, hr, String(batch.id), { cycleEmployeeId: reviews[0]!, dimensionScores: { result: 90, ability: 85 }, reason: " " }), /Calibration reason is required/);
  await assert.rejects(evaluation.addCalibration(scope, actor(2, [HR_PERMISSIONS.HR_PERFORMANCE_CALIBRATE]), String(batch.id), { cycleEmployeeId: reviews[0]!, dimensionScores: { result: 90, ability: 85 }, reason: "Review" }), ForbiddenException);
  await assert.rejects(evaluation.completeBatch(scope, actor(2, [HR_PERMISSIONS.HR_PERFORMANCE_CALIBRATE]), String(batch.id)), /cannot finalize their own/);
  assert.equal((await evaluation.addCalibration(scope, hr, String(batch.id), { cycleEmployeeId: reviews[0]!, dimensionScores: { result: 90, ability: 85 }, reason: "Evidence reviewed" })).afterScore, "88.00");
  const completions = await Promise.allSettled([0, 1].map(() => evaluation.completeBatch(scope, hr, String(batch.id))));
  assert.equal(completions.filter(x => x.status === "fulfilled").length, 1);
  assert.ok((completions.find(x => x.status === "rejected") as PromiseRejectedResult).reason instanceof ConflictException);
  assert.equal((await evaluation.reviews(scope, self(0), { cycleId: id }))[0]!.result!.score, "88.00");
  const appeal = await evaluation.appeal(scope, self(0), reviews[0]!, { reason: "Recheck evidence" });
  await assert.rejects(evaluation.resolveAppeal(scope, actor(2, [HR_PERMISSIONS.HR_PERFORMANCE_APPEAL_REVIEW]), String(appeal.id), { decision: "rejected", reason: "Review" }), ForbiddenException);
  assert.equal((await evaluation.resolveAppeal(scope, hr, String(appeal.id), { decision: "upheld", reason: "Evidence accepted", dimensionScores: { result: 90, ability: 90 } })).result.score, "90.00");
  const rejected = await evaluation.appeal(scope, self(1), reviews[1]!, { reason: "Review score" });
  await assert.rejects(evaluation.resolveAppeal(scope, hr, String(rejected.id), { decision: "rejected", reason: "Keep score", dimensionScores: { result: 90, ability: 90 } }), /cannot replace dimension scores/);
  assert.equal((await evaluation.resolveAppeal(scope, hr, String(rejected.id), { decision: "rejected", reason: "Original evidence stands" })).result.score, "86.00");
  const acknowledgements = await Promise.allSettled([0, 1].map(() => evaluation.acknowledge(scope, self(2), reviews[2]!)));
  assert.equal(acknowledgements.filter(x => x.status === "fulfilled").length, 1);
  assert.ok((acknowledgements.find(x => x.status === "rejected") as PromiseRejectedResult).reason instanceof ConflictException);
  assert.equal((await db.query("SELECT status FROM hr_performance_review_cycle WHERE id=$1", [id]))[0].status, "confirmed");
  await assert.rejects(db.query("UPDATE hr_performance_cycle_employee SET final_score=1 WHERE id=$1", [reviews[0]]), /confirmed performance result is immutable/);
  await assert.rejects(db.query("UPDATE hr_performance_review_submission SET computed_score=1 WHERE cycle_employee_id=$1", [reviews[0]]), /performance review evidence is append-only/);
  assert.deepEqual((await db.query("SELECT (SELECT count(*) FROM hr_payroll_run) payroll,(SELECT count(*) FROM hr_payslip) payslips,(SELECT count(*) FROM hr_employee_attendance_daily_result) attendance,(SELECT md5(string_agg(id::text||':'||version,',' ORDER BY id)) FROM hr_employee) employee_hash"))[0], baseline);
});

test("notification persistence failure rolls back submission, state and action in the real database", { skip: !enabled }, async () => {
  const { reviews } = await publishCycle(), review = reviews[0]!;
  await db.query(`CREATE FUNCTION perf_lab_fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.sender_id='${self(0).sub}'::uuid AND NEW.source_type='hr_performance_review' THEN RAISE EXCEPTION 'synthetic notification unavailable'; END IF; RETURN NEW; END $$`);
  await db.query("CREATE TRIGGER perf_lab_fail_notification BEFORE INSERT ON biz_user_message FOR EACH ROW EXECUTE FUNCTION perf_lab_fail_notification()");
  try {
    await assert.rejects(evaluation.submitSelf(scope, self(0), review, { dimensionScores: { result: 80, ability: 90 } }), /synthetic notification unavailable/);
    assert.deepEqual((await db.query("SELECT status,(SELECT count(*) FROM hr_performance_review_submission WHERE cycle_employee_id=$1) submissions,(SELECT count(*) FROM hr_performance_review_action WHERE cycle_employee_id=$1) actions FROM hr_performance_cycle_employee WHERE id=$1", [review]))[0], { status: "self_review", submissions: "0", actions: "0" });
  } finally {
    await db.query("DROP TRIGGER perf_lab_fail_notification ON biz_user_message");
    await db.query("DROP FUNCTION perf_lab_fail_notification()");
  }
  assert.equal((await evaluation.submitSelf(scope, self(0), review, { dimensionScores: { result: 80, ability: 90 } })).status, "manager_review");
});

test("required read audit failure blocks real database review and action projections", { skip: !enabled }, async () => {
  const failure = new Error("synthetic required audit unavailable");
  const denied = new HrPerformanceEvaluationService(db, { recordOperationRequired: async () => { throw failure; } } as never);
  await assert.rejects(denied.reviews(scope, self(0), {}), failure);
  const row = (await db.query("SELECT id FROM hr_performance_cycle_employee WHERE employee_id=$1 LIMIT 1", [employees[1]]))[0];
  await assert.rejects(denied.actions(scope, self(0), row.id), failure);
});
