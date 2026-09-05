#!/usr/bin/env node
/* global console, process, structuredClone */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

import {
  computeProductionImportPayloadHash,
  computeSealedProductionImportPlanHash,
} from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import {
  createHeldPerformanceRelationsBinding,
} from "../hr-cutover/production-import-performance-relations-contract.mjs";
import {
  createProductionPerformanceFactLoaderBinding,
} from "../hr-cutover/production-import-performance-fact-loader-contract.mjs";
import {
  createProductionPerformanceFactIdentityBinding,
} from "../hr-cutover/production-import-performance-fact-identity-contract.mjs";
import { createProductionImportPhaseWriters } from "../hr-cutover/production-import-phase-writers.mjs";
import { createProductionImportPhaseRollback } from "../hr-cutover/production-import-phase-rollback.mjs";
import { createProductionImportPostgresAdapter } from "../hr-cutover/production-import-postgres-adapter.mjs";
import {
  executeSealedProductionImport,
  rollbackSealedProductionImport,
} from "../hr-cutover/production-import-writer.mjs";
import {
  activatedContract,
  makeFixture,
  seedExisting,
} from "./yuzhou-production-import-full-chain-direct-pg.mjs";

const { Pool } = pg;
const root = resolve(import.meta.dirname, "../..");
const database = process.env.YUZHOU_TARGET_DATABASE ?? "";
const host = process.env.YUZHOU_LAB_PG_HOST ?? "";
const port = Number(process.env.YUZHOU_LAB_PG_PORT ?? "0");
const user = process.env.YUZHOU_LAB_PG_USER ?? "";
const password = process.env.YUZHOU_LAB_PG_PASSWORD ?? "";
const EMPTY_SET_SHA256 = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
const EMPLOYEE_CODE = "SYNTHA";

assert.match(database, /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u);
assert.ok(["127.0.0.1", "::1", "localhost"].includes(host));
assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
assert.match(user, /^[A-Za-z0-9_]{1,63}$/u);
assert.ok(password.length > 0);

const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sha256File = relative => sha256(readFileSync(resolve(root, relative)));
const sourcePersonIdentity = code => sha256(Buffer.from(`dbo.person\0${code.trim()}`, "utf8"));
const pool = new Pool({ host, port, user, password, database, max: 2 });

function performanceArtifacts(employeeCode) {
  const relations = {
    asssession: Array.from({ length: 7 }, (_, index) => ({
      sourceIdentitySha256: h(`session-${index + 1}`),
      sourceRowSha256: h(`session-row-${index + 1}`),
      id: index + 1,
      asssession: `Synthetic ${index + 1}`,
      description: null,
      assessmenttype: null,
      year: 2026,
      month: index + 1,
      quarter: null,
      myorder: index + 1,
    })),
    asssour: [],
    asssourperson: Array.from({ length: 117 }, (_, index) => ({
      sourceIdentitySha256: h(`assignment-${index + 1}`),
      sourceRowSha256: h(`assignment-row-${index + 1}`),
      id: index + 1,
      asssessionid: 1,
      person: index < 9 ? employeeCode : `X${String(index).padStart(3, "0")}`,
      assperson: "",
      lb: 1,
    })),
  };
  const identity = {
    sessions: relations.asssession.map(session => ({
      sourceSessionIdentitySha256: session.sourceIdentitySha256,
      status: "unmatched",
      reasonCode: "NO_MODERN_CYCLE",
      targetReviewCycleId: null,
      decisionAttestationSha256: h(`session-decision-${session.id}`),
    })),
  };
  const emptyFacts = {
    assessmentcode: [],
    assgradecode: [],
    assitem: [],
    assitemgradedes: [],
    assessmentdetail: [],
  };
  const emptyMasters = { assessmentmaster: [] };
  return {
    relationPayloadArtifact: Buffer.from(JSON.stringify(relations)),
    identityDecisionArtifact: Buffer.from(JSON.stringify(identity)),
    factPayloadArtifact: Buffer.from(JSON.stringify(emptyFacts)),
    masterPayloadArtifact: Buffer.from(JSON.stringify(emptyMasters)),
  };
}

function bindPerformanceChain(fixture) {
  const artifacts = performanceArtifacts(EMPLOYEE_CODE);
  const t0PhaseReceiptSha256 = fixture.plan.phases.find(phase => phase.phase === "T0")
    .expectedAfterCanonicalSha256;
  const relations = createHeldPerformanceRelationsBinding({
    triple: structuredClone(fixture.plan.triple),
    relationPayloadArtifactSha256: sha256(artifacts.relationPayloadArtifact),
    identityDecisionArtifactSha256: sha256(artifacts.identityDecisionArtifact),
    t0PhaseReceiptSha256,
  });
  const loader = createProductionPerformanceFactLoaderBinding({
    triple: structuredClone(fixture.plan.triple),
    sourceRestoreReceiptSha256: h("source-restore-receipt"),
    sourceFactLocationReceiptSha256: relations.sourceFactLocationReceiptSha256,
    sourceFactLocationCanonicalSha256: relations.sourceFactLocationCanonicalSha256,
    factPayloadArtifactSha256: sha256(artifacts.factPayloadArtifact),
    masterPayloadArtifactSha256: sha256(artifacts.masterPayloadArtifact),
    t0PhaseReceiptSha256,
    migration310Sha256: sha256File("database/migrations/000310_hr_yuzhou_performance_fact_identity_production.sql"),
    migration311Sha256: sha256File("database/migrations/000311_hr_yuzhou_performance_facts_production.sql"),
    templateRows: 0,
    levelRuleRows: 0,
    dimensionRows: 0,
    guideRows: 0,
    dimensionResultRows: 0,
    masterResultRows: 0,
    activeFactMaps: 0,
    identityFactSetSha256: EMPTY_SET_SHA256,
    fullFactSetSha256: EMPTY_SET_SHA256,
    sourceOutcomeFactStatus: "AUTHORITATIVE_EMPTY",
    productionImport: "HOLD",
  });
  const identity = createProductionPerformanceFactIdentityBinding({
    triple: structuredClone(fixture.plan.triple),
    parentPerformanceRelationsBinding: relations,
    parentPerformanceFactLoaderBinding: loader,
    t0PhaseReceiptSha256,
    expectedDimensionRows: 0,
    expectedMasterRows: 0,
    expectedFactSetSha256: EMPTY_SET_SHA256,
  });
  Object.assign(fixture.plan, {
    performanceRelations: relations,
    performanceFactLoader: loader,
    performanceFactIdentity: identity,
  });
  Object.assign(fixture.plan.authorization.binding, {
    performanceRelationsContractSha256: computeProductionImportPayloadHash(relations),
    performanceFactLoaderContractSha256: computeProductionImportPayloadHash(loader),
    performanceFactIdentityContractSha256: computeProductionImportPayloadHash(identity),
  });
  fixture.plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(fixture.plan);
  fixture.rollbackAuthorization.sealedPlanSha256 = fixture.plan.sealing.sealedPlanSha256;
  return artifacts;
}

function cryptoProvider(fixture) {
  return {
    async encryptBeforeImage({ targetBefore }) {
      const ciphertext = Buffer.from(JSON.stringify(targetBefore));
      assert.equal(sha256(ciphertext), fixture.org.beforeImage.ciphertextSha256);
      return { ciphertext, nonce: randomBytes(12), authenticationTag: randomBytes(16) };
    },
    async encryptQuarantine({ payload }) {
      const ciphertext = Buffer.from(JSON.stringify(payload));
      assert.equal(
        sha256(ciphertext),
        fixture.records.find(record => record.disposition === "quarantine")
          .quarantine.payloadCiphertextSha256,
      );
      return { ciphertext, nonce: randomBytes(12), authenticationTag: randomBytes(16) };
    },
    async decryptBeforeImage({ envelope }) {
      return {
        plaintextSha256: fixture.org.expectedTargetBeforeSha256,
        targetBefore: JSON.parse(envelope.ciphertext.toString("utf8")),
      };
    },
  };
}

async function runtime(fixture) {
  const client = await pool.connect();
  const preflight = await client.query(
    "SELECT current_database() AS database,current_user AS username,inet_server_addr()::text AS server_address,inet_server_port()::integer AS server_port,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid",
  );
  assert.deepEqual(
    [preflight.rows[0].database, preflight.rows[0].username],
    [database, user],
  );
  const adapter = createProductionImportPostgresAdapter({
    pool,
    ownership: "borrowed",
    binding: {
      database,
      databaseUser: user,
      targetIdentitySha256: fixture.plan.target.identitySha256,
      targetScope: fixture.targetScope,
      serverIdentity: {
        address: preflight.rows[0].server_address,
        port: preflight.rows[0].server_port,
        databaseOid: preflight.rows[0].database_oid,
      },
    },
  });
  return { client, adapter };
}

function executeOptions(fixture, artifacts, adapter, phaseWriters) {
  return {
    contract: activatedContract(fixture.plan),
    now: new Date(),
    currentCodeSha: fixture.plan.triple.codeSha,
    mergedCodeSha: fixture.plan.triple.codeSha,
    targetIdentitySha256: fixture.plan.target.identitySha256,
    targetScope: fixture.targetScope,
    database: adapter,
    payloadBundles: fixture.payloadBundles,
    phaseWriters,
    performanceRelations: {
      relationPayloadArtifact: artifacts.relationPayloadArtifact,
      identityDecisionArtifact: artifacts.identityDecisionArtifact,
    },
    performanceFactLoader: {
      factPayloadArtifact: artifacts.factPayloadArtifact,
      masterPayloadArtifact: artifacts.masterPayloadArtifact,
    },
  };
}

async function assertApplied(client, fixture, result) {
  assert.deepEqual(result.phases, [
    "T0", "PERFORMANCE_FACTS", "PERFORMANCE_RELATIONS", "PERFORMANCE_FACT_IDENTITY",
    "T1", "T2", "T3",
  ]);
  assert.equal(result.status, "succeeded");
  assert.deepEqual(
    Object.keys(result.databaseReceiptSha256ByDomain).sort(),
    ["PERFORMANCE_FACTS", "PERFORMANCE_FACT_IDENTITY", "PERFORMANCE_RELATIONS"],
  );
  assert.ok(Object.values(result.databaseReceiptSha256ByDomain)
    .every(value => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value)));
  const state = await client.query(
    `SELECT
      (SELECT count(*)::int FROM hr_performance_legacy_template_profile WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_level_rule WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_dimension_level_guide WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_dimension_result WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_master_result WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS fact_rows,
      (SELECT count(*)::int FROM hr_performance_legacy_session WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS sessions,
      (SELECT count(*)::int FROM hr_performance_legacy_source_person_assignment WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS assignments,
      (SELECT count(*)::int FROM hr_performance_legacy_identity_resolution WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS identities,
      (SELECT count(*)::int FROM hr_performance_legacy_session_binding WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS session_bindings,
      (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id
        WHERE batch.production_import_operation_id=$1 AND map.target_table LIKE 'hr_performance_legacy_%'
          AND map.is_active AND map.mapping_status='verified') AS verified_performance_maps,
      (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id
        WHERE batch.production_import_operation_id=$1 AND map.target_table LIKE 'hr_performance_legacy_%'
          AND map.is_active AND map.mapping_status='loaded') AS loaded_performance_maps,
      (SELECT count(*)::int FROM hr_yuzhou_production_import_phase
        WHERE operation_id=$1 AND phase='T1' AND status='succeeded') AS t1_succeeded`,
    [fixture.plan.operationId],
  );
  assert.deepEqual(state.rows[0], {
    fact_rows: 0,
    sessions: 7,
    assignments: 117,
    identities: 234,
    session_bindings: 7,
    verified_performance_maps: 124,
    loaded_performance_maps: 0,
    t1_succeeded: 1,
  });
  const personStates = await client.query(
    `SELECT person_role,person_resolution_status,count(*)::int AS rows
     FROM hr_performance_legacy_identity_resolution
     WHERE migration_batch_id IN
       (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)
     GROUP BY person_role,person_resolution_status
     ORDER BY person_role,person_resolution_status`,
    [fixture.plan.operationId],
  );
  assert.deepEqual(personStates.rows, [
    { person_role: "assessor", person_resolution_status: "not_applicable", rows: 117 },
    { person_role: "subject", person_resolution_status: "resolved", rows: 9 },
    { person_role: "subject", person_resolution_status: "unmatched", rows: 108 },
  ]);
}

async function assertRolledBack(client, fixture) {
  const residual = await client.query(
    `SELECT
      (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id
        WHERE batch.production_import_operation_id=$1 AND map.is_active) AS active_maps,
      (SELECT count(*)::int FROM hr_performance_legacy_session WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_score_source WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_source_person_assignment WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_template_profile WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_level_rule WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_dimension_level_guide WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_dimension_result WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_master_result WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_identity_resolution WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1))+
      (SELECT count(*)::int FROM hr_performance_legacy_session_binding WHERE migration_batch_id IN
        (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS performance_rows,
      (SELECT count(*)::int FROM hr_yuzhou_production_import_phase
        WHERE operation_id=$1 AND status<>'rolled_back') AS phases_not_rolled_back,
      (SELECT count(*)::int FROM hr_yuzhou_performance_facts_production_receipt
        WHERE operation_id=$1 AND status='rolled_back') AS facts_receipt,
      (SELECT count(*)::int FROM hr_yuzhou_performance_relations_production_receipt
        WHERE operation_id=$1 AND status='rolled_back') AS relations_receipt,
      (SELECT count(*)::int FROM hr_yuzhou_performance_fact_identity_production_receipt
        WHERE operation_id=$1 AND status='rolled_back') AS identity_receipt`,
    [fixture.plan.operationId],
  );
  assert.deepEqual(residual.rows[0], {
    active_maps: 0,
    performance_rows: 0,
    phases_not_rolled_back: 0,
    facts_receipt: 1,
    relations_receipt: 1,
    identity_receipt: 1,
  });
}

async function assertFailedWithoutVisibility(client, fixture, observed) {
  assert.equal(observed.extensionsCompleteBeforeT1Failure, true);
  const residual = await client.query(
    `SELECT
      (SELECT status FROM hr_yuzhou_production_import_operation WHERE operation_id=$1) AS status,
      (SELECT count(*)::int FROM hr_yuzhou_production_import_phase WHERE operation_id=$1) AS phases,
      (SELECT count(*)::int FROM hr_yuzhou_production_import_record WHERE operation_id=$1) AS controls,
      (SELECT count(*)::int FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1) AS projections,
      (SELECT count(*)::int FROM migration_batch WHERE production_import_operation_id=$1) AS batches,
      (SELECT count(*)::int FROM hr_yuzhou_performance_facts_production_receipt WHERE operation_id=$1)+
      (SELECT count(*)::int FROM hr_yuzhou_performance_relations_production_receipt WHERE operation_id=$1)+
      (SELECT count(*)::int FROM hr_yuzhou_performance_fact_identity_production_receipt WHERE operation_id=$1) AS performance_receipts,
      (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id
        WHERE batch.production_import_operation_id=$1 AND map.is_active) AS active_maps`,
    [fixture.plan.operationId],
  );
  assert.deepEqual(residual.rows[0], {
    status: "failed",
    phases: 0,
    controls: 0,
    projections: 0,
    batches: 0,
    performance_receipts: 0,
    active_maps: 0,
  });
  for (const record of fixture.records.filter(record => record.disposition === "insert")) {
    const row = await client.query(
      `SELECT count(*)::int AS rows FROM ${record.plannedTargetTable} WHERE id=$1`,
      [record.targetId],
    );
    assert.equal(row.rows[0].rows, 0, `${record.plannedTargetTable} failure residue`);
  }
}

async function runSuccess() {
  const now = new Date();
  const fixture = makeFixture(101, now, {
    employeeCode: EMPLOYEE_CODE,
    employeeSourceIdentitySha256: sourcePersonIdentity(EMPLOYEE_CODE),
  });
  const artifacts = bindPerformanceChain(fixture);
  const { client, adapter } = await runtime(fixture);
  try {
    await seedExisting(client, fixture);
    const provider = cryptoProvider(fixture);
    const result = await executeSealedProductionImport(
      fixture.plan,
      executeOptions(fixture, artifacts, adapter, createProductionImportPhaseWriters({ cryptoProvider: provider })),
    );
    await assertApplied(client, fixture, result);
    const rollback = await rollbackSealedProductionImport(
      fixture.plan,
      fixture.rollbackAuthorization,
      {
        ...executeOptions(fixture, artifacts, adapter, createProductionImportPhaseWriters({ cryptoProvider: provider })),
        rollbackPhase: createProductionImportPhaseRollback({ cryptoProvider: provider }),
        verifyBusinessResiduals: async ({ tx, operationId, targetScope, plan }) => {
          let residualCount = 0;
          for (const phase of plan.phases) for (const record of phase.records) {
            if (record.disposition !== "insert") continue;
            const found = await tx.query(
              `SELECT count(*)::int AS count FROM ${record.plannedTargetTable}
               WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
              [targetScope.tenantId, targetScope.parkId, record.targetId],
            );
            residualCount += found.rows[0].count;
          }
          return {
            operationId,
            targetScopeSha256: targetScope.scopeSha256,
            residualCount,
            evidenceSha256: h(`${operationId}:${targetScope.scopeSha256}:business:${residualCount}`),
          };
        },
      },
    );
    assert.equal(rollback.status, "rolled_back");
    assert.equal(rollback.residualCount, 0);
    await assertRolledBack(client, fixture);
  } finally {
    await adapter.close();
    client.release();
  }
}

async function runFailure() {
  const now = new Date();
  const fixture = makeFixture(102, now, {
    employeeCode: EMPLOYEE_CODE,
    employeeSourceIdentitySha256: sourcePersonIdentity(EMPLOYEE_CODE),
  });
  const artifacts = bindPerformanceChain(fixture);
  const { client, adapter } = await runtime(fixture);
  const observed = { extensionsCompleteBeforeT1Failure: false };
  try {
    await seedExisting(client, fixture);
    const provider = cryptoProvider(fixture);
    const phaseWriters = createProductionImportPhaseWriters({ cryptoProvider: provider });
    const failAtT1 = {
      ...phaseWriters,
      T1: async input => {
        const inTransaction = await input.tx.query(
          `SELECT
            (SELECT count(*)::int FROM hr_performance_legacy_session WHERE migration_batch_id IN
              (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS sessions,
            (SELECT count(*)::int FROM hr_performance_legacy_source_person_assignment WHERE migration_batch_id IN
              (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS assignments,
            (SELECT count(*)::int FROM hr_performance_legacy_identity_resolution WHERE migration_batch_id IN
              (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)) AS identities,
            (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id
              WHERE batch.production_import_operation_id=$1
                AND map.target_table LIKE 'hr_performance_legacy_%'
                AND map.is_active AND map.mapping_status='verified') AS verified_maps`,
          [fixture.plan.operationId],
        );
        assert.deepEqual(inTransaction.rows[0], {
          sessions: 7,
          assignments: 117,
          identities: 234,
          verified_maps: 124,
        });
        observed.extensionsCompleteBeforeT1Failure = true;
        throw Object.assign(new Error("synthetic failure after full performance chain"), {
          code: "SYNTHETIC_AFTER_PERFORMANCE_CHAIN",
        });
      },
    };
    await assert.rejects(
      () => executeSealedProductionImport(
        fixture.plan,
        executeOptions(fixture, artifacts, adapter, failAtT1),
      ),
      /synthetic failure after full performance chain/u,
    );
    await assertFailedWithoutVisibility(client, fixture, observed);
  } finally {
    await adapter.close();
    client.release();
  }
}

try {
  await runSuccess();
  await runFailure();
  console.log("YUZHOU_PRODUCTION_IMPORT_PERFORMANCE_FULL_CHAIN_DIRECT_PG_PASS actual-entrypoint 311>308>310>T1 rollback=310>308>311>core failure-residual=0 current-outcome-facts=0");
} finally {
  await pool.end();
}
