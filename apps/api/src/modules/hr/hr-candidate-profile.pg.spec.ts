import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { type ExecutionContext } from "@nestjs/common";
import { firstValueFrom, from } from "rxjs";
import { IdempotencyRequestEntity } from "../../shared/entities/idempotency-request.entity";
import { IdempotencyService, setIdempotencyService } from "../../shared/services/idempotency.service";
import { HrCandidateProfileIdempotencyInterceptor } from "./hr-candidate-profile-idempotency.interceptor";
import { ConfigService } from "@nestjs/config";
import { DataSource, type EntityManager } from "typeorm";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { HrCandidateProfileService } from "./hr-candidate-profile.service";
import { HrRecruitmentService } from "./hr-recruitment.service";
const enabled = process.env.HR_CANDIDATE_PROFILE_PG === "1";

test("full-schema candidate profiles: encrypted partial corrections, frozen history, global CAS and atomic required audit", { skip: !enabled, timeout: 60_000 }, async () => {
 assert.equal(process.env.HR_CANDIDATE_PROFILE_ISOLATED, "yes"); assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15432"); assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_review_final_[0-9_]+$/);
 const db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15432, username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, entities: [IdempotencyRequestEntity], synchronize: false }); await db.initialize();
 try {
  const scope: TenantParkScope = { tenantId: "10000001", parkId: "20000001" }, actorId = randomUUID(), orgId = randomUUID(), suffix = randomUUID().slice(0, 8);
  await db.query("CREATE TABLE IF NOT EXISTS fixture_candidate_profile_audit(id bigserial primary key,payload jsonb not null)");
  await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'资料合成测试','not-a-login-hash','enabled')", [actorId, scope.tenantId, scope.parkId, `profile-${suffix}`]);
  await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,status,leader_user_id,create_by,update_by) VALUES($1,$2,$3,$4,'资料测试部门','department','enabled',$5,$5,$5)", [orgId, scope.tenantId, scope.parkId, `PF-${suffix}`, actorId]);
  const actor: JwtPrincipal = { ...scope, sub: actorId, username: "profile", roles: [], permissions: ["*"] }, masked = { ...actor, permissions: [HR_PERMISSIONS.HR_CANDIDATE_READ, HR_PERMISSIONS.HR_CANDIDATE_MANAGE] }, readOnly = { ...actor, permissions: [HR_PERMISSIONS.HR_CANDIDATE_READ] };
  let failAudit = false;
  const audit = { recordOperationRequired: async (event: unknown, manager?: EntityManager) => { if (failAudit) throw new Error("required audit unavailable"); assert.ok(manager); await manager!.query("INSERT INTO fixture_candidate_profile_audit(payload) VALUES($1::jsonb)", [JSON.stringify(event)]); } } as never;
  const sensitive = new PartySensitiveDataService(new ConfigService({ PARTY_DATA_ENCRYPTION_KEY: "profile-test-only-key-12345678901234567890" }));
  const recruitment = new HrRecruitmentService(db, sensitive, audit), service = new HrCandidateProfileService(db, sensitive, audit);
  const requisition = await recruitment.createRequisition(scope, actor, { requisitionCode: `PF-${suffix}`, title: "初始岗位", orgId, headcount: 3, ownerUserId: actorId, status: "open" });
  const target = await recruitment.createRequisition(scope, actor, { requisitionCode: `PF-Z-${suffix}`, title: "目标岗位", orgId, headcount: 3, ownerUserId: actorId, status: "draft" });
  const unavailable = await recruitment.createRequisition(scope, actor, { requisitionCode: `PF-X-${suffix}`, title: "停用岗位", orgId, headcount: 3, ownerUserId: actorId, status: "open" }); await db.query("UPDATE hr_recruitment_requisition SET status='closed' WHERE id=$1", [unavailable.id]);
  const candidate = await recruitment.createCandidate(scope, actor, { requisitionId: requisition.id, candidateNo: `C-${suffix}`, fullName: "合成候选人", mobile: "138 0000 0000", email: "Original@Example.com", identityNumber: "ab 1234", source: "初始来源", expectedOnboardDate: "2026-10-20" });
  const other = await recruitment.createCandidate(scope, actor, { requisitionId: requisition.id, candidateNo: `D-${suffix}`, fullName: "另一合成候选人" });
  const physical = async () => (await db.query("SELECT * FROM hr_candidate WHERE id=$1", [candidate.id]))[0];
  const effects = () => db.query("SELECT (SELECT count(*) FROM hr_employee) employees,(SELECT count(*) FROM hr_payroll_run) payroll,(SELECT count(*) FROM hr_payslip) payslips,(SELECT count(*) FROM biz_user_message) messages,(SELECT count(*) FROM sys_file) files,(SELECT count(*) FROM hr_recruitment_requisition) requisitions,(SELECT sum(hired_count) FROM hr_recruitment_requisition) hired_count");
  const beforeEffects = await effects(), original = await physical();
  assert.equal(sensitive.decrypt(original.mobile_encrypted), "13800000000"); assert.equal(sensitive.decrypt(original.email_encrypted), "original@example.com"); assert.equal(sensitive.decrypt(original.identity_encrypted), "AB1234");
  const first = await service.current(scope, actor, candidate.id); assert.equal(first.version, 1); assert.equal(first.expectedOnboardDate, "2026-10-20"); assert.equal(first.sensitiveAvailable, true);
  assert.ok(!/Encrypted|Fingerprint/.test(JSON.stringify(first)));
  const maskedCurrent = await service.current(scope, readOnly, candidate.id); assert.equal(maskedCurrent.sensitiveAvailable, false); assert.ok(!("mobile" in maskedCurrent));
  await assert.rejects(service.update(scope, actor, candidate.id, { expectedVersion: 1, changeReason: "相同", mobile: "138 0000 0000", email: "ORIGINAL@example.com", identityNumber: "ab1234" }), /no effective/);
  setIdempotencyService(new IdempotencyService(db.getRepository(IdempotencyRequestEntity), db));
  const replayInput = { expectedVersion: 1, changeReason: "更正姓名", fullName: "正式姓名", source: null }, replayKey = `profile-${suffix}`;
  const viaInterceptor = async (reader: JwtPrincipal) => {
   const request = { user: reader, body: replayInput, params: { id: candidate.id }, headers: { "x-idempotency-key": replayKey }, method: "PUT", path: `/hr/recruitment/candidates/${candidate.id}/profile`, query: {} };
   const response = { statusCode: 200, status: () => response };
   const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ExecutionContext;
   return await firstValueFrom(new HrCandidateProfileIdempotencyInterceptor(service).intercept(context, { handle: () => from(service.update(scope, reader, candidate.id, replayInput)) })) as Record<string, unknown>;
  };
  const second = await viaInterceptor(actor); assert.equal(second.version, 2); assert.equal(second.mobile, "13800000000");
  const cachedReceipt = (await db.query("SELECT response_body,status FROM sys_idempotency_request WHERE idempotency_key=$1", [replayKey]))[0]; assert.equal(cachedReceipt.status, "succeeded"); assert.equal(cachedReceipt.response_body.format, "hr_candidate_profile_v1"); assert.ok(!/13800000000|original@example|AB1234|正式姓名/.test(JSON.stringify(cachedReceipt.response_body)));
  const preserved = await physical(); for (const prefix of ["mobile", "email", "identity"]) for (const suffix of ["encrypted", "masked", "fingerprint"]) assert.equal(preserved[`${prefix}_${suffix}`], original[`${prefix}_${suffix}`]);
  const third = await service.update(scope, actor, candidate.id, { expectedVersion: 2, changeReason: "更正联系方式", mobile: "+86 13900000000", email: " NEW@Example.com ", identityNumber: "xy 5678", expectedOnboardDate: null }); assert.equal(third.version, 3); assert.equal(third.email, "new@example.com"); assert.equal(third.identityNumber, "XY5678");
  const corrected = await physical(); for (const [prefix, value] of [["mobile", "+8613900000000"], ["email", "new@example.com"], ["identity", "XY5678"]] as const) { assert.equal(sensitive.decrypt(corrected[`${prefix}_encrypted`]), value); assert.equal(corrected[`${prefix}_fingerprint`], sensitive.hash(value)); assert.equal(corrected[`${prefix}_masked`], sensitive.mask(value)); }
  const fourth = await service.update(scope, actor, candidate.id, { expectedVersion: 3, changeReason: "明确清空", mobile: null, email: null, identityNumber: null }); assert.equal(fourth.version, 4);
  const cleared = await physical(); for (const prefix of ["mobile", "email", "identity"]) for (const suffix of ["encrypted", "masked", "fingerprint"]) assert.equal(cleared[`${prefix}_${suffix}`], null);
  const p1 = await service.requisitionOptions(scope, masked, candidate.id, { page: 1, page_size: 1, keyword: suffix }), p2 = await service.requisitionOptions(scope, masked, candidate.id, { page: 2, page_size: 1, keyword: suffix }); assert.equal(p1.total, 2); assert.equal(p2.items.length, 1); assert.notEqual(p1.items[0]!.id, p2.items[0]!.id); assert.ok(p1.items.every(row => Object.keys(row).sort().join() === "id,orgName,requisitionCode,status,title"));
  await assert.rejects(service.update(scope, actor, candidate.id, { expectedVersion: 4, changeReason: "不可用", requisitionId: unavailable.id }), /requisition not found/);
  await assert.rejects(service.update(scope, actor, candidate.id, { expectedVersion: 4, changeReason: "不可用", requisitionId: randomUUID() }), /requisition not found/);
  await db.query("UPDATE hr_recruitment_requisition SET status='closed',is_deleted=true WHERE id=$1", [requisition.id]);
  const fifth = await service.update(scope, masked, candidate.id, { expectedVersion: 4, changeReason: "保留历史绑定", requisitionId: requisition.id, candidateNo: `N-${suffix}` }); assert.equal(fifth.version, 5);
  const sixth = await service.update(scope, actor, candidate.id, { expectedVersion: 5, changeReason: "更正岗位", requisitionId: target.id }); assert.equal(sixth.version, 6); assert.equal(sixth.requisitionTitle, "目标岗位");
  await db.query("UPDATE hr_recruitment_requisition SET title='当前已改名' WHERE id=$1", [target.id]);
  const frozen = await service.history(scope, actor, candidate.id, { page: 1, page_size: 1 }); assert.equal(frozen.total, 5); assert.equal(frozen.items[0]!.after.requisitionTitle, "目标岗位"); assert.equal(frozen.items[0]!.before.requisitionTitle, "初始岗位");
  for (let page = 1; page <= frozen.total; page++) { const history = await service.history(scope, readOnly, candidate.id, { page, page_size: 1 }); assert.equal(history.items.length, 1); assert.ok(!/Encrypted|Fingerprint|actorUserId|enc:v1/.test(JSON.stringify(history))); assert.ok(!("mobile" in history.items[0]!.before)); }
  const fullHistory = await service.history(scope, actor, candidate.id, { page: 4, page_size: 1 }); assert.equal(fullHistory.items[0]!.after.mobile, "+8613900000000");
  await assert.rejects(service.update(scope, actor, candidate.id, { expectedVersion: 6, changeReason: "重复编号", candidateNo: `D-${suffix}` }), /Candidate number already exists/);
  const concurrent = await Promise.allSettled([service.update(scope, masked, candidate.id, { expectedVersion: 6, changeReason: "并发甲", source: "甲" }), service.update(scope, masked, candidate.id, { expectedVersion: 6, changeReason: "并发乙", source: "乙" })]); assert.equal(concurrent.filter(row => row.status === "fulfilled").length, 1); assert.match(String((concurrent.find(row => row.status === "rejected") as PromiseRejectedResult).reason), /changed/);
  // Existing stage action owns the same candidate lock and increments the actual global version.
  await recruitment.moveCandidate(scope, actor, candidate.id, { toStage: "screening", evaluation: "合成阶段证据" }); const staged = await physical(); assert.equal(staged.version, 8);
  await assert.rejects(service.update(scope, actor, candidate.id, { expectedVersion: 7, changeReason: "阶段冲突", fullName: "不得提交" }), /changed/);
  const afterStage = await service.update(scope, masked, candidate.id, { expectedVersion: 8, changeReason: "阶段后更正", source: "完成" }); assert.equal(afterStage.version, 9);
  const maskedReplay = await viaInterceptor(masked); assert.equal(maskedReplay.version, 2); assert.equal(maskedReplay.fullName, "正式姓名"); assert.equal(maskedReplay.sensitiveAvailable, false); assert.ok(!("mobile" in maskedReplay));
  const fullReplay = await viaInterceptor(actor); assert.equal(fullReplay.version, 2); assert.equal(fullReplay.mobile, "13800000000"); assert.equal((await physical()).version, 9);
  failAudit = true; await assert.rejects(viaInterceptor(masked), /required audit/); failAudit = false;
  await assert.rejects(viaInterceptor(readOnly), /permission/);
  const gapHistory = await service.history(scope, actor, candidate.id, { page: 1, page_size: 1 }); assert.equal(gapHistory.items[0]!.before.version, 8); assert.equal(gapHistory.items[0]!.after.version, 9);
  const beforeFailure = await physical(), historyCount = (await db.query("SELECT count(*)::int total FROM hr_candidate_profile_history WHERE candidate_id=$1", [candidate.id]))[0].total;
  failAudit = true; await assert.rejects(service.update(scope, actor, candidate.id, { expectedVersion: 9, changeReason: "回滚", mobile: "13911111111", fullName: "不得提交" }), /required audit/); failAudit = false;
  assert.deepEqual(await physical(), beforeFailure); assert.equal((await db.query("SELECT count(*)::int total FROM hr_candidate_profile_history WHERE candidate_id=$1", [candidate.id]))[0].total, historyCount);
  failAudit = true; await assert.rejects(service.current(scope, actor, candidate.id), /required audit/); await assert.rejects(service.history(scope, actor, candidate.id, { page: 1, page_size: 20 }), /required audit/); await assert.rejects(service.requisitionOptions(scope, masked, candidate.id, { page: 1, page_size: 20 }), /required audit/); failAudit = false;
  await assert.rejects(service.update(scope, readOnly, candidate.id, { expectedVersion: 9, changeReason: "无权", fullName: "无权" }), /permission/); await assert.rejects(service.requisitionOptions(scope, readOnly, candidate.id, { page: 1, page_size: 20 }), /permission/); await assert.rejects(service.update(scope, masked, candidate.id, { expectedVersion: 9, changeReason: "无权", mobile: null }), /sensitive/);
  for (const foreign of [{ ...scope, tenantId: "foreign" }, { ...scope, parkId: "foreign" }]) { await assert.rejects(service.current(foreign, actor, candidate.id), /Candidate not found/); await assert.rejects(service.history(foreign, actor, candidate.id, { page: 1, page_size: 20 }), /Candidate not found/); await assert.rejects(service.update(foreign, actor, candidate.id, { expectedVersion: 9, changeReason: "跨范围", fullName: "拒绝" }), /Candidate not found/); await assert.rejects(service.requisitionOptions(foreign, actor, candidate.id, { page: 1, page_size: 20 }), /Candidate not found/); }
  await db.query("UPDATE hr_candidate SET stage='hired',version=version+1 WHERE id=$1", [candidate.id]); await assert.rejects(service.update(scope, actor, candidate.id, { expectedVersion: 10, changeReason: "录用不得改岗", requisitionId: unavailable.id }), /cannot change/); await assert.rejects(service.requisitionOptions(scope, actor, candidate.id, { page: 1, page_size: 20 }), /cannot change/); assert.equal((await service.update(scope, masked, candidate.id, { expectedVersion: 10, changeReason: "录用后基本资料", fullName: "录用后姓名", requisitionId: target.id })).version, 11);
  const stored = (await db.query("SELECT * FROM hr_candidate_profile_history WHERE candidate_id=$1 ORDER BY after_version LIMIT 1", [candidate.id]))[0]; assert.ok(!Object.hasOwn(stored.before_snapshot, "mobile"));
  await assert.rejects(db.query("UPDATE hr_candidate_profile_history SET change_reason='篡改' WHERE candidate_id=$1", [candidate.id]), /append-only/); await assert.rejects(db.query("DELETE FROM hr_candidate_profile_history WHERE candidate_id=$1", [candidate.id]), /append-only/);
  const validBefore = { ...stored.before_snapshot, version: 90 }, validAfter = { ...stored.after_snapshot, version: 91 };
  for (const [beforeSnapshot, afterSnapshot] of [[{ ...validBefore, mobile: "forbidden" }, validAfter], [validBefore, { ...validAfter, version: 92 }], [{ ...validBefore, id: other.id }, validAfter]]) await assert.rejects(db.query("INSERT INTO hr_candidate_profile_history(tenant_id,park_id,candidate_id,before_version,after_version,before_snapshot,after_snapshot,change_reason,actor_user_id) VALUES($1,$2,$3,90,91,$4,$5,'非法快照',$6)", [scope.tenantId, scope.parkId, candidate.id, JSON.stringify(beforeSnapshot), JSON.stringify(afterSnapshot), actorId]));
  const auditRows = await db.query("SELECT payload FROM fixture_candidate_profile_audit"); assert.ok(!/original@example|new@example|13800000000|XY5678|enc:v1/.test(JSON.stringify(auditRows)));
  await db.query("UPDATE hr_candidate SET is_deleted=true WHERE id=$1", [candidate.id]); await assert.rejects(service.current(scope, actor, candidate.id), /Candidate not found/); await assert.rejects(service.history(scope, actor, candidate.id, { page: 1, page_size: 20 }), /Candidate not found/); await assert.rejects(service.update(scope, actor, candidate.id, { expectedVersion: 11, changeReason: "删除", fullName: "拒绝" }), /Candidate not found/);
  assert.deepEqual(await effects(), beforeEffects);
 } finally { setIdempotencyService(null); await db.destroy(); }
 // Root creates/migrates/runs/drops the guarded isolated DB and proves zero residual.
});
