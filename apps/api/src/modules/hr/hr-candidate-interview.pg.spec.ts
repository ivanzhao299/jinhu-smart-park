import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource, type EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrCandidateInterviewService } from "./hr-candidate-interview.service";
import { HrRecruitmentService } from "./hr-recruitment.service";

const enabled = process.env.HR_CANDIDATE_INTERVIEW_PG === "1";
const scheduled = (expectedVersion: number) => ({ expectedVersion, roundLabel: "第一轮技术面", startsAt: "2026-10-11T09:00:00+08:00", endsAt: "2026-10-11T10:00:00+08:00", location: "A 楼 301", interviewerName: "面试官甲", status: "scheduled" as const, outcome: "pending" as const, resultNotes: null, cancellationReason: null });

test("full-schema candidate interviews preserve state histories, CAS, scope and required audit transactions", { skip: !enabled, timeout: 60_000 }, async () => {
  assert.equal(process.env.HR_CANDIDATE_INTERVIEW_ISOLATED, "yes"); assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15432"); assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_review_final_[0-9_]+$/);
  const db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15432, username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, entities: [], synchronize: false }); await db.initialize();
  try {
    const scope: TenantParkScope = { tenantId: "10000001", parkId: "20000001" }, actorId = randomUUID(), orgId = randomUUID(), suffix = randomUUID().slice(0, 8);
    await db.query("CREATE TABLE IF NOT EXISTS fixture_candidate_interview_audit(id bigserial primary key,payload jsonb not null)");
    await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'面试测试','not-a-login-hash','enabled')", [actorId, scope.tenantId, scope.parkId, `interview-${suffix}`]);
    await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,status,leader_user_id,create_by,update_by) VALUES($1,$2,$3,$4,'面试测试部门','department','enabled',$5,$5,$5)", [orgId, scope.tenantId, scope.parkId, `IV-${suffix}`, actorId]);
    const actor: JwtPrincipal = { ...scope, sub: actorId, username: "interview", roles: [], permissions: ["*"] };
    let failAudit = false;
    const audit = { recordOperationRequired: async (event: unknown, manager?: EntityManager) => { if (failAudit) throw new Error("required audit unavailable"); assert.ok(manager); await manager!.query("INSERT INTO fixture_candidate_interview_audit(payload) VALUES($1)", [JSON.stringify(event)]); } } as never;
    const recruitment = new HrRecruitmentService(db, {} as never, audit), service = new HrCandidateInterviewService(db, audit);
    const requisition = await recruitment.createRequisition(scope, actor, { requisitionCode: `IV-${suffix}`, title: "面试夹具", orgId, headcount: 2, ownerUserId: actorId, status: "open" });
    const candidate = await recruitment.createCandidate(scope, actor, { requisitionId: requisition.id, candidateNo: `C-${suffix}`, fullName: "合成候选人" });
    const otherCandidate = await recruitment.createCandidate(scope, actor, { requisitionId: requisition.id, candidateNo: `D-${suffix}`, fullName: "另一候选人" });
    const effects = () => db.query("SELECT (SELECT count(*) FROM hr_employee) employees,(SELECT count(*) FROM hr_payroll_run) payroll,(SELECT count(*) FROM hr_payslip) payslips,(SELECT count(*) FROM biz_user_message) messages,(SELECT stage FROM hr_candidate WHERE id=$1) stage", [candidate.id]);
    const before = await effects();
    const first = await service.create(scope, actor, candidate.id, scheduled(0)) as Record<string, unknown>; assert.equal(first.version, 1);
    const rescheduled = await service.update(scope, actor, candidate.id, String(first.id), { ...scheduled(1), startsAt: "2026-10-12T09:00:00+08:00", endsAt: "2026-10-12T10:00:00+08:00" }) as Record<string, unknown>; assert.equal(rescheduled.version, 2);
    const completed = await service.update(scope, actor, candidate.id, String(first.id), { ...scheduled(2), status: "completed", outcome: "pass", resultNotes: "技术通过", cancellationReason: null }) as Record<string, unknown>; assert.equal(completed.version, 3);
    const corrected = await service.update(scope, actor, candidate.id, String(first.id), { ...scheduled(3), status: "completed", outcome: "hold", resultNotes: "补充复议记录", cancellationReason: null }) as Record<string, unknown>; assert.equal(corrected.version, 4);
    await assert.rejects(service.update(scope, actor, candidate.id, String(first.id), scheduled(4)), /cannot change status/);
    const cancelled = await service.create(scope, actor, candidate.id, { ...scheduled(0), roundLabel: "第二轮", startsAt: "2026-10-13T09:00:00+08:00", endsAt: "2026-10-13T10:00:00+08:00" }) as Record<string, unknown>;
    const cancelledCorrected = await service.update(scope, actor, candidate.id, String(cancelled.id), { ...scheduled(1), roundLabel: "第二轮", startsAt: "2026-10-13T09:00:00+08:00", endsAt: "2026-10-13T10:00:00+08:00", status: "cancelled", outcome: "pending", resultNotes: null, cancellationReason: "候选人请假" }) as Record<string, unknown>;
    await service.update(scope, actor, candidate.id, String(cancelled.id), { ...scheduled(2), roundLabel: "第二轮", startsAt: "2026-10-13T09:00:00+08:00", endsAt: "2026-10-13T10:00:00+08:00", status: "cancelled", outcome: "pending", resultNotes: null, cancellationReason: "候选人改期后取消" });
    assert.equal(cancelledCorrected.status, "cancelled");
    const current = await service.detail(scope, actor, candidate.id, String(first.id)); assert.equal(current.version, 4); assert.ok(!("actorUserId" in current));
    const history1 = await service.history(scope, actor, candidate.id, String(first.id), { page: 1, page_size: 1 }), history2 = await service.history(scope, actor, candidate.id, String(first.id), { page: 2, page_size: 1 }), history3 = await service.history(scope, actor, candidate.id, String(first.id), { page: 3, page_size: 1 }), history4 = await service.history(scope, actor, candidate.id, String(first.id), { page: 4, page_size: 1 });
    assert.deepEqual([history1, history2, history3, history4].map(page => page.items[0]!.version), [4, 3, 2, 1]); assert.equal(history1.total, 4); assert.ok([history1, history2, history3, history4].every(page => !("actorUserId" in page.items[0]!)));
    const race = await service.create(scope, actor, candidate.id, { ...scheduled(0), roundLabel: "并发面", startsAt: "2026-10-14T09:00:00+08:00", endsAt: "2026-10-14T10:00:00+08:00" }) as Record<string, unknown>;
    const raceWrites = await Promise.allSettled([service.update(scope, actor, candidate.id, String(race.id), { ...scheduled(1), roundLabel: "并发面甲", startsAt: "2026-10-14T09:00:00+08:00", endsAt: "2026-10-14T10:00:00+08:00" }), service.update(scope, actor, candidate.id, String(race.id), { ...scheduled(1), roundLabel: "并发面乙", startsAt: "2026-10-14T09:00:00+08:00", endsAt: "2026-10-14T10:00:00+08:00" })]);
    assert.equal(raceWrites.filter(item => item.status === "fulfilled").length, 1); assert.match(String((raceWrites.find(item => item.status === "rejected") as PromiseRejectedResult).reason), /changed/);
    const historyCount = (await db.query("SELECT count(*)::int total FROM hr_candidate_interview_history WHERE interview_id=$1", [first.id]))[0].total;
    failAudit = true; await assert.rejects(service.update(scope, actor, candidate.id, String(first.id), { ...scheduled(4), status: "completed", outcome: "pass", resultNotes: "不得提交", cancellationReason: null }), /required audit unavailable/); failAudit = false;
    assert.equal((await service.detail(scope, actor, candidate.id, String(first.id))).version, 4); assert.equal((await db.query("SELECT count(*)::int total FROM hr_candidate_interview_history WHERE interview_id=$1", [first.id]))[0].total, historyCount);
    failAudit = true; await assert.rejects(service.list(scope, actor, candidate.id, { page: 1, page_size: 20 }), /required audit unavailable/); await assert.rejects(service.detail(scope, actor, candidate.id, String(first.id)), /required audit unavailable/); await assert.rejects(service.history(scope, actor, candidate.id, String(first.id), { page: 1, page_size: 20 }), /required audit unavailable/); failAudit = false;
    const readOnly = { ...actor, permissions: ["hr:candidate:read"] }; await service.detail(scope, readOnly, candidate.id, String(first.id)); await assert.rejects(service.update(scope, readOnly, candidate.id, String(first.id), { ...scheduled(4), status: "completed", outcome: "pass", resultNotes: "无权", cancellationReason: null }), /permission/i);
    for (const foreign of [{ ...scope, tenantId: "foreign" }, { ...scope, parkId: "foreign" }]) { await assert.rejects(service.detail(foreign, actor, candidate.id, String(first.id)), /Candidate not found/); await assert.rejects(service.create(foreign, actor, candidate.id, scheduled(0)), /Candidate not found/); }
    await db.query("UPDATE hr_candidate SET is_deleted=true WHERE id=$1", [candidate.id]); await assert.rejects(service.list(scope, actor, candidate.id, { page: 1, page_size: 20 }), /Candidate not found/); await assert.rejects(service.history(scope, actor, candidate.id, String(first.id), { page: 1, page_size: 20 }), /Candidate not found/);
    await assert.rejects(db.query("INSERT INTO hr_candidate_interview(tenant_id,park_id,candidate_id,version,round_label,starts_at,ends_at,location,interviewer_name,status,outcome,result_notes,cancellation_reason,updated_by) VALUES($1,$2,$3,1,'坏记录','2026-10-15T10:00:00Z','2026-10-15T09:00:00Z','A','B','scheduled','pending',NULL,NULL,$4)", [scope.tenantId, scope.parkId, otherCandidate.id, actorId]));
    await assert.rejects(db.query("INSERT INTO hr_candidate_interview_history(tenant_id,park_id,interview_id,candidate_id,version,round_label,starts_at,ends_at,location,interviewer_name,status,outcome,result_notes,cancellation_reason,actor_user_id) VALUES($1,$2,$3,$4,99,'错配','2026-10-15T09:00:00Z','2026-10-15T10:00:00Z','A','B','scheduled','pending',NULL,NULL,$5)", [scope.tenantId, scope.parkId, first.id, otherCandidate.id, actorId]));
    await assert.rejects(db.query("UPDATE hr_candidate_interview_history SET round_label='篡改' WHERE interview_id=$1", [first.id]), /append-only/); await assert.rejects(db.query("DELETE FROM hr_candidate_interview_history WHERE interview_id=$1", [first.id]), /append-only/);
    assert.deepEqual(await effects(), before);
  } finally { await db.destroy(); }
  // Root owns cleanup of the guarded isolated database after this test completes.
});
