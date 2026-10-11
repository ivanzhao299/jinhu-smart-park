import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { HrRecruitmentService } from "./hr-recruitment.service";

const enabled = process.env.HR_CANDIDATE_TRANSFER_PG === "1";
test("full-schema conversion carries formal profile and atomically rejects conflicts/audit failures", { skip: !enabled, timeout: 60_000 }, async () => {
  assert.equal(process.env.HR_CANDIDATE_TRANSFER_ISOLATED, "yes");
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15432");
  assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_review_final_[0-9_]+$/);
  const db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15432,
    username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
  await db.initialize();
  try {
    const scope = { tenantId: "10000001", parkId: "20000001" }, user = randomUUID(), org = randomUUID(), suffix = randomUUID();
    await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'资料合成办理人','not-a-login-hash','enabled')", [user, scope.tenantId, scope.parkId, suffix]);
    await db.query("INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,status) VALUES($1,$2,$3,$4,'资料测试组织','department','enabled')", [org, scope.tenantId, scope.parkId, suffix]);
    await db.query("CREATE TABLE fixture_transfer_audit(payload jsonb NOT NULL)");
    let failAudit = false;
    const sensitive = new PartySensitiveDataService(new ConfigService({ PARTY_DATA_ENCRYPTION_KEY: "test-only-party-key-12345678901234567890" }));
    const service = new HrRecruitmentService(db, sensitive, { recordOperationRequired: async (payload: unknown, manager: EntityManager) => {
      if (failAudit) throw new Error("required audit unavailable");
      await manager.query("INSERT INTO fixture_transfer_audit VALUES($1::jsonb)", [JSON.stringify(payload)]);
    } } as never);
    const actor = { ...scope, sub: user, username: "fixture", roles: [], permissions: ["*"] };
    const counts = async () => (await db.query(`SELECT (SELECT count(*) FROM hr_employee)::int employees,
      (SELECT count(*) FROM hr_employee_profile)::int profiles,(SELECT count(*) FROM hr_lifecycle_checklist)::int checklists,
      (SELECT count(*) FROM hr_candidate_conversion)::int conversions,(SELECT count(*) FROM fixture_transfer_audit)::int audits,
      (SELECT count(*) FROM hr_payroll_run)::int payroll,(SELECT count(*) FROM biz_user_message)::int messages`))[0];
    const make = async (identity?: string) => {
      const key = randomUUID();
      const req = await service.createRequisition(scope, actor, { requisitionCode: key, title: "资料衔接", orgId: org, headcount: 2, ownerUserId: user, status: "open" });
      const c = await service.createCandidate(scope, actor, { requisitionId: req.id, candidateNo: key, fullName: key,
        mobile: "13800138000", email: "person@example.test", identityNumber: identity });
      for (const toStage of ["screening", "interview", "offer"]) await service.moveCandidate(scope, actor, c.id, { toStage });
      return { candidateId: c.id, requisitionId: req.id, code: key };
    };
    const first = await make("AB123456"); const baseline = await counts();
    const race = await Promise.allSettled([service.convert(scope, actor, first.candidateId, { employeeCode: first.code }), service.convert(scope, actor, first.candidateId, { employeeCode: first.code })]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
    const result = (race.find(item => item.status === "fulfilled") as PromiseFulfilledResult<{ employeeId: string }>).value;
    const [profile] = await db.query("SELECT * FROM hr_employee_profile WHERE employee_id=$1", [result.employeeId]);
    assert.equal(profile.personal_mobile, "13800138000"); assert.equal(profile.personal_email, "person@example.test");
    assert.equal(sensitive.decrypt(profile.id_number_encrypted), "AB123456"); assert.equal(profile.id_type, null); assert.equal(profile.version, 1);
    const [evidence] = await db.query("SELECT evidence FROM hr_candidate_conversion WHERE candidate_id=$1", [first.candidateId]);
    assert.equal(evidence.evidence.profileTransfer.afterVersion, 1);
    const serialized = JSON.stringify([evidence, ...(await db.query("SELECT payload FROM fixture_transfer_audit"))]);
    for (const value of ["13800138000", "person@example.test", "AB123456", "enc:v1:", "hmac256:"]) assert.ok(!serialized.includes(value));
    const after = await counts(); assert.equal(after.payroll, baseline.payroll); assert.equal(after.messages, baseline.messages);
    const rollback = async (identity: string, expected: RegExp, auditFailure = false) => {
      const fixture = await make(identity), before = await counts(); failAudit = auditFailure;
      await assert.rejects(service.convert(scope, actor, fixture.candidateId, { employeeCode: fixture.code }), expected); failAudit = false;
      assert.deepEqual(await counts(), before);
      const [state] = await db.query("SELECT c.stage,c.converted_employee_id,r.hired_count FROM hr_candidate c JOIN hr_recruitment_requisition r ON r.id=c.requisition_id WHERE c.id=$1", [fixture.candidateId]);
      assert.deepEqual(state, { stage: "offer", converted_employee_id: null, hired_count: 0 });
    };
    await rollback("AB123456", /HR_CANDIDATE_PROFILE_IDENTITY_CONFLICT/);
    await rollback("XY123456", /required audit unavailable/, true);
    const denied = await make(); const deniedBefore = await counts();
    await assert.rejects(service.convert(scope, { ...actor, permissions: [HR_PERMISSIONS.HR_CANDIDATE_CONVERT] }, denied.candidateId, { employeeCode: denied.code }), /员工档案管理权限/);
    assert.deepEqual(await counts(), deniedBefore);
    const corrupt = await make(); await db.query("UPDATE hr_candidate SET mobile_encrypted='invalid' WHERE id=$1", [corrupt.candidateId]);
    const corruptBefore = await counts();
    await assert.rejects(service.convert(scope, actor, corrupt.candidateId, { employeeCode: corrupt.code }), /HR_CANDIDATE_PROFILE_SOURCE_CONFLICT/);
    assert.deepEqual(await counts(), corruptBefore);
    for (const deleted of [false, true]) {
      const conflict = await make();
      const [target] = await db.query("INSERT INTO hr_employee(tenant_id,park_id,employee_code,full_name,primary_org_id) SELECT tenant_id,park_id,$2,full_name,$3 FROM hr_candidate WHERE id=$1 RETURNING id", [conflict.candidateId, conflict.code, org]);
      await db.query("INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,personal_mobile,is_deleted) VALUES($1,$2,$3,'13900139000',$4)", [scope.tenantId, scope.parkId, target.id, deleted]);
      const beforeConflict = await counts();
      await assert.rejects(service.convert(scope, actor, conflict.candidateId, { employeeCode: conflict.code }), /HR_CANDIDATE_PROFILE_TARGET_CONFLICT/);
      assert.deepEqual(await counts(), beforeConflict);
    }
    const existing = await make();
    const [employee] = await db.query("INSERT INTO hr_employee(tenant_id,park_id,employee_code,full_name,primary_org_id) SELECT tenant_id,park_id,$2,full_name,$3 FROM hr_candidate WHERE id=$1 RETURNING id", [existing.candidateId, existing.code, org]);
    await db.query("INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,personal_email,address,version) VALUES($1,$2,$3,'PERSON@EXAMPLE.TEST','保留地址',4)", [scope.tenantId, scope.parkId, employee.id]);
    await service.convert(scope, actor, existing.candidateId, { employeeCode: existing.code });
    const [preserved] = await db.query("SELECT personal_mobile,personal_email,address,version FROM hr_employee_profile WHERE employee_id=$1", [employee.id]);
    assert.deepEqual(preserved, { personal_mobile: "13800138000", personal_email: "PERSON@EXAMPLE.TEST", address: "保留地址", version: 5 });
  } finally { await db.destroy(); }
});
