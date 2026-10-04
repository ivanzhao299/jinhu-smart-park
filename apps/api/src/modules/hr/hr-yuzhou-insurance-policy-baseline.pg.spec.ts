import "reflect-metadata";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { canonicalYuzhouInitialJson, YUZHOU_INITIAL_CANONICALIZATION, HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import { verifyInsurancePolicyOriginalBaseline, type InsurancePolicyOriginalWitness } from "./hr-yuzhou-insurance-policy-baseline";
import { executeYuzhouInsurancePolicyItem, type InsurancePolicyImportItem } from "./hr-yuzhou-insurance-policy-executor";
import { insurancePolicyFactsFromFlat } from "./hr-yuzhou-insurance-policy-transaction";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { LoginLogEntity } from "../audit/entities/login-log.entity";
import { OpLogEntity } from "../audit/entities/op-log.entity";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";

const enabled = process.env.HR_INSURANCE_BASELINE_PG_REQUIRED === "1";
const root = resolve(__dirname, "../../../../..");
const database = `jinhu_hr_insurance_baseline_lab_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const scope = { tenantId: "fixture-tenant", parkId: "fixture-park" };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const slots = [["", "base"], ["_e", "employer"], ["_p", "employee"], ["_pc", "supplement"]];
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic-original-policy", roles: [], permissions: [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE] };
const sensitive = new PartySensitiveDataService({ get: (key: string) => key === "PARTY_DATA_ENCRYPTION_KEY" ? "synthetic-original-policy-fixture-key-1234567890" : undefined } as never);
let admin: DataSource, db: DataSource, created = false;
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.ok(["55491", "55641"].includes(process.env.POSTGRES_PORT ?? ""));
  const config = { type: "postgres" as const, host: "127.0.0.1", port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD };
  admin = new DataSource({ ...config, database: "postgres" }); await admin.initialize();
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`); created = true;
  db = new DataSource({ ...config, database, entities: [OpLogEntity, LoginLogEntity], synchronize: true }); await db.initialize();
  assert.equal((await db.query("SELECT current_database() name"))[0].name, database);
  await db.query('CREATE EXTENSION pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE TABLE hr_legacy_identity_registry(owner_record_map_id uuid,mapping_status varchar(32)); CREATE TABLE hr_employee(id uuid PRIMARY KEY); CREATE TABLE sys_user(tenant_id varchar(64),park_id varchar(64),id uuid PRIMARY KEY,UNIQUE(tenant_id,park_id,id))');
  for (const name of ["000235_hr_legacy_migration_control", "000239_hr_attendance_insurance_history", "000278_hr_yuzhou_production_import_control", "000281_hr_yuzhou_production_import_control_v2", "000282_hr_yuzhou_production_import_writer_receipts", "000299_hr_insurance_policy_fixed_amounts", "000327_hr_yuzhou_incremental_import_ledger", "000329_hr_incremental_initial_baseline", "000341_hr_incremental_insurance_policy"]) {
    await db.query(readFileSync(resolve(root, `database/migrations/${name}.sql`), "utf8"));
  }
  await db.query("INSERT INTO sys_user VALUES($1,$2,$3)", [scope.tenantId, scope.parkId, actor.sub]);
});
after(async () => {
  if (db?.isInitialized) await db.destroy();
  if (admin?.isInitialized) {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH(FORCE)`);
    assert.equal((await admin.query("SELECT count(*)::int n FROM pg_database WHERE datname=$1", [database]))[0].n, 0);
    await admin.destroy();
  }
});

async function fixture(id: number, legacyUnits = false, failedBatch = false) {
  const operationId = `yzprod-import-20261005T120000Z-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const identity = sha(`dbo.insure_method\0${id}`), targetId = randomUUID();
  const source = { id, des: "synthetic policy", rightscope: null, ...Object.fromEntries(kinds.flatMap(kind => slots.flatMap(([suffix], i) => [[`${kind}${suffix}`, i === 0 ? null : i === 1 ? "12.500" : "0.000"], [`${kind}${suffix}2`, i === 0 ? null : i === 1 ? "-1.250" : "0.000"]]))) };
  const rowHash = sha(canonicalYuzhouInitialJson(source));
  const witness: InsurancePolicyOriginalWitness = {
    operationId, source,
    policy: { targetId, projection: { tenant_id: scope.tenantId, park_id: scope.parkId, policy_code: `YUZHOU-${id}`, policy_name: source.des, scope_description: null, status: "historical", is_historical_import: true, remark: null } },
    items: kinds.map(kind => ({ targetId: randomUUID(), projection: {
      tenant_id: scope.tenantId, park_id: scope.parkId, policy_id: targetId, insurance_kind: kind, variant_no: 1,
      ...Object.fromEntries(slots.flatMap(([, component], i) => [[`${component}_rate`, i === 0 ? null : i === 1 ? legacyUnits ? "12.500000" : "0.125000" : "0.000000"], [`${component}_fixed_amount`, i === 0 ? null : i === 1 ? "-1.250" : "0.000"]])),
      source_snapshot: { sourceRowSha256: rowHash }, remark: null,
    } })),
  };
  const rows = [{ table: "hr_insurance_policy", ...witness.policy }, ...witness.items.map(item => ({ table: "hr_insurance_policy_item", ...item }))];
  // Use the original production writer oracle, independently of the API verifier.
  const hashes: string[] = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", "import {readFileSync} from 'node:fs'; import {computeProductionImportTargetCanonicalHash as hash} from './scripts/hr-cutover/production-import-target-model.mjs'; const rows=JSON.parse(readFileSync(0,'utf8')); console.log(JSON.stringify(rows.map(r=>hash(r.table,{tenantId:r.projection.tenant_id,parkId:r.projection.park_id},r.projection,r.projection))));"], { cwd: root, input: JSON.stringify(rows), encoding: "utf8" }));
  await db.transaction("SERIALIZABLE", async m => {
    const h = sha(operationId);
    await m.query(`INSERT INTO hr_yuzhou_production_import_operation(operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order,execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256) VALUES($1,'production_import','running',$2,$3,$3,$3,$3,$3,$3,now()-interval '1 hour',now()+interval '1 hour',now()-interval '2 hours',now()+interval '2 hours',$3,$3,$3,$3,$4,'["T0","T1","T2","T3"]',2,$5,$6,$7)`, [operationId, "a".repeat(40), h, sha(`B-${operationId}`), scope.tenantId, scope.parkId, sha(`yuzhou-hr-production-target-scope-v1\0${scope.tenantId}\0${scope.parkId}`)]);
    for (const [ordinal, phase] of ["T0", "T1", "T2", "T3"].entries()) await m.query(`INSERT INTO hr_yuzhou_production_import_phase(operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,before_canonical_sha256,payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version) VALUES($1,$2,$3,'planned',$4,$5,$4,$4,$4,$6)`, [operationId, phase, ordinal, h, phase === "T3" ? 7 : 0, YUZHOU_INITIAL_CANONICALIZATION]);
    for (const phase of ["T0", "T1", "T2", "T3"]) {
      await m.query("UPDATE hr_yuzhou_production_import_operation SET current_phase=$2 WHERE operation_id=$1", [operationId, phase]);
      await m.query("UPDATE hr_yuzhou_production_import_phase SET status='running' WHERE operation_id=$1 AND phase=$2", [operationId, phase]);
      const batch = (await m.query(`INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,tool_version,execution_context,production_import_operation_id,production_import_phase,status) VALUES($1,'yuzhou-v10',$2,current_database(),$3,'production_import',$4,$5,$6) RETURNING id`, [`${operationId}-${phase.toLowerCase()}`, h, `prod-import-v2@${"a".repeat(40)}`, operationId, phase, failedBatch && phase === "T3" ? "failed" : "succeeded"]))[0].id;
      if (phase === "T3") for (const [i, row] of rows.entries()) {
        const discriminator = `${row.projection.insurance_kind}\0${1}`;
        const key = i === 0 ? identity : sha(`yuzhou-hr-production-source-projection-v1\0${identity}\0hr_insurance_policy_item\0${discriminator}`);
        const sourceHash = i === 0 ? rowHash : sha(canonicalYuzhouInitialJson({ parentSourceRowSha256: rowHash, discriminator }));
        await m.query(`INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256,source_row_sha256,disposition,target_table,planned_target_table,target_id,target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,target_version_after) VALUES($1,'T3',$2,$3,'insert',$4,$4,$5,$6,'yuzhou-v10','dbo.insure_method',$7,$8,1)`, [operationId, key, sourceHash, row.table, row.targetId, hashes[i], `sha256:${key}`, h]);
        if (i !== 0) await m.query("INSERT INTO hr_yuzhou_production_import_record_dependency VALUES($1,'T3',$2,'policy','T3',$3,'hr_insurance_policy')", [operationId, key, identity]);
        const map = (await m.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) VALUES($1,'yuzhou-v10','dbo.insure_method',$2,$3,$4,$5,$6,'verified') RETURNING id`, [batch, `sha256:${key}`, key, sourceHash, row.table, row.targetId]))[0].id;
        await m.query("INSERT INTO hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id) VALUES($1,'T3',$2,$3,$4)", [operationId, key, batch, map]);
      }
      await m.query("UPDATE hr_yuzhou_production_import_phase SET status='succeeded',finished_at=now() WHERE operation_id=$1 AND phase=$2", [operationId, phase]);
    }
    await m.query("UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now() WHERE operation_id=$1", [operationId]);
  });
  return { witness, key: `sha256:${identity}` };
}
const tables = ["hr_yuzhou_production_import_operation", "hr_yuzhou_production_import_phase", "hr_yuzhou_production_import_record", "hr_yuzhou_production_import_record_dependency", "hr_yuzhou_production_import_projection_receipt", "migration_batch", "legacy_record_map"];
const snapshot = () => Promise.all(tables.map(table => db.query(`SELECT row_to_json(r) row FROM ${table} r ORDER BY row_to_json(r)::text`)));

test("original writer hashes and actual receipt constraints authenticate seven rows without any writes", { skip: !enabled }, async () => {
  const f = await fixture(7), before = await snapshot();
  const result = await db.transaction("SERIALIZABLE", m => verifyInsurancePolicyOriginalBaseline(m, scope, f.key, f.witness));
  assert.equal(result.source["oldage.employerRate"], "0.125");
  assert.equal(result.source["oldage.baseRate"], null); assert.equal(result.source["oldage.employeeRate"], "0");
  assert.equal(result.source["oldage.employerFixedAmount"], "-1.25");
  assert.deepEqual(result.source, result.target); assert.equal(Object.keys(result.source).length, 50);
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(verifyInsurancePolicyOriginalBaseline(db.manager, scope, f.key, f.witness), /ORIGINAL_EVIDENCE_INVALID/u);
});
test("scope, altered original raw row, target oracle and mismatched dependency all reject", { skip: !enabled }, async () => {
  const f = await fixture(8), other = await fixture(9), before = await snapshot();
  await assert.rejects(db.transaction("SERIALIZABLE", m => verifyInsurancePolicyOriginalBaseline(m, { ...scope, parkId: "foreign" }, f.key, f.witness)), /ORIGINAL_EVIDENCE_INVALID/u);
  for (const alter of [(w: InsurancePolicyOriginalWitness) => { w.source.oldage_e = "13.000"; }, (w: InsurancePolicyOriginalWitness) => { w.items[0]!.projection.employer_rate = "0.13"; }]) {
    const changed = structuredClone(f.witness); alter(changed);
    await assert.rejects(db.transaction("SERIALIZABLE", m => verifyInsurancePolicyOriginalBaseline(m, scope, f.key, changed)), /ORIGINAL_EVIDENCE_INVALID/u);
  }
  await assert.rejects(db.transaction("SERIALIZABLE", async m => {
    // A different successful operation cannot supply this child's parent.
    // Verification runs before deferred constraints; rejection rolls back.
    await m.query("UPDATE hr_yuzhou_production_import_record_dependency SET depends_on_source_identity_sha256=$2 WHERE operation_id=$1", [f.witness.operationId, other.key.slice(7)]);
    return verifyInsurancePolicyOriginalBaseline(m, scope, f.key, f.witness);
  }), /ORIGINAL_EVIDENCE_INVALID/u);
  assert.deepEqual(await snapshot(), before);
});
test("failed operation, unfinished phase, failed batch and inactive mapping cannot authenticate", { skip: !enabled }, async () => {
  const f = await fixture(10), failed = await fixture(12, false, true), before = await snapshot();
  await assert.rejects(db.transaction("SERIALIZABLE", m => verifyInsurancePolicyOriginalBaseline(m, scope, failed.key, failed.witness)), /ORIGINAL_EVIDENCE_INVALID/u);
  const mutations: Array<(m: EntityManager) => Promise<unknown>> = [
    m => m.query("UPDATE hr_yuzhou_production_import_operation SET status='failed',failure_code='FIXTURE_FAILED' WHERE operation_id=$1", [f.witness.operationId]),
    m => m.query("UPDATE hr_yuzhou_production_import_phase SET status='planned' WHERE operation_id=$1 AND phase='T3'", [f.witness.operationId]),
    m => m.query("UPDATE legacy_record_map SET is_active=false WHERE source_identity_sha256=$1", [f.key.slice(7)]),
  ];
  for (const mutate of mutations) await assert.rejects(db.transaction("SERIALIZABLE", async m => { await mutate(m); return verifyInsurancePolicyOriginalBaseline(m, scope, f.key, f.witness); }), /ORIGINAL_EVIDENCE_INVALID/u);
  await assert.rejects(db.transaction("SERIALIZABLE", m => m.query("UPDATE migration_batch SET status='failed' WHERE production_import_operation_id=$1 AND production_import_phase='T3'", [f.witness.operationId])), /HR_PRODUCTION_IMPORT_OPERATION_NOT_RUNNING/u);
  assert.deepEqual(await snapshot(), before);
});
test("authentic legacy-unit witness requires recovery even with valid original writer receipts", { skip: !enabled }, async () => {
  const f = await fixture(11, true), before = await snapshot();
  await assert.rejects(db.transaction("SERIALIZABLE", m => verifyInsurancePolicyOriginalBaseline(m, scope, f.key, f.witness)), /ORIGINAL_LAYOUT_REQUIRES_RECOVERY/u);
  assert.deepEqual(await snapshot(), before);
});

test("existing original policy adopts encrypted proof once, keeps modern edits and accepts later source corrections without another witness", { skip: !enabled }, async () => {
  const f = await fixture(13), original = await snapshot(), p = f.witness.policy;
  await db.query("INSERT INTO hr_insurance_policy(id,tenant_id,park_id,policy_code,policy_name,scope_description,status,is_historical_import) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [p.targetId, p.projection.tenant_id, p.projection.park_id, p.projection.policy_code, p.projection.policy_name, p.projection.scope_description, p.projection.status, p.projection.is_historical_import]);
  for (const item of f.witness.items) {
    const values = item.projection;
    await db.query("INSERT INTO hr_insurance_policy_item(id,tenant_id,park_id,policy_id,insurance_kind,variant_no,base_rate,employer_rate,employee_rate,supplement_rate,base_fixed_amount,employer_fixed_amount,employee_fixed_amount,supplement_fixed_amount,source_snapshot) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)", [item.targetId, scope.tenantId, scope.parkId, p.targetId, values.insurance_kind, ...slots.map(([, component]) => values[`${component}_rate`]), ...slots.map(([, component]) => values[`${component}_fixed_amount`]), JSON.stringify(values.source_snapshot)]);
  }
  const proof = await db.transaction("SERIALIZABLE", m => verifyInsurancePolicyOriginalBaseline(m, scope, f.key, f.witness));
  const facts = insurancePolicyFactsFromFlat(proof.source);
  const input = (fields: typeof facts, witness?: InsurancePolicyOriginalWitness): InsurancePolicyImportItem => ({ domain: "insurance_policy", sourceTable: "dbo.insure_method", sourceKey: f.key, fields, rowDigest: sha(canonicalYuzhouInitialJson({ domain: "insurance_policy", sourceTable: "dbo.insure_method", sourceKey: f.key, sourceUpdatedAt: null, fields })), ...(witness ? { insurancePolicyBaselineWitness: witness } : {}) });
  const audit = new AuditService(db.getRepository(LoginLogEntity), db.getRepository(OpLogEntity));
  const execute = (value: InsurancePolicyImportItem, op?: string) => db.transaction(m => executeYuzhouInsurancePolicyItem(m, scope, actor, value, sensitive, audit, op));
  const operation = async () => (await db.query("INSERT INTO hr_incremental_import_operation(tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,item_count,created_by) VALUES($1,$2,'yuzhou-v10',$3,$4,$5,1,$6) RETURNING id", [scope.tenantId, scope.parkId, randomUUID(), sha(randomUUID()), sensitive.encrypt("synthetic"), actor.sub]))[0].id as string;
  await db.query("UPDATE hr_insurance_policy SET policy_name='Modern maintained name',version=version+1 WHERE id=$1", [p.targetId]);
  const modern = (await db.query("SELECT row_to_json(p) row FROM hr_insurance_policy p WHERE id=$1", [p.targetId]))[0];
  assert.equal((await execute(input(facts)) as { action: string }).action, "conflict");
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_incremental_import_item"))[0].n, 0);
  const service = new HrYuzhouIncrementalImportService(db, sensitive, undefined, audit);
  const dto = plainToInstance(PreviewYuzhouIncrementalImportDto, { version: 1, sourceSystem: "yuzhou-v10", manifestId: randomUUID(), extractedAt: "2026-10-05T00:00:00Z", items: [input(facts, f.witness)] });
  await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
  const prepared = await service.preview(scope, actor, dto) as { id: string; plan: Array<{ action: string }> };
  assert.equal(prepared.plan[0]!.action, "unchanged");
  assert.equal((await service.commit(scope, actor, prepared.id)).unchangedCount, 1);
  assert.deepEqual((await db.query("SELECT row_to_json(p) row FROM hr_insurance_policy p WHERE id=$1", [p.targetId]))[0], modern);
  const ledger = (await db.query("SELECT * FROM hr_incremental_import_item WHERE source_key=$1", [f.key]))[0];
  const saved = JSON.parse(sensitive.decrypt(ledger.baseline_encrypted)!);
  assert.equal(saved.target.name, facts.name); assert.notEqual(saved.target.name, "Modern maintained name");
  assert.deepEqual(saved.original, f.witness);
  assert.equal(await execute(input(facts), await operation()), "unchanged");
  const changed = structuredClone(facts); changed.items[0]!.employerRate = "0.15";
  assert.equal(await execute(input(changed), await operation()), "applied");
  assert.equal((await db.query("SELECT employer_rate FROM hr_insurance_policy_item WHERE id=$1", [f.witness.items[0]!.targetId]))[0].employer_rate, "0.150000");
  const divergent = { ...changed, name: "Source correction" };
  assert.equal(await execute(input(divergent), await operation()), "conflict");
  assert.equal((await db.query("SELECT policy_name FROM hr_insurance_policy WHERE id=$1", [p.targetId]))[0].policy_name, "Modern maintained name");
  const forged = structuredClone(f.witness); forged.source.des = "forged";
  await assert.rejects(execute(input(changed, forged), await operation()), /EVIDENCE_INVALID/u);
  assert.deepEqual(await snapshot(), original);
});
