#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";

const apiRequire = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const workspaceRoot = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
assert.ok(realpathSync(apiRequire.resolve("pg")).startsWith(`${workspaceRoot}/`), "PostgreSQL dependency must belong to this worktree");
const pg = apiRequire("pg");

import {
  DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
} from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { makeFixture as makeSyntheticFixture, verifyFullChainFixtureReadback } from "./production-import-full-chain-test-fixture.mjs";
import { buildProductionImportPlanPhase } from "../hr-cutover/production-import-plan-phase-builder.mjs";
import { createProductionImportPhaseWriters, readProductionImportBaselineRows } from "../hr-cutover/production-import-phase-writers.mjs";
import { createProductionImportPhaseRollback } from "../hr-cutover/production-import-phase-rollback.mjs";
import { createProductionImportPostgresAdapter } from "../hr-cutover/production-import-postgres-adapter.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
} from "../hr-cutover/production-import-target-model.mjs";
import { executeSealedProductionImport, rollbackSealedProductionImport } from "../hr-cutover/production-import-writer.mjs";

const { Pool } = pg;
const PHASES = ["T0", "T1", "T2", "T3"];
const TABLES = Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables);
const LAB_DATABASE = process.env.YUZHOU_TARGET_DATABASE ?? "";
const LAB_HOST = process.env.YUZHOU_LAB_PG_HOST ?? "";
const LAB_PORT = Number(process.env.YUZHOU_LAB_PG_PORT ?? "0");
const LAB_USER = process.env.YUZHOU_LAB_PG_USER ?? "";
const LAB_PASSWORD = process.env.YUZHOU_LAB_PG_PASSWORD ?? "";
const LAB_CONTAINER = process.env.YUZHOU_POSTGRES_CONTAINER ?? "";
const LAB_COMPOSE_PROJECT = process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT ?? "";

assert.match(LAB_DATABASE, /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u, "an explicit isolated lab database is required");
assert.ok(["127.0.0.1", "::1", "localhost"].includes(LAB_HOST), "the PostgreSQL host must be loopback");
assert.ok(Number.isSafeInteger(LAB_PORT) && LAB_PORT >= 1024 && LAB_PORT <= 65535, "an explicit loopback lab port is required");
assert.match(LAB_USER, /^[A-Za-z0-9_]{1,63}$/u, "an explicit lab database user is required");
assert.ok(LAB_PASSWORD.length > 0, "an explicit lab database password is required");
assert.match(LAB_CONTAINER, /^[A-Za-z0-9][A-Za-z0-9_.-]{2,127}$/u, "an explicit local PostgreSQL container is required");
assert.match(LAB_COMPOSE_PROJECT, /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/u, "an explicit local Compose project is required");
// The shared release-smoke compose file has a historical fixed container name
// containing "prod" even though its unique Compose project is disposable CI.
// Bind isolation to the observed Compose project label; an actual production
// project remains forbidden regardless of the container's cosmetic name.
assert.doesNotMatch(LAB_COMPOSE_PROJECT, /(?:^|[-_])prod(?:uction)?(?:$|[-_])/iu, "a production-labelled Compose project is forbidden");
const inspect = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', LAB_CONTAINER], { encoding: "utf8" });
assert.equal(inspect.status, 0, "the explicit lab PostgreSQL container must exist");
assert.equal(inspect.stdout.trim(), LAB_COMPOSE_PROJECT, "the PostgreSQL container must belong to the explicit lab Compose project");

const H = value => createHash("sha256").update(String(value)).digest("hex");
const pool = new Pool({ host: LAB_HOST, port: LAB_PORT, user: LAB_USER, password: LAB_PASSWORD, database: LAB_DATABASE, max: 2 });

function activatedContract(plan) {
  const contract = structuredClone(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT);
  contract.activation = { status: "PASS", allowedTargets: [{ ...structuredClone(plan.target), targetScopeSha256: plan.targetScope.scopeSha256 }], reasonCodes: [] };
  contract.productionImport = "READY";
  return contract;
}

function makeFixture(iteration, now, employeeOptions = {}) {
  return makeSyntheticFixture(iteration, now, employeeOptions, LAB_DATABASE);
}
async function seedExisting(client, fixture) {
  await client.query(
    `INSERT INTO sys_org(id,tenant_id,park_id,parent_id,org_code,org_name,org_type,sort_order,status,remark,contact_phone,planned_headcount,legacy_source_id,version)
     VALUES($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,3)`,
    [fixture.org.targetId, fixture.targetScope.tenantId, fixture.targetScope.parkId, ...Object.values(fixture.orgBeforePayload)],
  );
  const payload = fixture.records.find(record => record.plannedTargetTable === "hr_contract_type").payload;
  await client.query(
    `INSERT INTO hr_contract_type(id,tenant_id,park_id,type_code,type_name,status,is_historical_import,remark,version)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,1)`,
    [fixture.contractType.targetId, fixture.targetScope.tenantId, fixture.targetScope.parkId, payload.type_code, payload.type_name, payload.status, payload.is_historical_import, payload.remark],
  );
  // Independently verify the real seeded before rows and global insert absence.
  // No writer-returned digest is used to prepare or approve this fixture.
  for (const phase of fixture.plan.phases) {
    const baselineRows = [];
    for (const table of [...new Set(phase.records.filter(r => r.disposition !== "quarantine").map(r => r.targetTable))]) {
      const existing = phase.records.filter(r => r.targetTable === table && ["merge", "skip_approved"].includes(r.disposition));
      if (existing.length) baselineRows.push(...await readProductionImportBaselineRows({ tx: client, table, records: existing, targetScope: fixture.targetScope }));
      const inserts = phase.records.filter(r => r.targetTable === table && r.disposition === "insert");
      if (inserts.length) assert.equal((await client.query(`SELECT id FROM ${table} WHERE id=ANY($1::uuid[])`, [inserts.map(r => r.targetId)])).rows.length, 0);
    }
    const observed = buildProductionImportPlanPhase({ phase, payloadBundle: JSON.parse(fixture.payloadBundles[phase.phase]), targetScope: fixture.targetScope,
      baseline: { targetScope: fixture.targetScope, rows: baselineRows }, dependencyTargets: fixture.records.filter(r => PHASES.indexOf(r.phase) < phase.ordinal) });
    assert.equal(observed.beforeCanonicalSha256, phase.beforeCanonicalSha256);
    assert.equal(observed.expectedAfterCanonicalSha256, phase.expectedAfterCanonicalSha256);
  }
}

async function verifyApplied(client, fixture) {
  const counts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM hr_yuzhou_production_import_record WHERE operation_id=$1) AS controls,
       (SELECT count(*)::int FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1) AS receipts,
       (SELECT count(*)::int FROM migration_batch WHERE production_import_operation_id=$1 AND status='succeeded') AS batches,
       (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id WHERE batch.production_import_operation_id=$1 AND map.is_active) AS active_maps`,
    [fixture.plan.operationId],
  );
  assert.deepEqual(counts.rows[0], { controls: 17, receipts: 17, batches: 4, active_maps: 17 });
  const visibility = await client.query(
    `SELECT record.disposition, map.mapping_status, count(*)::int AS count
       FROM hr_yuzhou_production_import_projection_receipt projection
       JOIN hr_yuzhou_production_import_record record
         ON record.operation_id=projection.operation_id AND record.phase=projection.phase
         AND record.source_identity_sha256=projection.source_identity_sha256
       JOIN legacy_record_map map ON map.id=projection.legacy_record_map_id
       WHERE projection.operation_id=$1 AND map.is_active
       GROUP BY record.disposition,map.mapping_status`,
    [fixture.plan.operationId],
  );
  for (const row of visibility.rows) {
    assert.equal(row.mapping_status, row.disposition === "quarantine" ? "quarantined" : "verified", "only reconciled owned records become query-visible");
    assert.equal(row.count, fixture.records.filter(record => record.disposition === row.disposition).length);
  }
  for (const table of TABLES) {
    const expected = fixture.records.filter(record => record.plannedTargetTable === table && record.disposition !== "quarantine").length;
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE tenant_id=$1 AND park_id=$2`, [fixture.targetScope.tenantId, fixture.targetScope.parkId]);
    assert.equal(result.rows[0].count, expected, `${table} applied count`);
  }
  for (const record of fixture.records) {
    if (record.disposition === "quarantine") continue;
    await verifyFullChainFixtureReadback(client, record, fixture.targetScope);
  }
  const evidence = await client.query("SELECT protected_file_id::text,size_bytes::text FROM hr_contract_legacy_evidence WHERE tenant_id=$1 AND park_id=$2", [fixture.targetScope.tenantId, fixture.targetScope.parkId]);
  assert.deepEqual(evidence.rows, [{ protected_file_id: fixture.protectedFileId, size_bytes: "9223372036854775806" }]);
  const timestamps = await client.query("SELECT source_effective_at::text AS event_at,signed_at::text AS signed_at FROM hr_employment_event CROSS JOIN hr_contract_change WHERE hr_employment_event.tenant_id=$1 AND hr_employment_event.park_id=$2 AND hr_contract_change.tenant_id=$1 AND hr_contract_change.park_id=$2", [fixture.targetScope.tenantId, fixture.targetScope.parkId]);
  assert.equal(timestamps.rows.length, 1);
  assert.equal(timestamps.rows[0].event_at, "2026-08-29 09:10:11.123456");
  assert.equal(timestamps.rows[0].signed_at, "2026-08-29 09:10:11");
}

async function verifyRolledBack(client, fixture) {
  for (const record of fixture.records) {
    if (record.disposition === "insert") {
      const result = await client.query(`SELECT count(*)::int AS count FROM ${record.plannedTargetTable} WHERE id=$1`, [record.targetId]);
      assert.equal(result.rows[0].count, 0, `${record.plannedTargetTable} inserted row removed`);
    }
  }
  const org = await client.query("SELECT org_name,version FROM sys_org WHERE id=$1", [fixture.org.targetId]);
  assert.deepEqual(org.rows, [{ org_name: fixture.orgBeforePayload.org_name, version: 3 }]);
  const restored = await client.query("SELECT contact_phone,planned_headcount,legacy_source_id FROM sys_org WHERE id=$1", [fixture.org.targetId]);
  assert.deepEqual(restored.rows, [{ contact_phone: fixture.orgBeforePayload.contact_phone, planned_headcount: fixture.orgBeforePayload.planned_headcount, legacy_source_id: fixture.orgBeforePayload.legacy_source_id }]);
  const preserved = await client.query("SELECT count(*)::int AS count,version FROM hr_contract_type WHERE id=$1 GROUP BY version", [fixture.contractType.targetId]);
  assert.deepEqual(preserved.rows, [{ count: 1, version: 1 }]);
  const residual = await client.query(
    `SELECT
       (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id WHERE batch.production_import_operation_id=$1 AND map.is_active) AS active_maps,
       (SELECT count(*)::int FROM hr_yuzhou_production_import_record WHERE operation_id=$1 AND rollback_status='not_started') AS controls_not_rolled_back,
       (SELECT count(*)::int FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 AND status<>'rolled_back') AS phases_not_rolled_back,
       (SELECT count(*)::int FROM hr_yuzhou_production_import_rollback_operation WHERE import_operation_id=$1 AND status='succeeded') AS rollback_succeeded`,
    [fixture.plan.operationId],
  );
  assert.deepEqual(residual.rows[0], { active_maps: 0, controls_not_rolled_back: 0, phases_not_rolled_back: 0, rollback_succeeded: 1 });
}

async function cleanupFixture(client, fixture) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    for (const table of [
      "hr_employee_insurance_item", "hr_employee_insurance_period", "hr_insurance_policy_item", "hr_insurance_policy",
      "hr_attendance_day", "hr_attendance_calendar_source", "hr_attendance_symbol_rule", "hr_attendance_import_batch",
      "hr_contract_legacy_evidence", "hr_contract_change", "hr_contract", "hr_contract_type", "hr_employment_event",
      "hr_employee", "hr_position", "sys_org",
    ]) await client.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND park_id=$2`, [fixture.targetScope.tenantId, fixture.targetScope.parkId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM legacy_record_map WHERE batch_id IN (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)", [fixture.plan.operationId]);
    await client.query("DELETE FROM migration_batch_item WHERE batch_id IN (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)", [fixture.plan.operationId]);
    await client.query("DELETE FROM migration_batch WHERE production_import_operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_record_dependency WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_before_image WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_quarantine WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_record WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_phase WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_authorization_use WHERE import_operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_rollback_operation WHERE import_operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_operation WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const residual = await client.query(
    `SELECT
      (SELECT count(*) FROM hr_yuzhou_production_import_operation WHERE operation_id=$1)+
      (SELECT count(*) FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1)+
      (SELECT count(*) FROM migration_batch WHERE production_import_operation_id=$1)+
      (SELECT count(*) FROM sys_org WHERE id=$2)+
      (SELECT count(*) FROM hr_contract_type WHERE id=$3) AS count`,
    [fixture.plan.operationId, fixture.org.targetId, fixture.contractType.targetId],
  );
  assert.equal(Number(residual.rows[0].count), 0, "fixture cleanup residual must be zero");
}

async function runIteration(iteration, failAfterT0 = false) {
  const now = new Date();
  const fixture = makeFixture(iteration, now);
  const client = await pool.connect();
  let adapter;
  try {
    const preflight = await client.query("SELECT current_database() AS database,current_user AS username,inet_server_addr()::text AS server_address,inet_server_port()::integer AS server_port,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,to_regclass('public.hr_yuzhou_production_import_projection_receipt') IS NOT NULL AS has_receipts");
    assert.equal(preflight.rows.length, 1);
    assert.equal(preflight.rows[0].database, LAB_DATABASE);
    assert.equal(preflight.rows[0].username, LAB_USER);
    assert.equal(preflight.rows[0].has_receipts, true);
    await seedExisting(client, fixture);
    const cryptoProvider = {
      async encryptBeforeImage({ targetBefore }) {
        const ciphertext = Buffer.from(JSON.stringify(targetBefore));
        assert.equal(H(ciphertext), fixture.org.beforeImage.ciphertextSha256);
        return { ciphertext, nonce: randomBytes(12), authenticationTag: randomBytes(16) };
      },
      async encryptQuarantine({ payload }) {
        const ciphertext = Buffer.from(JSON.stringify(payload));
        assert.equal(H(ciphertext), fixture.records.find(record => record.disposition === "quarantine").quarantine.payloadCiphertextSha256);
        return { ciphertext, nonce: randomBytes(12), authenticationTag: randomBytes(16) };
      },
      async decryptBeforeImage({ envelope }) {
        return { plaintextSha256: fixture.org.expectedTargetBeforeSha256, targetBefore: JSON.parse(envelope.ciphertext.toString("utf8")) };
      },
    };
    adapter = createProductionImportPostgresAdapter({
      pool,
      ownership: "borrowed",
      binding: {
        database: LAB_DATABASE,
        databaseUser: LAB_USER,
        targetIdentitySha256: fixture.plan.target.identitySha256,
        targetScope: fixture.targetScope,
        serverIdentity: { address: preflight.rows[0].server_address, port: preflight.rows[0].server_port, databaseOid: preflight.rows[0].database_oid },
      },
    });
    const contract = activatedContract(fixture.plan);
    const phaseWriters = { ...createProductionImportPhaseWriters({ cryptoProvider }) };
    if (failAfterT0) {
      phaseWriters.T1 = async ({ tx }) => {
        const promoted = await tx.query(
          `SELECT count(*)::int AS count FROM legacy_record_map map
             JOIN migration_batch batch ON batch.id=map.batch_id
             WHERE batch.production_import_operation_id=$1
               AND batch.production_import_phase='T0' AND map.is_active AND map.mapping_status='verified'`,
          [fixture.plan.operationId],
        );
        assert.equal(promoted.rows[0].count, fixture.records.filter(record => record.phase === "T0" && record.disposition !== "quarantine").length);
        throw Object.assign(new Error("synthetic failure after T0 verification"), { code: "SYNTHETIC_AFTER_T0_VERIFICATION" });
      };
      await assert.rejects(() => executeSealedProductionImport(fixture.plan, {
        contract, now, currentCodeSha: fixture.plan.triple.codeSha, mergedCodeSha: fixture.plan.triple.codeSha,
        targetIdentitySha256: fixture.plan.target.identitySha256, targetScope: fixture.targetScope,
        database: adapter, payloadBundles: fixture.payloadBundles, phaseWriters,
      }), error => error.code === "SYNTHETIC_AFTER_T0_VERIFICATION");
      const afterFailure = await client.query(
        `SELECT
           (SELECT count(*)::int FROM migration_batch WHERE production_import_operation_id=$1) AS batches,
           (SELECT count(*)::int FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1) AS receipts,
           (SELECT count(*)::int FROM hr_yuzhou_production_import_record WHERE operation_id=$1) AS controls,
           (SELECT count(*)::int FROM hr_yuzhou_production_import_phase WHERE operation_id=$1) AS phases,
           (SELECT status FROM hr_yuzhou_production_import_operation WHERE operation_id=$1) AS status`,
        [fixture.plan.operationId],
      );
      assert.deepEqual(afterFailure.rows[0], { batches: 0, receipts: 0, controls: 0, phases: 0, status: "failed" });
      for (const record of fixture.records.filter(record => record.disposition === "insert")) {
        assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${record.plannedTargetTable} WHERE id=$1`, [record.targetId])).rows[0].count, 0);
      }
      assert.deepEqual((await client.query("SELECT org_name,version FROM sys_org WHERE id=$1", [fixture.org.targetId])).rows,
        [{ org_name: fixture.orgBeforePayload.org_name, version: 3 }]);
      return;
    }
    const applied = await executeSealedProductionImport(fixture.plan, {
      contract, now, currentCodeSha: fixture.plan.triple.codeSha, mergedCodeSha: fixture.plan.triple.codeSha,
      targetIdentitySha256: fixture.plan.target.identitySha256, targetScope: fixture.targetScope,
      database: adapter, payloadBundles: fixture.payloadBundles, phaseWriters,
    });
    assert.equal(applied.status, "succeeded");
    await verifyApplied(client, fixture);
    const rollback = await rollbackSealedProductionImport(fixture.plan, fixture.rollbackAuthorization, {
      contract, now, currentCodeSha: fixture.plan.triple.codeSha, mergedCodeSha: fixture.plan.triple.codeSha,
      targetIdentitySha256: fixture.plan.target.identitySha256, targetScope: fixture.targetScope,
      database: adapter, rollbackPhase: createProductionImportPhaseRollback({ cryptoProvider }),
      verifyBusinessResiduals: async ({ tx, operationId, targetScope, plan }) => {
        let residualCount = 0;
        for (const phase of plan.phases) for (const record of phase.records) {
          if (record.disposition !== "insert") continue;
          const result = await tx.query(`SELECT count(*)::int AS count FROM ${record.plannedTargetTable} WHERE tenant_id=$1 AND park_id=$2 AND id=$3`, [targetScope.tenantId, targetScope.parkId, record.targetId]);
          residualCount += result.rows[0].count;
        }
        return { operationId, targetScopeSha256: targetScope.scopeSha256, residualCount, evidenceSha256: H(`${operationId}:${targetScope.scopeSha256}:business-residual:${residualCount}`) };
      },
    });
    assert.equal(rollback.operationId, fixture.plan.operationId);
    assert.equal(rollback.rollbackOperationId, fixture.rollbackAuthorization.rollbackOperationId);
    assert.equal(rollback.status, "rolled_back");
    assert.equal(rollback.residualCount, 0);
    assert.match(rollback.businessResidualEvidenceSha256, /^[0-9a-f]{64}$/u);
    await verifyRolledBack(client, fixture);
  } finally {
    if (adapter) await adapter.close();
    try {
      await cleanupFixture(client, fixture);
    } finally {
      client.release();
    }
  }
}

export { makeFixture, seedExisting, cleanupFixture, activatedContract };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runIteration(1);
    await runIteration(2);
    await runIteration(3, true);
    console.log("Production import full-chain PostgreSQL fixture passed twice: 16 tables, T0-T3, verified maps/control/canonical, insert/merge/skip/quarantine, reverse rollback, residual=0; failure after T0 verification leaves no business transaction residue");
  } finally {
    await pool.end();
  }
}
