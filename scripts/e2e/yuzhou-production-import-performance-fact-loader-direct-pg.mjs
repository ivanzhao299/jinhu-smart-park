#!/usr/bin/env node
/* global console, process */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const composeProject = process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT ?? "jinhu_hr_migration_lab";
const composeFile = resolve(root, "infra/docker/docker-compose.yml");
const database = `jinhu_hr_migration_lab_perf_facts_contract_${process.pid}`;
const operation = "yzprod-import-20260905T010203Z-123456abcdef";
const rollbackOperation = "yzprod-rollback-20260905T020304Z-fedcba654321";
const labBatch = "10000000-0000-4000-8000-000000000001";
const productionBatch = "20000000-0000-4000-8000-000000000001";
const tenant = "tenant-a";
const park = "park-a";
const codeSha = "1".repeat(40);
const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const sha256File = path => createHash("sha256").update(readFileSync(path)).digest("hex");

const facts = {
  assessmentcode: [{
    sourceIdentitySha256: h("template-identity"), sourceRowSha256: h("template-row"),
    assessment: 7, assessmentname: "Synthetic", department: null, mpercent: 30,
    tpercent: 10, xpercent: 25, cpercent: 15, spercent: 20,
    timekeep: true, bonus: true, master: true,
  }],
  assgradecode: [{
    sourceIdentitySha256: h("level-identity"), sourceRowSha256: h("level-row"),
    assgrade: "A", description: null, myorder: "01", assessmentid: 7,
    minvalue: 70, maxvalue: 100,
  }],
  assitem: [{
    sourceIdentitySha256: h("dimension-identity"), sourceRowSha256: h("dimension-row"),
    id: 101, assid: 7, assitem: "Synthetic", fullvalue: 100, myorder: 1,
  }],
  assitemgradedes: [{
    sourceIdentitySha256: h("guide-identity"), sourceRowSha256: h("guide-row"),
    id: 201, assitemid: 101, grade: "A", description: "Synthetic",
    minvalue: 70, maxvalue: 100, myorder: 1,
  }],
  assessmentdetail: [{
    sourceIdentitySha256: h("detail-identity"), sourceRowSha256: h("detail-row"),
    id: 7000, asssessionid: 9, person: "SYNTH-A", assitemid: 101,
    selfvalue: 90, mitemvalue: 71, itemvalue: 80, xitemvalue: 91,
    citemvalue: 51, selfgrade: null, assgrade: "A", appraisal: null,
  }],
};
const masters = { assessmentmaster: [{
  sourceIdentitySha256: h("master-identity"), sourceRowSha256: h("master-row"), id: 9000,
  asssessionid: 9, person: "SYNTH-A", selfgrade: null, assgrade: "A",
  selfvalue: 90, itemvalue: 80, mitemvalue: 71, xitemvalue: 91, citemvalue: 51,
  mastervalue: 2.1, timekeepvalue: -1, bonusvalue: 0.2, totalvalue: 79,
  selfappraisal: null, appraisal: null, pay: null, assessmentperson: null,
  recdate: null, operator: null, des: null,
}] };
const factBytes = Buffer.from(JSON.stringify(facts));
const masterBytes = Buffer.from(JSON.stringify(masters));
const factArtifactSha = createHash("sha256").update(factBytes).digest("hex");
const masterArtifactSha = createHash("sha256").update(masterBytes).digest("hex");
const migrationFiles = Object.fromEntries([300, 301, 302, 303, 310, 311].map(number => {
  const prefix = `${String(number).padStart(6, "0")}_`;
  const names = readdirSync(resolve(root, "database/migrations"))
    .filter(name => name.startsWith(prefix) && name.endsWith(".sql"));
  assert.equal(names.length, 1, `migration ${number} must resolve to exactly one file`);
  const relative = `database/migrations/${names[0]}`;
  return [number, { relative, sha256: sha256File(resolve(root, relative)) }];
}));

function command(commandName, args, options = {}, expectSuccess = true) {
  const result = spawnSync(commandName, args, {
    cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, ...options,
  });
  if (expectSuccess) assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  return result;
}

function psql(target, sql, expectSuccess = true) {
  return command("docker", ["exec", "-i", container, "psql", "-X", "-q", "-t", "-A",
    "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", target], { input: sql }, expectSuccess);
}

function expectReject(sql, marker) {
  const result = psql(database, sql, false);
  assert.notEqual(result.status, 0, `${marker} unexpectedly succeeded`);
  assert.match(result.stderr, new RegExp(marker, "u"));
}

const sourceSha = h("source");
const mappingSha = h("mapping");
const planSha = h("plan");
const targetSha = h("target");
const authSha = h("authorization");
const nonceSha = h("nonce");
const rollbackAuthSha = h("rollback-authorization");
const rollbackNonceSha = h("rollback-nonce");
const t0Sha = h("t0-receipt");
const factLoaderContractSha = h("fact-loader-contract");

try {
  psql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  command("sh", ["scripts/db-migrate.sh"], { env: {
    ...process.env,
    COMPOSE_FILE: composeFile,
    COMPOSE_PROJECT_NAME: composeProject,
    POSTGRES_USER: "jinhu",
    POSTGRES_DB: database,
    MIGRATION_EXECUTED_BY: "synthetic-performance-fact-loader-contract",
    MIGRATION_BASELINE_ON_NONEMPTY_DB: "no",
  } });

  const scopeSha = psql(database,
    `SELECT hr_yuzhou_production_target_scope_sha256(${q(tenant)},${q(park)});`).stdout.trim();
  assert.match(scopeSha, /^[0-9a-f]{64}$/u);

  // The two original lab materializers are the oracle for the exact six-set
  // aggregates. Their rows are removed before the production path runs.
  psql(database, `
    INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,
      phase,status,tool_version,execution_context,started_at)
    VALUES(${q(labBatch)}::uuid,'synthetic-fact-oracle','yuzhou-v10',${q(sourceSha)},
      current_database(),'load','running','contract-test','lab_rehearsal',now());
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_lab(${q(tenant)},${q(park)},${q(labBatch)}::uuid,${q(JSON.stringify(facts))}::jsonb);
    CALL materialize_yuzhou_performance_legacy_master_lab(${q(tenant)},${q(park)},${q(labBatch)}::uuid,${q(JSON.stringify(masters))}::jsonb);
    COMMIT;
  `);
  const aggregate = psql(database, `
    SELECT fact_set.template_rows,fact_set.level_rule_rows,fact_set.dimension_rows,
      fact_set.guide_rows,fact_set.dimension_result_rows,fact_set.master_result_rows,
      fact_set.active_fact_maps,identity.fact_set_sha256,fact_set.full_fact_set_sha256
    FROM hr_yuzhou_performance_full_fact_set_v1(${q(tenant)},${q(park)},${q(labBatch)}::uuid) fact_set
    CROSS JOIN hr_yuzhou_performance_fact_identity_set_v1(${q(tenant)},${q(park)},${q(labBatch)}::uuid) identity;
  `).stdout.trim().split("|");
  assert.deepEqual(aggregate.slice(0, 7), ["1", "1", "1", "1", "1", "1", "6"]);
  const identityFactSetSha = aggregate[7];
  const fullFactSetSha = aggregate[8];
  assert.match(identityFactSetSha, /^[0-9a-f]{64}$/u);
  assert.match(fullFactSetSha, /^[0-9a-f]{64}$/u);
  psql(database, `
    BEGIN;
    UPDATE migration_batch SET phase='rollback',status='running' WHERE id=${q(labBatch)}::uuid;
    SET LOCAL yuzhou.performance_legacy_rollback_batch_id=${q(labBatch)};
    DELETE FROM hr_performance_legacy_master_result WHERE migration_batch_id=${q(labBatch)}::uuid;
    DELETE FROM hr_performance_legacy_dimension_result WHERE migration_batch_id=${q(labBatch)}::uuid;
    DELETE FROM hr_performance_legacy_dimension_level_guide WHERE migration_batch_id=${q(labBatch)}::uuid;
    DELETE FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id=${q(labBatch)}::uuid;
    DELETE FROM hr_performance_legacy_level_rule WHERE migration_batch_id=${q(labBatch)}::uuid;
    DELETE FROM hr_performance_legacy_template_profile WHERE migration_batch_id=${q(labBatch)}::uuid;
    UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false WHERE batch_id=${q(labBatch)}::uuid;
    SET CONSTRAINTS ALL IMMEDIATE;
    COMMIT;
  `);

  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SELECT hr_yuzhou_consume_import_authorization_v2(
      ${q(operation)},${q(codeSha)},${q(sourceSha)},${q(mappingSha)},${q(planSha)},${q(targetSha)},
      ${q(tenant)},${q(park)},${q(scopeSha)},${q(authSha)},${q(nonceSha)},
      now()-interval '1 minute',now()+interval '1 hour',now()-interval '2 minutes',now()+interval '2 hours',
      ${q(h("approvals"))},${q(h("manifest"))},${q(h("pair"))},${q(h("pair-a"))},${q(h("pair-b"))});
    INSERT INTO hr_yuzhou_production_import_phase(
      operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,
      applied_record_count,before_canonical_sha256,payload_bundle_artifact_sha256,
      payload_bundle_sha256,canonicalization_version)
    SELECT ${q(operation)},phase,ordinal,'planned',${q(h("phase-manifest"))},0,0,
      ${q(h("before"))},${q(h("bundle-artifact"))},${q(h("bundle"))},
      'yuzhou-production-import-canonical-json-v1'
    FROM (VALUES('T0',0),('T1',1),('T2',2),('T3',3)) phases(phase,ordinal);
    UPDATE hr_yuzhou_production_import_operation SET status='running',started_at=now(),current_phase='T0'
      WHERE operation_id=${q(operation)};
    UPDATE hr_yuzhou_production_import_phase SET status='running',started_at=now()
      WHERE operation_id=${q(operation)} AND phase='T0';
    INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,
      phase,status,tool_version,execution_context,production_import_operation_id,
      production_import_phase,started_at)
    VALUES(${q(productionBatch)}::uuid,${q(`${operation}-t0`)},'yuzhou-v10',${q(sourceSha)},
      current_database(),'load','running',${q(`prod-import-v2@${codeSha}`)},
      'production_import',${q(operation)},'T0',now());
    UPDATE migration_batch SET status='succeeded',finished_at=now() WHERE id=${q(productionBatch)}::uuid;
    UPDATE hr_yuzhou_production_import_phase SET status='succeeded',after_canonical_sha256=${q(t0Sha)},
      finished_at=now() WHERE operation_id=${q(operation)} AND phase='T0';
    COMMIT;
  `);

  const commonArguments = [
    q(operation), q(planSha), q(factLoaderContractSha), q(authSha), q(nonceSha), q(codeSha),
    q(sourceSha), q(mappingSha), q(targetSha), q(tenant), q(park), q(scopeSha), q(t0Sha),
    q(h("restore-receipt")), q(h("fact-location-receipt")), q(h("fact-location-canonical")),
    q(factArtifactSha), q(masterArtifactSha),
  ];
  const expectedArguments = ["1", "1", "1", "1", "1", "1", "6", q(identityFactSetSha),
    q(fullFactSetSha), q(migrationFiles[300].sha256), q(migrationFiles[301].sha256),
    q(migrationFiles[302].sha256), q(migrationFiles[303].sha256), q(migrationFiles[310].sha256),
    q(migrationFiles[311].sha256)];
  const applySql = t0 => `SELECT status,replayed,template_rows,level_rule_rows,dimension_rows,
    guide_rows,dimension_result_rows,master_result_rows,active_fact_maps,
    identity_fact_set_sha256,full_fact_set_sha256,receipt_sha256
    FROM hr_yuzhou_apply_performance_facts_production_v1(${[
      ...commonArguments.slice(0, 12), q(t0), ...commonArguments.slice(13),
      `decode(${q(factBytes.toString("hex"))},'hex')`,
      `decode(${q(masterBytes.toString("hex"))},'hex')`, ...expectedArguments,
    ].join(",")});`;

  expectReject(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SET LOCAL ROLE jinhu_hr_yuzhou_performance_facts_writer;
    ${applySql(h("wrong-t0"))} COMMIT;`, "HR_PERFORMANCE_FACTS_PRODUCTION_T0_RECEIPT_INVALID");
  assert.equal(psql(database, `SELECT count(*) FROM legacy_record_map
    WHERE batch_id=${q(productionBatch)}::uuid AND is_active;`).stdout.trim(), "0");

  const first = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SET LOCAL ROLE jinhu_hr_yuzhou_performance_facts_writer;
    ${applySql(t0Sha)} COMMIT;`).stdout.trim().split("|");
  assert.deepEqual(first.slice(0, 9), ["succeeded", "f", "1", "1", "1", "1", "1", "1", "6"]);
  assert.equal(first[9], identityFactSetSha);
  assert.equal(first[10], fullFactSetSha);
  assert.match(first[11], /^[0-9a-f]{64}$/u);
  const factLoaderReceiptSha = first[11];
  assert.equal(psql(database, `SELECT count(*) FROM legacy_record_map
    WHERE batch_id=${q(productionBatch)}::uuid AND is_active AND mapping_status='loaded';`).stdout.trim(), "6");

  const replay = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SET LOCAL ROLE jinhu_hr_yuzhou_performance_facts_writer;
    ${applySql(t0Sha)} COMMIT;`).stdout.trim().split("|");
  assert.equal(replay[1], "t");
  assert.equal(replay[11], factLoaderReceiptSha);
  assert.equal(psql(database, `SELECT hr_yuzhou_performance_fact_loader_dependency_valid_v1(
    ${q(operation)},${q(productionBatch)}::uuid,${q(tenant)},${q(park)},${q(scopeSha)},${q(t0Sha)},
    ${q(factLoaderReceiptSha)},${q(identityFactSetSha)});`).stdout.trim(), "t");
  assert.equal(psql(database, `SELECT hr_yuzhou_performance_fact_loader_dependency_valid_v1(
    ${q(operation)},${q(productionBatch)}::uuid,${q(tenant)},${q(park)},${q(scopeSha)},${q(t0Sha)},
    ${q(h("wrong-receipt"))},${q(identityFactSetSha)});`).stdout.trim(), "f");

  psql(database, `
    UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now()
      WHERE operation_id=${q(operation)};
    INSERT INTO hr_yuzhou_production_import_rollback_operation(
      rollback_operation_id,import_operation_id,status,sealed_plan_sha256,target_identity_sha256,
      authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,
      authorization_expires_at,started_at)
    VALUES(${q(rollbackOperation)},${q(operation)},'running',${q(planSha)},${q(targetSha)},
      ${q(rollbackAuthSha)},${q(rollbackNonceSha)},now()-interval '1 minute',now()+interval '1 hour',now());
    INSERT INTO hr_yuzhou_production_import_authorization_use(
      intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256)
    VALUES('production_import_rollback',${q(rollbackOperation)},${q(operation)},
      ${q(rollbackAuthSha)},${q(rollbackNonceSha)});
  `);
  const rollbackArguments = [q(rollbackOperation), q(operation), q(planSha), q(factLoaderContractSha),
    q(rollbackAuthSha), q(rollbackNonceSha), q(codeSha), q(sourceSha), q(mappingSha), q(targetSha),
    q(tenant), q(park), q(scopeSha), q(t0Sha), q(h("restore-receipt")),
    q(h("fact-location-receipt")), q(h("fact-location-canonical")), q(factArtifactSha),
    q(masterArtifactSha), ...expectedArguments];
  const rollbackSql = `SELECT status,rollback_order,residual_count,replayed,receipt_sha256
    FROM hr_yuzhou_rollback_performance_facts_production_v1(${rollbackArguments.join(",")});`;
  const rolledBack = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SET LOCAL ROLE jinhu_hr_yuzhou_performance_facts_writer; ${rollbackSql} COMMIT;`).stdout.trim().split("|");
  assert.deepEqual(rolledBack.slice(0, 4), ["rolled_back",
    "master_result>dimension_result>dimension_level_guide>dimension_profile>level_rule>template_profile",
    "0", "f"]);
  assert.match(rolledBack[4], /^[0-9a-f]{64}$/u);
  psql(database, `UPDATE hr_yuzhou_production_import_rollback_operation
    SET status='succeeded',finished_at=now() WHERE rollback_operation_id=${q(rollbackOperation)};`);
  const rollbackReplay = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SET LOCAL ROLE jinhu_hr_yuzhou_performance_facts_writer; ${rollbackSql} COMMIT;`).stdout.trim().split("|");
  assert.equal(rollbackReplay[3], "t");
  assert.equal(rollbackReplay[4], rolledBack[4]);
  assert.equal(psql(database, `SELECT
    (SELECT count(*) FROM legacy_record_map WHERE batch_id=${q(productionBatch)}::uuid AND is_active)+
    (SELECT count(*) FROM hr_performance_legacy_template_profile WHERE migration_batch_id=${q(productionBatch)}::uuid)+
    (SELECT count(*) FROM hr_performance_legacy_level_rule WHERE migration_batch_id=${q(productionBatch)}::uuid)+
    (SELECT count(*) FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id=${q(productionBatch)}::uuid)+
    (SELECT count(*) FROM hr_performance_legacy_dimension_level_guide WHERE migration_batch_id=${q(productionBatch)}::uuid)+
    (SELECT count(*) FROM hr_performance_legacy_dimension_result WHERE migration_batch_id=${q(productionBatch)}::uuid)+
    (SELECT count(*) FROM hr_performance_legacy_master_result WHERE migration_batch_id=${q(productionBatch)}::uuid);`).stdout.trim(), "0");

  console.log(JSON.stringify({
    status: "PASS", migration: "000311", originalMaterializersReused: true,
    syntheticNonemptyCapability: true, realNonemptyRuntimeUat: "NOT_CLAIMED",
    wrongT0ResidualCount: 0, exactReplay: true, dependencyHook: true,
    rollbackReplay: true, residualCount: 0, productionWrite: false,
  }));
} finally {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`, false);
}
