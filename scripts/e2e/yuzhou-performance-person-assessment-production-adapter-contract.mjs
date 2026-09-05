#!/usr/bin/env node
/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { capturePerformancePersonAssessmentSourceAdapter } from "../hr-cutover/performance-person-assessment-source-adapter.mjs";
import {
  computePerformancePersonAssessmentProductionBindingHash,
  executePerformancePersonAssessmentProductionPayload,
  performancePersonAssessmentProductionHash,
  rollbackPerformancePersonAssessmentProductionPayload,
  sealPerformancePersonAssessmentProductionPayload,
  validatePerformancePersonAssessmentProductionPayload,
} from "../hr-cutover/performance-person-assessment-production-adapter.mjs";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import { createProductionImportPostgresAdapter } from "../hr-cutover/production-import-postgres-adapter.mjs";

const root = resolve(import.meta.dirname, "../..");
const sourceContract = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-person-assessment-source-adapter-v1.json");
const productionContract = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-person-assessment-production-adapter-v1.json");
const h = value => createHash("sha256").update(`fixture:${value}`).digest("hex");
const now = new Date("2026-09-05T01:00:00.000Z");
const sourceDatabase = "YuzhouHR_Lab_prodadapter01";
const authority = { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false };

function sourceArtifacts(sourceAssessmentId = null) {
  const sandbox = mkdtempSync(join(tmpdir(), "yuzhou-perfrel-production-contract-"));
  chmodSync(sandbox, 0o700);
  const sourceRestoreReceipt = sealSourceRestoreReceipt({
    formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt", sourceSnapshotSha256: h("source"),
    backup: { sha256: h("source"), bytes: 1, containerCopySha256: h("source"), containerCopyBytes: 1 },
    identities: { containerSha256: h("container"), imageSha256: h("image"), databaseSha256: createHash("sha256").update(sourceDatabase).digest("hex"), restoreSha256: h("restore"), catalogSha256: h("catalog") },
    state: { online: true, readOnly: true }, etlAuthority: authority, productionImport: "HOLD",
  });
  const restorePath = join(sandbox, "source-restore.json");
  writeFileSync(restorePath, `${JSON.stringify(sourceRestoreReceipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(restorePath, 0o600);
  const sourceRestoreReceiptArtifactSha256 = performancePersonAssessmentProductionHash(readFileSync(restorePath));
  const privatePath = join(sandbox, "person-assessment.private.json");
  const safePath = join(sandbox, "person-assessment.safe.json");
  capturePerformancePersonAssessmentSourceAdapter({
    repositoryRoot: root, contractPath: sourceContract, sourceRestoreReceiptPath: restorePath,
    sourceRestoreReceiptSha256: sourceRestoreReceiptArtifactSha256, sourceContainer: "fixture-sqlserver",
    databaseAlias: sourceDatabase, privatePayloadPath: privatePath, safeReceiptPath: safePath,
  }, { probe: { inspect: () => ({
    state: { personTableExists: true, assessmentcodeTableExists: true, databaseReadOnly: true, databaseIdentity: sourceDatabase, authority, containerIdentitySha256: h("container"), imageIdentitySha256: h("image"), healthy: true, project: "jinhu_yuzhou_migration_lab" },
    catalog: [
      { table: "person", column: "person", sqlType: "varchar", maxLength: 10, precision: 0, scale: 0, nullable: false, computed: false },
      { table: "person", column: "assessment", sqlType: "int", maxLength: 4, precision: 10, scale: 0, nullable: true, computed: false },
      { table: "assessmentcode", column: "assessment", sqlType: "int", maxLength: 4, precision: 10, scale: 0, nullable: false, computed: false },
    ],
    aggregate: {
      totalAssessmentCodeRows: sourceAssessmentId === null ? 0 : 1, distinctAssessmentKeys: sourceAssessmentId === null ? 0 : 1,
      duplicateAssessmentKeyGroups: 0, duplicateAssessmentRows: 0, totalPersonRows: 1, distinctSafeIdentityCount: 1,
      identityNormalizationCollisionGroups: 0, identityDuplicateGroups: 0, identityNullRows: 0, identityBlankRows: 0,
      identityNonAsciiRows: 0, identityNormalizationCollisionRows: 0, identityDuplicateRows: 0,
      assessmentNotApplicableRows: sourceAssessmentId === null ? 1 : 0, assessmentUnmatchedRows: 0,
      assessmentResolvedRows: sourceAssessmentId === null ? 0 : 1, assessmentAmbiguousRows: 0, loadableRows: 1, quarantinedRows: 0,
    },
    privateRows: [{ sourcePersonIdentitySha256: h("person"), sourceAssessmentId }],
  }) } });
  return {
    sourceRestoreReceipt,
    sourceRestoreReceiptArtifactSha256,
    sourcePrivatePayload: JSON.parse(readFileSync(privatePath, "utf8")),
    sourcePrivatePayloadArtifactSha256: performancePersonAssessmentProductionHash(readFileSync(privatePath)),
    safeReceipt: JSON.parse(readFileSync(safePath, "utf8")),
    safeReceiptArtifactSha256: performancePersonAssessmentProductionHash(readFileSync(safePath)),
  };
}

function artifact(sourceAssessmentId = null) {
  return sealPerformancePersonAssessmentProductionPayload({
    operationId: "yzprod-perfrel-20260905T010000Z-123456abcdef",
    parentImportOperationId: "yzprod-import-20260905T000000Z-abcdef123456",
    triple: { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") },
    target: { identitySha256: h("target"), scope: { tenantId: "tenant-a", parkId: "park-a", scopeSha256: h("scope") } },
    t0ArtifactSha256: h("t0"), window: { startsAt: "2026-09-05T00:00:00.000Z", endsAt: "2026-09-05T02:00:00.000Z" },
    ...sourceArtifacts(sourceAssessmentId),
  }, { contractPath: productionContract });
}

function authorization(payload, rollback = false) {
  const intent = rollback ? "production_performance_person_assessment_rollback" : "production_performance_person_assessment_import";
  const rollbackOperationId = "yzprod-perfrel-rollback-20260905T013000Z-abcdef123456";
  const bindingSha256 = performancePersonAssessmentProductionHash({
    intent, operationId: payload.operationId, ...(rollback ? { rollbackOperationId } : {}),
    sealedArtifactSha256: payload.sealing.sealedArtifactSha256,
    targetIdentitySha256: payload.target.identitySha256, targetScopeSha256: payload.target.scope.scopeSha256,
    productionBindingSha256: computePerformancePersonAssessmentProductionBindingHash(payload),
  });
  return {
    formatVersion: 1,
    artifactKind: rollback ? "yuzhou_hr_performance_person_assessment_rollback_authorization" : "yuzhou_hr_performance_person_assessment_import_authorization",
    intent, ...(rollback ? { rollbackOperationId } : { operationId: payload.operationId }),
    artifactSha256: h(rollback ? "rollback-auth" : "import-auth"), nonceSha256: h(rollback ? "rollback-nonce" : "import-nonce"),
    issuedAt: "2026-09-05T00:30:00.000Z", expiresAt: "2026-09-05T01:30:00.000Z", bindingSha256,
  };
}

function receipt(payload, status = "succeeded") {
  return {
    operationId: payload.operationId, status, sealedArtifactSha256: payload.sealing.sealedArtifactSha256,
    bindingSha256: computePerformancePersonAssessmentProductionBindingHash(payload), targetScopeSha256: payload.target.scope.scopeSha256,
    evidenceRows: status === "rolled_back" ? 0 : payload.rowCount, masterRows: status === "rolled_back" ? 0 : 1,
    resolutionRows: status === "rolled_back" ? 0 : 1, stateSha256: h(`${status}-state`),
  };
}

function database(payload, initialOperation = null, capabilityOverride = {}) {
  const calls = [];
  let operation = initialOperation;
  return {
    calls,
    async probeTarget(expected) { calls.push({ kind: "target" }); return { targetIdentitySha256: expected.targetIdentitySha256, targetScope: structuredClone(expected.targetScope) }; },
    async probePerformancePersonAssessmentCapability() {
      calls.push({ kind: "capability" });
      return {
        executionContext: "production_import", phase: "PERFREL", migrationArtifactSha256: payload.bindings.migrationArtifactSha256,
        parentImportOperationId: payload.parentImportOperationId, t0ArtifactSha256: payload.bindings.t0ArtifactSha256,
        contractArtifactSha256: payload.bindings.contractArtifactSha256,
        applyProcedure: "materialize_yuzhou_performance_ass_compute_weight_relation_production",
        rollbackProcedure: "rollback_yuzhou_performance_ass_compute_weight_relation_production", ...capabilityOverride,
      };
    },
    async probePerformancePersonAssessmentOperation() { calls.push({ kind: "operation" }); return operation; },
    async transaction(options, callback) {
      calls.push({ kind: "transaction", purpose: options.purpose });
      if (options.purpose === "apply_performance_person_assessment") operation = receipt(payload, "succeeded");
      if (options.purpose === "rollback_performance_person_assessment") operation = receipt(payload, "rolled_back");
      const result = await callback({ query: async (sql, parameters) => { calls.push({ kind: "query", sql, parameters }); return { rows: [] }; } });
      return result;
    },
    async readPerformancePersonAssessmentReceipt() {
      return operation ?? (operation = receipt(payload, "succeeded"));
    },
  };
}

const options = (payload, db) => ({ contractPath: productionContract, now, currentCodeSha: payload.triple.codeSha, mergedCodeSha: payload.triple.codeSha, database: db });

test("seals exact C/S/M, T0, source receipt, contract, payload and migration bindings without source values in safe metadata", () => {
  const payload = artifact();
  assert.equal(validatePerformancePersonAssessmentProductionPayload(payload, { contractPath: productionContract, now }).rowCount, 1);
  assert.equal(payload.bindings.sourceRestoreReceiptSha256.length, 64);
  assert.equal(payload.bindings.migrationArtifactSha256, "0467f31888a5fb52c7c63ab1e754a68ab76822b2e177318bf249f71eb1f8887a");
  assert.equal(payload.containsPersonCodes, false);
  assert.equal(payload.compatibilityCredit, 0);
  assert.equal(payload.productionImport, "HOLD");
  const { payload: privateRows, ...safeMetadata } = payload;
  assert.ok(privateRows.personAssessments.length > 0);
  assert.equal(JSON.stringify(safeMetadata).includes(privateRows.personAssessments[0].sourcePersonIdentitySha256), false);
});

test("rejects payload, code and capability drift before the first write transaction", async () => {
  const payload = artifact();
  const drift = structuredClone(payload);
  drift.payload.personAssessments[0].sourceAssessmentId = 9;
  const driftDb = database(payload);
  await assert.rejects(executePerformancePersonAssessmentProductionPayload(drift, authorization(payload), options(payload, driftDb)), error => error.code === "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_INVALID" || error.code === "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_PAYLOAD_DRIFT");
  assert.equal(driftDb.calls.length, 0);

  const capabilityDb = database(payload, null, { executionContext: "lab_rehearsal" });
  await assert.rejects(executePerformancePersonAssessmentProductionPayload(payload, authorization(payload), options(payload, capabilityDb)), error => error.code === "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_CAPABILITY_UNAVAILABLE");
  assert.equal(capabilityDb.calls.filter(call => call.kind === "transaction").length, 0);
});

test("consumes import authority separately, writes once and returns the exact prior receipt on replay", async () => {
  const payload = artifact(7);
  const db = database(payload);
  const first = await executePerformancePersonAssessmentProductionPayload(payload, authorization(payload), options(payload, db));
  assert.equal(first.status, "succeeded");
  assert.deepEqual(db.calls.filter(call => call.kind === "transaction").map(call => call.purpose), [
    "consume_performance_person_assessment_authorization", "apply_performance_person_assessment",
  ]);
  const beforeReplay = db.calls.filter(call => call.kind === "transaction").length;
  const replay = await executePerformancePersonAssessmentProductionPayload(payload, authorization(payload), options(payload, db));
  assert.equal(replay.stateSha256, first.stateSha256);
  assert.equal(db.calls.filter(call => call.kind === "transaction").length, beforeReplay);
});

test("requires a distinct one-time rollback authorization and proves reverse zero residual", async () => {
  const payload = artifact(7);
  const db = database(payload, receipt(payload, "succeeded"));
  await assert.rejects(rollbackPerformancePersonAssessmentProductionPayload(payload, authorization(payload), options(payload, db)), error => error.code === "PERFORMANCE_PERSON_ASSESSMENT_PRODUCTION_AUTH_INVALID");
  const result = await rollbackPerformancePersonAssessmentProductionPayload(payload, authorization(payload, true), options(payload, db));
  assert.equal(result.status, "rolled_back");
  assert.equal(result.evidenceRows, 0);
  assert.equal(result.resolutionRows, 0);
  assert.deepEqual(db.calls.filter(call => call.kind === "transaction").map(call => call.purpose), [
    "consume_performance_person_assessment_rollback_authorization", "rollback_performance_person_assessment",
  ]);
});

test("current 000307 remains lab-only and cannot be misreported as production-ready", () => {
  const contract = JSON.parse(readFileSync(productionContract, "utf8"));
  const migration = readFileSync(resolve(root, contract.weightRelationMigration.path), "utf8");
  assert.equal(contract.databaseCapability.currentMigrationCapability, "lab_rehearsal_only");
  assert.match(migration, /execution_context<>'lab_rehearsal'/u);
  assert.doesNotMatch(migration, /materialize_yuzhou_performance_ass_compute_weight_relation_production/u);
  assert.equal(contract.productionImport, "HOLD");
});

test("the injected PostgreSQL adapter exposes only fixed capability/receipt probes and allowlisted transactions", async () => {
  const payload = artifact(7);
  const queries = [];
  const client = { async query(sql, parameters = []) {
    queries.push({ sql, parameters });
    if (sql.includes("production_capability")) return { rows: [{
      execution_context: "production_import", phase: "PERFREL", migration_artifact_sha256: payload.bindings.migrationArtifactSha256,
      parent_import_operation_id: payload.parentImportOperationId, t0_artifact_sha256: payload.bindings.t0ArtifactSha256,
      contract_artifact_sha256: payload.bindings.contractArtifactSha256,
      apply_procedure: "materialize_yuzhou_performance_ass_compute_weight_relation_production",
      rollback_procedure: "rollback_yuzhou_performance_ass_compute_weight_relation_production",
    }] };
    if (sql.includes("production_receipt")) return { rows: [{
      operation_id: payload.operationId, status: "succeeded", sealed_artifact_sha256: payload.sealing.sealedArtifactSha256,
      binding_sha256: computePerformancePersonAssessmentProductionBindingHash(payload), target_scope_sha256: payload.target.scope.scopeSha256,
      evidence_rows: "1", master_rows: "1", resolution_rows: "1", state_sha256: h("state"),
    }] };
    return { rows: [] };
  } };
  const adapter = createProductionImportPostgresAdapter({
    client, ownership: "borrowed",
    binding: { database: "fixture", databaseUser: "fixture_role", targetIdentitySha256: payload.target.identitySha256, targetScope: payload.target.scope, serverIdentity: { address: "127.0.0.1", port: 5432, databaseOid: "1" } },
  });
  assert.equal((await adapter.probePerformancePersonAssessmentCapability(payload)).phase, "PERFREL");
  assert.equal((await adapter.probePerformancePersonAssessmentOperation(payload.operationId)).evidenceRows, 1);
  await adapter.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_performance_person_assessment" }, async () => undefined);
  assert.ok(queries.some(query => query.sql.includes("production_capability") && query.parameters.length === 5));
  assert.ok(queries.some(query => query.sql.includes("production_receipt") && query.parameters.length === 1));
  assert.ok(queries.some(query => query.sql.includes("set_config('application_name'") && query.parameters[0] === "jinhu_hr_prod_import:apply_performance_person_assessment"));
});
