import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { DataSource } from "typeorm";
import { HR_INSURANCE_OWNED_PERMISSIONS, HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { LoginLogEntity } from "../audit/entities/login-log.entity";
import { OpLogEntity } from "../audit/entities/op-log.entity";
import { HR_INSURANCE_KINDS } from "./hr-insurance-calculation";
import { HrInsuranceOwnedPeriodService } from "./hr-insurance-owned-period.service";
import { HrInsurancePolicyVersionService } from "./hr-insurance-policy-version.service";

const enabled = process.env.HR_INSURANCE_OWNED_PERIOD_PG === "1";
const scope = { tenantId: "owned-period-service-fixture", parkId: "owned-period-service-fixture" };
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic-owned", roles: [], permissions: [
  HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ,
  HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE, ...Object.values(HR_INSURANCE_OWNED_PERMISSIONS)] };
let db: DataSource, service: HrInsuranceOwnedPeriodService, policy: HrInsurancePolicyVersionService;
before(async () => {
  if (!enabled) return;
  assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u);
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.HR_INSURANCE_OWNED_PERIOD_ISOLATED, "yes");
  db = new DataSource({ type: "postgres", host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, entities: [OpLogEntity, LoginLogEntity], synchronize: false });
  await db.initialize();
  const audit = new AuditService(db.getRepository(LoginLogEntity), db.getRepository(OpLogEntity));
  service = new HrInsuranceOwnedPeriodService(db, audit); policy = new HrInsurancePolicyVersionService(db, audit);
});
after(async () => { if (db?.isInitialized) await db.destroy(); });

async function fixture() {
  const employeeId = randomUUID();
  await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status) VALUES($1,$2,$3,$4,'合成测试人员','active')", [employeeId, scope.tenantId, scope.parkId, `SYNTHETIC-${employeeId}`]);
  const version = await policy.create(scope, actor, { requestId: randomUUID(), policyCode: `SYN-${randomUUID()}`, policyName: "合成政策", variantNo: 1,
    effectiveFrom: "2026-01", effectiveThrough: "2026-12", reason: "合成规则", items: HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind,
      factors: { base: { rate: "0.01", fixedAmount: null }, employer: { rate: "0.01", fixedAmount: "0.005" }, employee: { rate: "0.01", fixedAmount: null }, supplement: { rate: "0.01", fixedAmount: null } } })) });
  return { requestId: randomUUID(), employeeId, expectedEmployeeVersion: 1, policyVersionId: version.id, expectedDefinitionHash: version.definitionHash,
    periodMonth: "2026-10", includeFund: false, bases: HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind, contributionBase: "10.00" })) };
}
function confirmation(preview: { id: string; previewHash: string }) { return { requestId: randomUUID(), previewId: preview.id, expectedPreviewHash: preview.previewHash, reason: "合成确认" }; }
async function count(table: string, requestId: string) {
  assert.ok(["hr_insurance_owned_preview", "hr_insurance_owned_revision", "hr_insurance_owned_close"].includes(table));
  return (await db.query(`SELECT count(*)::int n FROM ${table} WHERE request_id=$1`, [requestId]))[0].n as number;
}

test("full-schema exact lifecycle coexists with history; catalog survives full seed replay without grants", { skip: !enabled }, async () => {
  const dto = await fixture(), historicalId = randomUUID();
  const options = await service.employeeOptions(scope, actor, { page: 1, page_size: 20, keyword: `SYNTHETIC-${dto.employeeId}` });
  assert.equal(options.total, 1); assert.deepEqual(options.items[0], { id: dto.employeeId, employeeCode: `SYNTHETIC-${dto.employeeId}`, fullName: "合成测试人员", version: 1, employmentStatus: "active", previewEligible: true });
  await db.query("INSERT INTO hr_employee_insurance_period(id,tenant_id,park_id,employee_id,period_year,period_month,legacy_id) VALUES($1,$2,$3,$4,2026,10,771)", [historicalId, scope.tenantId, scope.parkId, dto.employeeId]);
  await db.query("INSERT INTO hr_employee_insurance_item(tenant_id,park_id,period_id,insurance_kind,contribution_base,employee_amount) VALUES($1,$2,$3,'oldage',10,0.1)", [scope.tenantId, scope.parkId, historicalId]);
  const history = async () => (await db.query("SELECT row_to_json(p) AS period,(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM hr_employee_insurance_item i WHERE i.period_id=p.id) AS items FROM hr_employee_insurance_period p WHERE p.id=$1", [historicalId]))[0];
  const before = await history();
  const preview = await service.preview(scope, actor, dto); assert.equal(preview.calculation.totals.employee, "0.50"); assert.equal(preview.calculation.totals.employer, "0.55");
  const confirm = confirmation(preview), confirmed = await service.confirm(scope, actor, confirm);
  const second = await service.preview(scope, actor, { ...dto, requestId: randomUUID(), includeFund: true });
  const correct = { ...confirmation(second), previousRevisionId: confirmed.id, expectedPeriodVersion: 1 };
  await assert.rejects(service.correct(scope, actor, correct), /REQUIRES_LATEST_CLOSED_REVISION/u);
  const close = { requestId: randomUUID(), revisionId: confirmed.id, expectedPeriodVersion: 1, reason: "合成关账" };
  const closed = await service.close(scope, actor, close);
  const corrected = await service.correct(scope, actor, correct); assert.equal(corrected.revisionNo, 2); assert.equal(corrected.calculation.totals.employee, "0.60");
  assert.equal((await service.confirm(scope, actor, confirm)).id, confirmed.id);
  assert.equal((await service.close(scope, actor, close)).id, closed.id);
  assert.equal((await service.correct(scope, actor, correct)).id, corrected.id);
  await assert.rejects(service.close(scope, actor, { ...close, requestId: randomUUID() }), /REQUIRES_CURRENT_REVISION/u);
  const old = await service.detail(scope, actor, confirmed.id); assert.equal(old.current, false); assert.equal(old.status, "closed");
  const current = await service.detail(scope, actor, corrected.id); assert.equal(current.current, true); assert.equal(current.status, "confirmed");
  const list = await service.list(scope, actor, { page: 1, page_size: 20, keyword: `SYNTHETIC-${dto.employeeId}` }); assert.equal(list.total, 2);
  assert.deepEqual(await history(), before);
  const logs: Array<{ after_json: object }> = await db.query("SELECT after_json FROM sys_op_log WHERE resource='hr.insurance_owned_period' AND biz_id=$1", [confirmed.id]);
  assert.ok(logs.length >= 3); assert.ok(logs.every(l => !JSON.stringify(l.after_json).includes('"0.50"')));
  const codes = Object.values(HR_INSURANCE_OWNED_PERMISSIONS);
  const rawLogs = mkdtempSync(join(tmpdir(), "jinhu-owned-catalog-fixture-"));
  const seed = () => execFileSync("sh", [resolve("../../scripts/db-seed-prod.sh")], { env: { ...process.env, ALLOW_PRODUCTION_SEED: "yes" }, maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(join(rawLogs, "seed-first.log"), seed(), { mode: 0o600 });
  const catalog = async () => db.query("SELECT p.id,p.code,p.resource,p.action,p.api_path,p.permission_path,p.perm_path,p.level,p.permission_level,parent.code AS parent_code FROM sys_permission p JOIN sys_permission parent ON parent.id=p.parent_id WHERE p.tenant_id='10000001' AND p.park_id='20000001' AND p.code=ANY($1::text[]) AND NOT p.is_deleted ORDER BY p.code", [codes]);
  const firstCatalog = await catalog(); assert.equal(firstCatalog.length, 4);
  assert.ok(firstCatalog.every((p: { parent_code: string; level: number }) => p.parent_code === "hr:insurance" && p.level === 3));
  const grantCount = async () => (await db.query("SELECT count(*)::int n FROM rel_role_perm r JOIN sys_permission p ON p.id=r.permission_id WHERE p.code=ANY($1::text[])", [codes]))[0].n;
  assert.equal(await grantCount(), 0);
  writeFileSync(join(rawLogs, "seed-second.log"), seed(), { mode: 0o600 });
  assert.deepEqual(await catalog(), firstCatalog); assert.equal(await grantCount(), 0);
  assert.deepEqual(await history(), before);
});

test("full-schema period filters keep count/data scoped and current independent of status", { skip: !enabled }, async () => {
  const october = await fixture();
  const first = await service.confirm(scope, actor, confirmation(await service.preview(scope, actor, october)));
  await service.close(scope, actor, { requestId: randomUUID(), revisionId: first.id, expectedPeriodVersion: first.revisionNo, reason: "合成关账" });
  const correctionPreview = await service.preview(scope, actor, { ...october, requestId: randomUUID(), includeFund: true });
  const correction = await service.correct(scope, actor, { ...confirmation(correctionPreview), previousRevisionId: first.id, expectedPeriodVersion: first.revisionNo });
  const november = await service.confirm(scope, actor, confirmation(await service.preview(scope, actor, { ...october, requestId: randomUUID(), periodMonth: "2026-11" })));
  const all = await service.list(scope, actor, { page: 1, page_size: 20, keyword: `SYNTHETIC-${october.employeeId}` });
  assert.equal(all.total, 3); assert.deepEqual(all.items.map(item => item.id), [november.id, correction.id, first.id]);
  const octoberRows = await service.list(scope, actor, { page: 1, page_size: 20, keyword: `SYNTHETIC-${october.employeeId}`, period_month: "2026-10" });
  assert.equal(octoberRows.total, 2); assert.deepEqual(octoberRows.items.map(item => [item.id, item.status, item.current]), [[correction.id, "confirmed", true], [first.id, "closed", false]]);
  const closedCurrent = await service.list(scope, actor, { page: 1, page_size: 20, keyword: `SYNTHETIC-${october.employeeId}`, status: "closed", revision: "current" });
  assert.equal(closedCurrent.total, 0);
  const closedHistory = await service.list(scope, actor, { page: 1, page_size: 20, keyword: `SYNTHETIC-${october.employeeId}`, status: "closed", revision: "history" });
  assert.deepEqual(closedHistory.items.map(item => item.id), [first.id]); assert.equal(closedHistory.total, 1);
  const currentPage = await service.list(scope, actor, { page: 1, page_size: 1, keyword: `SYNTHETIC-${october.employeeId}`, revision: "current" });
  const currentSecondPage = await service.list(scope, actor, { page: 2, page_size: 1, keyword: `SYNTHETIC-${october.employeeId}`, revision: "current" });
  assert.equal(currentPage.total, 2); assert.equal(currentSecondPage.total, 2); assert.notEqual(currentPage.items[0]?.id, currentSecondPage.items[0]?.id);
});

test("full-schema stable retries precede employee drift and reject actor/content or source changes", { skip: !enabled }, async () => {
  const dto = await fixture(), preview = await service.preview(scope, actor, dto), confirm = confirmation(preview);
  const confirmed = await service.confirm(scope, actor, confirm);
  await db.query("UPDATE hr_employee SET version=2,employment_status='suspended' WHERE id=$1", [dto.employeeId]);
  const options = await service.employeeOptions(scope, actor, { page: 1, page_size: 20, keyword: `SYNTHETIC-${dto.employeeId}` }); assert.equal(options.items[0]!.version, 2); assert.equal(options.items[0]!.previewEligible, false);
  assert.equal((await service.preview(scope, actor, { ...dto, bases: [...dto.bases].reverse().map(b => ({ ...b, contributionBase: "0010" })) })).id, preview.id);
  assert.equal((await service.confirm(scope, actor, confirm)).id, confirmed.id);
  await assert.rejects(service.preview(scope, actor, { ...dto, includeFund: true }), /REQUEST_CONFLICT/u);
  await assert.rejects(service.confirm(scope, { ...actor, sub: randomUUID() }, confirm), /REQUEST_CONFLICT/u);
  await assert.rejects(service.preview(scope, actor, { ...dto, requestId: randomUUID() }), /EMPLOYEE_CHANGED_OR_INELIGIBLE/u);
  await assert.rejects(service.detail({ ...scope, parkId: "foreign" }, actor, confirmed.id), /SOURCE_NOT_FOUND/u);
});

test("full-schema unconfirmed preview refuses drift, wrong hash, actor and expired input", { skip: !enabled }, async () => {
  const dto = await fixture(), preview = await service.preview(scope, actor, dto);
  await assert.rejects(service.confirm(scope, actor, { ...confirmation(preview), expectedPreviewHash: "b".repeat(64) }), /PREVIEW_CHANGED/u);
  await assert.rejects(service.confirm(scope, { ...actor, sub: randomUUID() }, confirmation(preview)), /SOURCE_NOT_FOUND/u);
  const expiredId = randomUUID();
  const expiredRequest = { ...dto, requestId: randomUUID() };
  const requestHash = createHash("sha256").update(JSON.stringify({ ...expiredRequest, tenantId: scope.tenantId, parkId: scope.parkId, actorId: actor.sub })).digest("hex");
  await db.query("INSERT INTO hr_insurance_owned_preview(id,tenant_id,park_id,request_id,request_sha256,employee_id,employee_version,policy_version_id,policy_definition_sha256,period_month,include_fund,created_by,created_at,expires_at,input_snapshot,result) SELECT $2,tenant_id,park_id,$3,$4,employee_id,employee_version,policy_version_id,policy_definition_sha256,period_month,include_fund,created_by,clock_timestamp()-interval '21 minutes',clock_timestamp()-interval '1 minute',input_snapshot,result FROM hr_insurance_owned_preview WHERE id=$1", [preview.id, expiredId, expiredRequest.requestId, requestHash]);
  const expiredReplay = await service.preview(scope, actor, expiredRequest); assert.equal(expiredReplay.id, expiredId); assert.equal(expiredReplay.replayed, true);
  await assert.rejects(service.confirm(scope, actor, confirmation({ id: expiredId, previewHash: preview.previewHash })), /PREVIEW_STALE_OR_FOREIGN/u);
  await db.query("UPDATE hr_employee SET version=2 WHERE id=$1", [dto.employeeId]);
  const confirm = confirmation(preview); await assert.rejects(service.confirm(scope, actor, confirm), /EMPLOYEE_CHANGED_OR_INELIGIBLE/u); assert.equal(await count("hr_insurance_owned_revision", confirm.requestId), 0);
});

test("full-schema required audit failure rolls back preview, confirmation, close and correction", { skip: !enabled }, async () => {
  const dto = await fixture(), preview = await service.preview(scope, actor, dto), confirm = confirmation(preview);
  const confirmed = await service.confirm(scope, actor, confirm);
  const second = await service.preview(scope, actor, { ...dto, requestId: randomUUID() });
  const close = { requestId: randomUUID(), revisionId: confirmed.id, expectedPeriodVersion: 1, reason: "合成关账" };
  const november = await service.preview(scope, actor, { ...dto, requestId: randomUUID(), periodMonth: "2026-11" });
  const failPreview = { ...dto, requestId: randomUUID() }, failConfirm = confirmation(second);
  await db.query("CREATE FUNCTION owned_period_fixture_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource='hr.insurance_owned_period' THEN RAISE EXCEPTION 'synthetic owned audit failure'; END IF; RETURN NEW; END $$");
  await db.query("CREATE TRIGGER owned_period_fixture_audit_fail BEFORE INSERT ON sys_op_log FOR EACH ROW EXECUTE FUNCTION owned_period_fixture_audit_fail()");
  try {
    await assert.rejects(service.preview(scope, actor, failPreview), /synthetic owned audit failure/u); assert.equal(await count("hr_insurance_owned_preview", failPreview.requestId), 0);
    await assert.rejects(service.close(scope, actor, close), /synthetic owned audit failure/u); assert.equal(await count("hr_insurance_owned_close", close.requestId), 0);
    const newConfirm = confirmation(november);
    await assert.rejects(service.confirm(scope, actor, newConfirm), /synthetic owned audit failure/u); assert.equal(await count("hr_insurance_owned_revision", newConfirm.requestId), 0);
    await assert.rejects(service.detail(scope, actor, confirmed.id), /synthetic owned audit failure/u);
  } finally { await db.query("DROP TRIGGER owned_period_fixture_audit_fail ON sys_op_log"); await db.query("DROP FUNCTION owned_period_fixture_audit_fail()"); }
  await service.close(scope, actor, close);
  const correction = { ...failConfirm, previousRevisionId: confirmed.id, expectedPeriodVersion: 1 };
  await db.query("CREATE FUNCTION owned_period_fixture_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource='hr.insurance_owned_period' THEN RAISE EXCEPTION 'synthetic owned audit failure'; END IF; RETURN NEW; END $$");
  await db.query("CREATE TRIGGER owned_period_fixture_audit_fail BEFORE INSERT ON sys_op_log FOR EACH ROW EXECUTE FUNCTION owned_period_fixture_audit_fail()");
  try { await assert.rejects(service.correct(scope, actor, correction), /synthetic owned audit failure/u); assert.equal(await count("hr_insurance_owned_revision", correction.requestId), 0); }
  finally { await db.query("DROP TRIGGER owned_period_fixture_audit_fail ON sys_op_log"); await db.query("DROP FUNCTION owned_period_fixture_audit_fail()"); }
  assert.equal((await service.correct(scope, actor, correction)).revisionNo, 2);
});

test("full-schema parallel first confirmations, close and corrections preserve one successor", { skip: !enabled }, async () => {
  const dto = await fixture(), one = await service.preview(scope, actor, dto), two = await service.preview(scope, actor, { ...dto, requestId: randomUUID() });
  const results = await Promise.allSettled([service.confirm(scope, actor, confirmation(one)), service.confirm(scope, actor, confirmation(two))]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const won = results.find(r => r.status === "fulfilled"); assert.ok(won?.status === "fulfilled");
  const close = { requestId: randomUUID(), revisionId: won.value.id, expectedPeriodVersion: 1, reason: "合成并发关账" };
  const closes = await Promise.all([service.close(scope, actor, close), service.close(scope, actor, close)]); assert.equal(closes[0].id, closes[1].id); assert.equal(closes.filter(c => c.replayed).length, 1);
  const three = await service.preview(scope, actor, { ...dto, requestId: randomUUID() }), four = await service.preview(scope, actor, { ...dto, requestId: randomUUID() });
  const changes = await Promise.allSettled([three, four].map(p => service.correct(scope, actor, { ...confirmation(p), previousRevisionId: won.value.id, expectedPeriodVersion: 1 })));
  assert.equal(changes.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_insurance_owned_revision WHERE employee_id=$1", [dto.employeeId]))[0].n, 2);
});
