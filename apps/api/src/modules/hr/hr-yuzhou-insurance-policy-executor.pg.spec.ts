import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { DataSource } from "typeorm";
import { HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { AuditService } from "../audit/audit.service";
import { LoginLogEntity } from "../audit/entities/login-log.entity";
import { OpLogEntity } from "../audit/entities/op-log.entity";
import { profileCanonical } from "./hr-yuzhou-profile-baseline";
import { executeYuzhouInsurancePolicyItem, type InsurancePolicyImportItem } from "./hr-yuzhou-insurance-policy-executor";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";
import { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
const enabled = process.env.HR_INSURANCE_EXECUTOR_PG_REQUIRED === "1";
const database = `jinhu_hr_policy_executor_lab_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const scope = { tenantId: "fixture-tenant", parkId: "fixture-park" };
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic-policy-import", roles: [], permissions: [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE] };
const hash = (v: unknown) => createHash("sha256").update(profileCanonical(v)).digest("hex");
const sensitive = new PartySensitiveDataService({ get: (key: string) => key === "PARTY_DATA_ENCRYPTION_KEY" ? "synthetic-policy-executor-test-key-1234567890" : undefined } as never);
const facts = () => ({ name: "synthetic private policy", scopeDescription: null, items: ["oldage", "remedy", "losework", "fund", "wound", "bear"].map(kind => ({ kind, variant: 1, baseRate: null, employerRate: "0.125", employeeRate: "0", supplementRate: "1", baseFixedAmount: null, employerFixedAmount: "-1.25", employeeFixedAmount: "0", supplementFixedAmount: "1" })) });
function item(key = randomUUID(), fields: Record<string, unknown> = facts()): InsurancePolicyImportItem {
  const body = { domain: "insurance_policy" as const, sourceTable: "dbo.insure_method", sourceKey: `sha256:${hash(key)}`, fields };
  return { ...body, rowDigest: hash({ ...body, sourceUpdatedAt: null }) };
}
let admin: DataSource, db: DataSource, audit: AuditService, created = false;
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.ok(["55491", "55641"].includes(process.env.POSTGRES_PORT ?? ""));
  const config = { type: "postgres" as const, host: "127.0.0.1", port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD };
  admin = new DataSource({ ...config, database: "postgres" }); await admin.initialize();
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`); created = true;
  db = new DataSource({ ...config, database, entities: [OpLogEntity, LoginLogEntity], synchronize: true }); await db.initialize();
  assert.equal((await db.query("SELECT current_database() name"))[0].name, database);
  await db.query('CREATE EXTENSION pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE TABLE hr_employee(id uuid PRIMARY KEY); CREATE TABLE sys_user(tenant_id varchar(64),park_id varchar(64),id uuid PRIMARY KEY,UNIQUE(tenant_id,park_id,id)); CREATE TABLE hr_legacy_identity_registry(owner_record_map_id uuid,mapping_status varchar(32))');
  for (const name of ["000235_hr_legacy_migration_control", "000239_hr_attendance_insurance_history", "000278_hr_yuzhou_production_import_control", "000281_hr_yuzhou_production_import_control_v2", "000282_hr_yuzhou_production_import_writer_receipts", "000299_hr_insurance_policy_fixed_amounts", "000327_hr_yuzhou_incremental_import_ledger", "000329_hr_incremental_initial_baseline", "000341_hr_incremental_insurance_policy"]) await db.query(readFileSync(resolve(__dirname, `../../../../../database/migrations/${name}.sql`), "utf8"));
  await db.query("INSERT INTO sys_user VALUES($1,$2,$3)", [scope.tenantId, scope.parkId, actor.sub]);
  audit = new AuditService(db.getRepository(LoginLogEntity), db.getRepository(OpLogEntity));
});
after(async () => {
  if (db?.isInitialized) await db.destroy();
  if (admin?.isInitialized) { if (created) await admin.query(`DROP DATABASE "${database}" WITH(FORCE)`); assert.equal((await admin.query("SELECT count(*)::int n FROM pg_database WHERE datname=$1", [database]))[0].n, 0); await admin.destroy(); }
});
async function operation() {
  return (await db.query(`INSERT INTO hr_incremental_import_operation(tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,item_count,created_by) VALUES($1,$2,'yuzhou-v10',$3,$4,$5,1,$6) RETURNING id`, [scope.tenantId, scope.parkId, randomUUID(), hash(randomUUID()), sensitive.encrypt("synthetic"), actor.sub]))[0].id as string;
}
async function execute(value: InsurancePolicyImportItem, op?: string, principal = actor) {
  return db.transaction(m => executeYuzhouInsurancePolicyItem(m, scope, principal, value, sensitive, audit, op));
}
async function snapshot() {
  return Promise.all(["hr_insurance_policy", "hr_insurance_policy_item", "hr_employee_insurance_period", "hr_incremental_import_item", "hr_incremental_insurance_policy_binding", "hr_incremental_import_revision", "sys_op_log"].map(table => db.query(`SELECT row_to_json(r) row FROM ${table} r ORDER BY row_to_json(r)::text`)));
}
async function policy(value: InsurancePolicyImportItem) { return (await db.query("SELECT p.* FROM hr_insurance_policy p JOIN hr_incremental_import_item i ON i.target_id=p.id WHERE i.source_key=$1", [value.sourceKey]))[0]; }

test("preview has no business/ledger writes; commit creates encrypted binding, real mandatory audit and six formal items", { skip: !enabled }, async () => {
  const value = item(), before = await snapshot();
  const preview = await execute(value); assert.equal(typeof preview, "object"); assert.equal((preview as { action: string }).action, "create"); assert.deepEqual(await snapshot(), before);
  const op = await operation(); assert.equal(await execute(value, op), "applied");
  const parent = await policy(value); assert.equal(parent.status, "historical"); assert.equal(parent.version, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_insurance_policy_item WHERE policy_id=$1", [parent.id]))[0].n, 6);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_employee_insurance_period"))[0].n, 0);
  const ledger = (await db.query("SELECT * FROM hr_incremental_import_item WHERE source_key=$1", [value.sourceKey]))[0];
  assert.deepEqual(ledger.field_baseline, {}); assert.deepEqual(ledger.target_baseline, {});
  assert.match(ledger.baseline_encrypted, /^enc:v1:/u); assert.equal(JSON.stringify(ledger).includes("synthetic private policy"), false);
  const logs = await db.query("SELECT after_json FROM sys_op_log WHERE biz_id=$1", [op]); assert.equal(logs.length, 1);
  assert.equal(JSON.stringify(logs).includes("synthetic private policy"), false); assert.equal(logs[0].after_json.activated, false);
  const accepted = await snapshot(); assert.equal(await execute(value, op), "applied"); assert.deepEqual(await snapshot(), accepted);
  assert.equal(await execute(value, await operation()), "unchanged"); assert.equal((await policy(value)).version, 1);
});
test("source unchanged preserves modern edits; independent source corrections selectively update nullable exact factors", { skip: !enabled }, async () => {
  const value = item(); await execute(value, await operation()); const parent = await policy(value);
  await db.query("UPDATE hr_insurance_policy SET policy_name='Modern policy',version=version+1 WHERE id=$1", [parent.id]);
  const updated = facts(); updated.items[0]!.employerRate = "0.15";
  const revised = { ...value, fields: updated, rowDigest: hash({ domain: value.domain, sourceTable: value.sourceTable, sourceKey: value.sourceKey, sourceUpdatedAt: null, fields: updated }) };
  assert.equal(await execute(revised, await operation()), "applied");
  assert.equal((await policy(value)).policy_name, "Modern policy");
  const factors = (await db.query("SELECT base_rate,employer_rate,employer_fixed_amount FROM hr_insurance_policy_item WHERE policy_id=$1 AND insurance_kind='oldage'", [parent.id]))[0];
  assert.deepEqual(factors, { base_rate: null, employer_rate: "0.150000", employer_fixed_amount: "-1.250" });
  const after = await policy(value); assert.equal(await execute(revised, await operation()), "unchanged"); assert.deepEqual(await policy(value), after);
});
test("same-field divergence records conflict without accepting the incoming source or changing target", { skip: !enabled }, async () => {
  const value = item(); await execute(value, await operation()); const parent = await policy(value);
  await db.query("UPDATE hr_insurance_policy SET policy_name='Modern change',version=version+1 WHERE id=$1", [parent.id]);
  const fields = { ...facts(), name: "Source change" }, revised = { ...value, fields, rowDigest: hash({ domain: value.domain, sourceTable: value.sourceTable, sourceKey: value.sourceKey, sourceUpdatedAt: null, fields }) };
  const accepted = (await db.query("SELECT * FROM hr_incremental_import_item WHERE source_key=$1", [value.sourceKey]))[0], before = await policy(value);
  assert.equal(await execute(revised, await operation()), "conflict"); assert.deepEqual(await policy(value), before);
  assert.deepEqual((await db.query("SELECT * FROM hr_incremental_import_item WHERE id=$1", [accepted.id]))[0], accepted);
  assert.equal(await execute(value, await operation()), "unchanged"); assert.equal((await policy(value)).policy_name, "Modern change");
});
test("concurrent same-source operations create once and then record unchanged", { skip: !enabled }, async () => {
  const value = item(), first = await operation(), second = await operation();
  assert.deepEqual((await Promise.all([execute(value, first), execute(value, second)])).sort(), ["applied", "unchanged"]);
  const rows = await db.query("SELECT id FROM hr_incremental_import_item WHERE source_key=$1", [value.sourceKey]); assert.equal(rows.length, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_incremental_import_revision WHERE item_id=$1", [rows[0].id]))[0].n, 2);
  assert.equal((await policy(value)).version, 1);
});
test("late mandatory audit failure rolls back both create and update with their ledger; same operations retry", { skip: !enabled }, async () => {
  const existing = item(); await execute(existing, await operation());
  const fields = { ...facts(), name: "Accepted source correction" };
  const revised = { ...existing, fields, rowDigest: hash({ domain: existing.domain, sourceTable: existing.sourceTable, sourceKey: existing.sourceKey, sourceUpdatedAt: null, fields }) };
  const value = item(), op = await operation(), updateOp = await operation(), before = await snapshot();
  await db.query("CREATE FUNCTION fixture_policy_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource='hr.insurance_policy_incremental_import' THEN RAISE EXCEPTION 'synthetic mandatory audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_policy_audit_fail BEFORE INSERT ON sys_op_log FOR EACH ROW EXECUTE FUNCTION fixture_policy_audit_fail()");
  try {
    await assert.rejects(execute(value, op), /synthetic mandatory audit failure/u); assert.deepEqual(await snapshot(), before);
    await assert.rejects(execute(revised, updateOp), /synthetic mandatory audit failure/u); assert.deepEqual(await snapshot(), before);
  }
  finally { await db.query("DROP TRIGGER fixture_policy_audit_fail ON sys_op_log; DROP FUNCTION fixture_policy_audit_fail()"); }
  assert.equal(await execute(value, op), "applied");
  assert.equal(await execute(revised, updateOp), "applied");
});
test("permission, scope, digest and ciphertext tamper reject without changing accepted business data", { skip: !enabled }, async () => {
  const value = item(), op = await operation(), before = await snapshot();
  for (const principal of [{ ...actor, parkId: "foreign" }, { ...actor, permissions: actor.permissions.slice(0, 2) }]) await assert.rejects(execute(value, op, principal));
  await assert.rejects(execute({ ...value, rowDigest: "0".repeat(64) }, op), /DIGEST_INVALID/u); assert.deepEqual(await snapshot(), before);
  await execute(value, op); const good = await snapshot(), another = await operation();
  await assert.rejects(db.transaction(async m => {
    await m.query("UPDATE hr_incremental_import_item SET source_facts_sha256=$2 WHERE source_key=$1", [value.sourceKey, "0".repeat(64)]);
    return executeYuzhouInsurancePolicyItem(m, scope, actor, value, sensitive, audit, another);
  }), /EVIDENCE_INVALID/u); assert.deepEqual(await snapshot(), good);
});
test("actual forward migration enforces private baselines, immutable source and bindings and scope FK", { skip: !enabled }, async () => {
  const value = item(); await execute(value, await operation()); const before = await snapshot();
  const ledger = (await db.query("SELECT id FROM hr_incremental_import_item WHERE source_key=$1", [value.sourceKey]))[0];
  for (const sql of ["UPDATE hr_incremental_import_item SET field_baseline='{\"name\":\"plain\"}' WHERE id=$1", "UPDATE hr_incremental_import_item SET target_id=gen_random_uuid() WHERE id=$1", "DELETE FROM hr_incremental_import_item WHERE id=$1", "UPDATE hr_incremental_insurance_policy_binding SET park_id='foreign' WHERE item_id=$1", "DELETE FROM hr_incremental_insurance_policy_binding WHERE item_id=$1"]) await assert.rejects(db.query(sql, [ledger.id]));
  await assert.rejects(db.transaction(m => m.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,baseline_encrypted,last_operation_id,target_version)
 SELECT tenant_id,park_id,source_system,source_table,'sha256:'||encode(digest(gen_random_uuid()::text,'sha256'),'hex'),domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,baseline_encrypted,last_operation_id,target_version FROM hr_incremental_import_item WHERE id=$1`, [ledger.id])), /BINDING_REQUIRED/u);
  assert.deepEqual(await snapshot(), before);
});
test("actual fixed builder through public DTO/service preview, commit, replay and status enforces permissions and hides values", { skip: !enabled }, async () => {
  const service = new HrYuzhouIncrementalImportService(db, sensitive, undefined, audit);
  const built = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `import {createHash,randomInt} from 'node:crypto'; import {buildYuzhouReusableIncrementalPackage as build,YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 as recipeSha256} from './scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs'; import {YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE as fields} from './scripts/hr-cutover/yuzhou-insurance-policy-incremental-projection.mjs'; import {canonicalProfile} from './scripts/hr-cutover/yuzhou-profile-incremental-projection.mjs'; const hash=v=>createHash('sha256').update(v).digest('hex'),id=randomInt(1000000000),source={id,des:'synthetic private policy',rightscope:null,...Object.fromEntries(fields.slice(3).map((f,i)=>[f.sourceField,i%2?'-1.250':'12.500']))},row={sourceTable:'dbo.insure_method',sourceKey:String(id),sourceIdentitySha256:hash('dbo.insure_method\\0'+id),sourceRowSha256:hash(canonicalProfile(source)),source}; console.log(JSON.stringify(build({recipeVersion:'yuzhou-reusable-incremental-v2',recipeSha256,sourceSystem:'yuzhou-v10',extractedAt:'2026-10-05T00:00:00Z',employeeIndex:[],employeeRecords:[],records:[],insurancePolicyRecords:[row]}).packageDto));`], { cwd: resolve(__dirname, "../../../../.."), encoding: "utf8" }));
  const value = built.items[0] as InsurancePolicyImportItem;
  const dto = plainToInstance(PreviewYuzhouIncrementalImportDto, built);
  await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
  const before = await snapshot();
  const p = await service.preview(scope, actor, dto) as { id: string; plan: Array<{ action: string }> };
  assert.equal(p.plan[0]!.action, "create"); assert.equal(JSON.stringify(p).includes("synthetic private policy"), false); assert.deepEqual(await snapshot(), before);
  const committed = await service.commit(scope, actor, p.id);
  assert.equal(committed.status, "committed"); assert.equal(committed.appliedCount, 1);
  const accepted = await snapshot(); assert.deepEqual(await service.commit(scope, actor, p.id), committed); assert.deepEqual(await snapshot(), accepted);
  const readActor = { ...actor, permissions: actor.permissions.slice(0, 2) };
  assert.deepEqual(await service.status(scope, readActor, p.id), committed);
  await assert.rejects(service.status(scope, { ...actor, permissions: [HR_PERMISSIONS.HR_INSURANCE_READ] }, p.id), /PERMISSION_REQUIRED/u);
  const later = { ...dto, manifestId: randomUUID() };
  await assert.rejects(service.preview(scope, readActor, later), /PERMISSION_REQUIRED/u);
  const again = await service.preview(scope, actor, later) as { id: string; plan: Array<{ action: string }> };
  assert.equal(again.plan[0]!.action, "unchanged"); assert.equal((await service.commit(scope, actor, again.id)).unchangedCount, 1);
  const tampered = { ...value, fields: { ...value.fields, name: "forged" } };
  await assert.rejects(service.preview(scope, actor, { ...dto, items: [tampered] }), /rowDigest/u);
  await assert.rejects(service.preview(scope, { ...actor, parkId: "foreign" }, { ...dto, manifestId: randomUUID() }));
  const employee = { domain: "employee" as const, sourceTable: "dbo.person", sourceKey: `sha256:${hash(randomUUID())}`, fields: { employeeCode: "SYN-P", fullName: "Synthetic employee", employmentStatus: "preboarding", employmentType: "full_time", hireDate: null }, rowDigest: "" };
  employee.rowDigest = hash({ domain: employee.domain, sourceTable: employee.sourceTable, sourceKey: employee.sourceKey, sourceUpdatedAt: null, fields: employee.fields });
  await assert.rejects(service.preview(scope, actor, { ...dto, items: [value, employee] }), /permission is required/u);
});
