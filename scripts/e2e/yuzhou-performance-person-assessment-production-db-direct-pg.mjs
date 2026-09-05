#!/usr/bin/env node
/* global Buffer, console, process */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { performancePersonAssessmentProductionHash } from "../hr-cutover/performance-person-assessment-production-adapter.mjs";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const composeProject = process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT ?? "jinhu_hr_migration_lab";
const composeFile = resolve(root, "infra/docker/docker-compose.yml");
const database = `jinhu_hr_migration_lab_perf_assessment_prod_${process.pid}`;
const dependencyPath = process.env.YUZHOU_PERFORMANCE_RELATIONS_PRODUCTION_MIGRATION
  ?? resolve(root, "database/migrations/000308_hr_yuzhou_performance_relations_production.sql");
const migrationDir = mkdtempSync(resolve(tmpdir(), "jinhu-perf-assessment-migrations-"));
const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const parentOperation = "yzprod-import-20260905T010203Z-123456abcdef";
const operation = "yzprod-perfrel-20260905T020304Z-abcdef123456";
const rollbackOperation = "yzprod-perfrel-rollback-20260905T030405Z-fedcba654321";
const batch = "10000000-0000-4000-8000-000000000001";
const tenant = "tenant-a";
const park = "park-a";
const codeSha = "1".repeat(40);
const sourceSha = h("source");
const mappingSha = h("mapping");
const t0Sha = h("after-t0");
const contractSha = "f9eac8435900c05251c82c0c1be04bbe63992ca9f65a9879c21c838af898f62c";
const migration307Sha = "0467f31888a5fb52c7c63ab1e754a68ab76822b2e177318bf249f71eb1f8887a";
const sourcePersonIdentitySha = createHash("sha256").update(Buffer.concat([
  Buffer.from("dbo.person", "utf8"), Buffer.from([0]), Buffer.from("SYNTH-A", "utf8"),
])).digest("hex");
const payload = { personAssessments: [{ sourcePersonIdentitySha256: sourcePersonIdentitySha, sourceAssessmentId: 7 }] };
const payloadSha = performancePersonAssessmentProductionHash(payload);
const now = Date.now();
const startsAt = new Date(now - 60_000).toISOString();
const issuedAt = new Date(now - 30_000).toISOString();
const expiresAt = new Date(now + 30 * 60_000).toISOString();
const endsAt = new Date(now + 60 * 60_000).toISOString();

function command(command, args, options = {}, expectSuccess = true) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, ...options });
  if (expectSuccess) assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  return result;
}

function psql(target, sql, expectSuccess = true) {
  return command("docker", ["exec", "-i", container, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", target], { input: sql }, expectSuccess);
}

function sha256File(path) {
  const result = command("shasum", ["-a", "256", path]);
  return result.stdout.trim().split(/\s+/u)[0];
}

function copyMigrationChain() {
  const sourceDir = resolve(root, "database/migrations");
  for (const name of readdirSync(sourceDir).filter(name => name.endsWith(".sql")).sort()) {
    if (name === "000308_hr_yuzhou_performance_relations_production.sql") continue;
    copyFileSync(resolve(sourceDir, name), resolve(migrationDir, name));
  }
  copyFileSync(dependencyPath, resolve(migrationDir, basename(dependencyPath)));
}

function parseReceipt(output) {
  const values = output.trim().split("|");
  assert.equal(values.length, 9, output);
  return {
    operationId: values[0], status: values[1], sealed: values[2], binding: values[3], scope: values[4],
    evidence: Number(values[5]), masters: Number(values[6]), resolutions: Number(values[7]), state: values[8],
  };
}

try {
  copyMigrationChain();
  const migration308Sha = sha256File(dependencyPath);
  psql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  command("sh", ["scripts/db-migrate.sh"], { env: {
    ...process.env,
    COMPOSE_FILE: composeFile,
    COMPOSE_PROJECT_NAME: composeProject,
    MIGRATIONS_DIR: migrationDir,
    POSTGRES_USER: "jinhu",
    POSTGRES_DB: database,
    MIGRATION_EXECUTED_BY: "synthetic-performance-person-assessment-contract",
    MIGRATION_BASELINE_ON_NONEMPTY_DB: "no",
  } });

  const targetScopeSha = psql(database,
    `SELECT hr_yuzhou_production_target_scope_sha256(${q(tenant)},${q(park)});`).stdout.trim();
  const planSha = h("plan");
  const importAuthSha = h("parent-auth");
  const importNonceSha = h("parent-nonce");
  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SELECT hr_yuzhou_consume_import_authorization_v2(
      ${q(parentOperation)},${q(codeSha)},${q(sourceSha)},${q(mappingSha)},${q(planSha)},${q(h("target"))},
      ${q(tenant)},${q(park)},${q(targetScopeSha)},${q(importAuthSha)},${q(importNonceSha)},
      ${q(issuedAt)}::timestamptz,${q(expiresAt)}::timestamptz,
      ${q(startsAt)}::timestamptz,${q(endsAt)}::timestamptz,
      ${q(h("approval"))},${q(h("manifest"))},${q(h("pair"))},${q(h("pair-a"))},${q(h("pair-b"))}
    );
    INSERT INTO hr_yuzhou_production_import_phase(
      operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,
      planned_record_count,applied_record_count,before_canonical_sha256,
      payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version
    ) VALUES
      (${q(parentOperation)},'T0',0,'planned',${q(h("phase-t0"))},0,0,${q(h("before-t0"))},${q(t0Sha)},${q(h("bundle-t0"))},'yuzhou-production-import-canonical-json-v1'),
      (${q(parentOperation)},'T1',1,'planned',${q(h("phase-t1"))},0,0,${q(h("before-t1"))},${q(h("artifact-t1"))},${q(h("bundle-t1"))},'yuzhou-production-import-canonical-json-v1'),
      (${q(parentOperation)},'T2',2,'planned',${q(h("phase-t2"))},0,0,${q(h("before-t2"))},${q(h("artifact-t2"))},${q(h("bundle-t2"))},'yuzhou-production-import-canonical-json-v1'),
      (${q(parentOperation)},'T3',3,'planned',${q(h("phase-t3"))},0,0,${q(h("before-t3"))},${q(h("artifact-t3"))},${q(h("bundle-t3"))},'yuzhou-production-import-canonical-json-v1');
    UPDATE hr_yuzhou_production_import_operation
      SET status='running',started_at=now(),current_phase='T0'
      WHERE operation_id=${q(parentOperation)};
    UPDATE hr_yuzhou_production_import_phase SET status='running',started_at=now()
      WHERE operation_id=${q(parentOperation)} AND phase='T0';
    INSERT INTO migration_batch(
      id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,
      execution_context,production_import_operation_id,production_import_phase,started_at
    ) VALUES(${q(batch)}::uuid,${q(`${parentOperation}-t0`)},'yuzhou-v10',${q(sourceSha)},
      current_database(),'load','running',${q(`prod-import-v2@${codeSha}`)},
      'production_import',${q(parentOperation)},'T0',clock_timestamp());
    COMMIT;
  `);

  const ids = {
    template: "20000000-0000-4000-8000-000000000001", templateMap: "20000000-0000-4000-8000-000000000002",
    dimension: "30000000-0000-4000-8000-000000000001", dimensionMap: "30000000-0000-4000-8000-000000000002",
    detail: "40000000-0000-4000-8000-000000000001", detailMap: "40000000-0000-4000-8000-000000000002",
    master: "50000000-0000-4000-8000-000000000001", masterMap: "50000000-0000-4000-8000-000000000002",
  };
  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    INSERT INTO legacy_record_map(id,batch_id,source_system,source_table,source_pk_canonical,
      source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active) VALUES
      (${q(ids.template)},${q(batch)},'yuzhou-v10','dbo.assessmentcode','sha256:${h("template-source")}',${q(h("template-source"))},${q(h("template-row"))},'hr_performance_legacy_template_profile',${q(ids.templateMap)},'loaded',true),
      (${q(ids.dimension)},${q(batch)},'yuzhou-v10','dbo.assitem','sha256:${h("dimension-source")}',${q(h("dimension-source"))},${q(h("dimension-row"))},'hr_performance_legacy_dimension_profile',${q(ids.dimensionMap)},'loaded',true),
      (${q(ids.detail)},${q(batch)},'yuzhou-v10','dbo.assessmentdetail','sha256:${h("detail-source")}',${q(h("detail-source"))},${q(h("detail-row"))},'hr_performance_legacy_dimension_result',${q(ids.detailMap)},'loaded',true),
      (${q(ids.master)},${q(batch)},'yuzhou-v10','dbo.assessmentmaster','sha256:${h("master-source")}',${q(h("master-source"))},${q(h("master-row"))},'hr_performance_legacy_master_result',${q(ids.masterMap)},'loaded',true);
    INSERT INTO hr_performance_legacy_template_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_assessment,source_assessment_name
    ) VALUES(${q(ids.templateMap)},${q(tenant)},${q(park)},${q(batch)},${q(ids.template)},
      ${q(h("template-source"))},${q(h("template-row"))},7,'Synthetic');
    INSERT INTO hr_performance_legacy_dimension_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_item_id,source_assessment_id,legacy_template_profile_id
    ) VALUES(${q(ids.dimensionMap)},${q(tenant)},${q(park)},${q(batch)},${q(ids.dimension)},
      ${q(h("dimension-source"))},${q(h("dimension-row"))},101,7,${q(ids.templateMap)});
    INSERT INTO hr_performance_legacy_dimension_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_detail_id,source_session_id,source_person_code,source_item_id,
      legacy_dimension_profile_id
    ) VALUES(${q(ids.detailMap)},${q(tenant)},${q(park)},${q(batch)},${q(ids.detail)},
      ${q(h("detail-source"))},${q(h("detail-row"))},7001,9,'SYNTH-A',101,${q(ids.dimensionMap)});
    INSERT INTO hr_performance_legacy_master_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_master_id,source_session_id,source_person_code,legacy_template_profile_id
    ) VALUES(${q(ids.masterMap)},${q(tenant)},${q(park)},${q(batch)},${q(ids.master)},
      ${q(h("master-source"))},${q(h("master-row"))},9001,9,'SYNTH-A',${q(ids.templateMap)});
    SET CONSTRAINTS ALL IMMEDIATE;
    UPDATE migration_batch SET status='succeeded',finished_at=GREATEST(started_at,clock_timestamp())
      WHERE id=${q(batch)};
    UPDATE hr_yuzhou_production_import_phase
      SET status='succeeded',started_at=COALESCE(started_at,now()),finished_at=now(),
        after_canonical_sha256=${q(t0Sha)}
      WHERE operation_id=${q(parentOperation)} AND phase='T0';
    INSERT INTO hr_yuzhou_performance_relations_production_receipt(
      operation_id,migration_batch_id,sealed_plan_sha256,authorization_artifact_sha256,
      authorization_nonce_sha256,code_sha,source_snapshot_sha256,mapping_contract_sha256,
      target_identity_sha256,tenant_id,park_id,target_scope_sha256,t0_phase_receipt_sha256,
      relation_payload_artifact_sha256,identity_decision_artifact_sha256,
      migration_305_sha256,migration_306_sha256,session_rows,score_source_rows,assignment_rows,
      active_relation_maps,identity_resolution_rows,session_binding_rows,subject_unmatched_rows,
      blank_assessor_rows,status,receipt_sha256
    ) VALUES(${q(parentOperation)},${q(batch)},${q(planSha)},${q(importAuthSha)},${q(importNonceSha)},
      ${q(codeSha)},${q(sourceSha)},${q(mappingSha)},${q(h("target"))},${q(tenant)},${q(park)},
      ${q(targetScopeSha)},${q(t0Sha)},${q(h("relations"))},${q(h("identity"))},
      'd3784218fc8272bd28b93e44b19a02d5c8124466b6b3c218294920603909dfc0',
      'cd49f294f4c9e4105b9f7fd4c678b7b2d29c5433d0348f6e6632d6e7c135a56d',
      7,0,117,124,234,7,108,117,'succeeded',${q(h("relations-receipt"))});
    COMMIT;
  `);

  const wrongT0Dependency = psql(database, `BEGIN;
    UPDATE hr_yuzhou_production_import_phase SET after_canonical_sha256=${q(h("wrong-after-t0"))}
      WHERE operation_id=${q(parentOperation)} AND phase='T0';
    SELECT * FROM hr_yuzhou_performance_person_assessment_production_capability(
      ${q(parentOperation)},${q(t0Sha)},${q(contractSha)},${q(migration307Sha)},
      hr_yuzhou_production_target_scope_sha256(${q(tenant)},${q(park)}));
    COMMIT;`, false);
  assert.notEqual(wrongT0Dependency.status, 0);
  assert.match(wrongT0Dependency.stderr, /CAPABILITY_DEPENDENCY_INVALID/u);

  const capability = psql(database, `SELECT execution_context||'|'||phase||'|'||migration_artifact_sha256
    FROM hr_yuzhou_performance_person_assessment_production_capability(
      ${q(parentOperation)},${q(t0Sha)},${q(contractSha)},${q(migration307Sha)},${q(targetScopeSha)});`).stdout.trim();
  assert.equal(capability, `production_import|PERFREL|${migration307Sha}`);

  const sourceRestoreSha = h("restore-receipt");
  const sourcePayloadSha = h("source-payload-artifact");
  const safeReceiptSha = h("safe-receipt-artifact");
  const sealedSha = h("sealed");
  const bindingSha = h("binding");
  const assessmentAuthSha = h("assessment-auth");
  const assessmentNonceSha = h("assessment-nonce");
  const consume = `SELECT hr_yuzhou_consume_performance_person_assessment_authorization(
    ${q(operation)},${q(parentOperation)},${q(codeSha)},${q(sourceSha)},${q(mappingSha)},
    ${q(t0Sha)},${q(contractSha)},${q(sourceRestoreSha)},${q(sourcePayloadSha)},${q(safeReceiptSha)},
    ${q(migration307Sha)},${q(payloadSha)},${q(sealedSha)},${q(bindingSha)},
    ${q(assessmentAuthSha)},${q(assessmentNonceSha)},${q(expiresAt)}::timestamptz);`;
  psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${consume} COMMIT;`);
  const apply = `CALL materialize_yuzhou_performance_ass_compute_weight_relation_production(
    ${q(operation)},${q(tenant)},${q(park)},${q(migration307Sha)},${q(payloadSha)},
    ${q(JSON.stringify(payload))}::jsonb);`;
  psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${apply} COMMIT;`);
  const receiptSql = `SELECT operation_id,status,sealed_artifact_sha256,binding_sha256,
    target_scope_sha256,evidence_rows,master_rows,resolution_rows,state_sha256
    FROM hr_yuzhou_performance_person_assessment_production_receipt(${q(operation)});`;
  const imported = parseReceipt(psql(database, receiptSql).stdout);
  assert.deepEqual([imported.status, imported.evidence, imported.masters, imported.resolutions], ["succeeded", 1, 1, 1]);
  assert.equal(psql(database, `SELECT person_resolution_status||'|'||detail_resolution_status||'|'||comparison_status
    FROM hr_performance_legacy_ass_compute_weight_resolution WHERE migration_batch_id=${q(batch)};`).stdout.trim(),
  "resolved|resolved|matched");
  const ownerBefore = psql(database,
    `SELECT hr_yuzhou_performance_person_assessment_owner_state_sha256(${q(batch)});`).stdout.trim();

  psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${consume} ${apply} COMMIT;`);
  assert.equal(parseReceipt(psql(database, receiptSql).stdout).state, imported.state);
  const driftPayload = { personAssessments: [{ sourcePersonIdentitySha256: sourcePersonIdentitySha, sourceAssessmentId: 8 }] };
  const drift = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_ass_compute_weight_relation_production(
      ${q(operation)},${q(tenant)},${q(park)},${q(migration307Sha)},${q(payloadSha)},
      ${q(JSON.stringify(driftPayload))}::jsonb); COMMIT;`, false);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /HR_PERFORMANCE_PERSON_ASSESSMENT_PAYLOAD_DRIFT/u);

  const reused = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SELECT hr_yuzhou_consume_performance_person_assessment_rollback_authorization(
      ${q(rollbackOperation)},${q(operation)},${q(sealedSha)},${q(assessmentAuthSha)},
      ${q(h("new-nonce"))},${q(expiresAt)}::timestamptz); COMMIT;`, false);
  assert.notEqual(reused.status, 0);
  assert.match(reused.stderr, /HR_PERFORMANCE_PERSON_ASSESSMENT_AUTH_REUSED/u);

  const rollbackAuthSha = h("assessment-rollback-auth");
  const rollbackNonceSha = h("assessment-rollback-nonce");
  const consumeRollback = `SELECT hr_yuzhou_consume_performance_person_assessment_rollback_authorization(
    ${q(rollbackOperation)},${q(operation)},${q(sealedSha)},${q(rollbackAuthSha)},
    ${q(rollbackNonceSha)},${q(expiresAt)}::timestamptz);`;
  const rollback = `CALL rollback_yuzhou_performance_ass_compute_weight_relation_production(
    ${q(rollbackOperation)},${q(operation)});`;
  psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${consumeRollback} ${rollback} COMMIT;`);
  const rolledBack = parseReceipt(psql(database, receiptSql).stdout);
  assert.deepEqual([rolledBack.status, rolledBack.evidence, rolledBack.masters, rolledBack.resolutions], ["rolled_back", 0, 0, 0]);
  assert.equal(psql(database, "SELECT count(*) FROM hr_performance_legacy_master_result;").stdout.trim(), "1");
  assert.equal(psql(database,
    `SELECT hr_yuzhou_performance_person_assessment_owner_state_sha256(${q(batch)});`).stdout.trim(), ownerBefore);
  psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${rollback} COMMIT;`);
  assert.equal(parseReceipt(psql(database, receiptSql).stdout).state, rolledBack.state);

  assert.equal(psql(database, `SELECT has_function_privilege('jinhu_hr_yuzhou_perf_assessment_reader',
    'hr_yuzhou_performance_person_assessment_production_receipt(character varying)','EXECUTE');`).stdout.trim(), "t");
  assert.equal(psql(database, `SELECT has_function_privilege('jinhu_hr_yuzhou_perf_assessment_reader',
    'hr_yuzhou_consume_performance_person_assessment_authorization(character varying,character varying,character,character,character,character,character,character,character,character,character,character,character,character,character,character,timestamp with time zone)','EXECUTE');`).stdout.trim(), "f");
  assert.equal(psql(database, `SELECT has_table_privilege('jinhu_hr_yuzhou_perf_assessment_executor',
    'hr_yuzhou_performance_person_assessment_operation','SELECT');`).stdout.trim(), "f");
  assert.equal(migration308Sha, sha256File(dependencyPath));
  console.log(JSON.stringify({ status: "PASS", migrationChain: "fresh", resolved: 1, matched: 1, replay: true, driftRejected: true, oneTimeAuthorization: true, rollbackResidual: 0, ownerStateUnchanged: true, productionConnection: false }));
} finally {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`, false);
  rmSync(migrationDir, { recursive: true, force: true });
}
