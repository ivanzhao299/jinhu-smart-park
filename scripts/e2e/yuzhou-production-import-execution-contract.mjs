#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
  ProductionImportExecutionError,
  computeSealedProductionImportPlanHash,
  validateSealedProductionImportPlan,
} from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { executeSealedProductionImport, rollbackSealedProductionImport } from "../hr-cutover/production-import-writer.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const H = character => character.repeat(64);
const TARGET = { environment: "production", alias: "jinhu-smart-park-production", identitySha256: H("a") };
const NOW = new Date("2026-08-29T01:00:00.000Z");

function planFixture({ disposition = "insert", phase = "T0" } = {}) {
  const targetTable = { T0: "hr_employee", T1: "hr_employment_event", T2: "hr_contract", T3: "hr_employee_insurance_period" }[phase];
  const record = {
    sourceIdentitySha256: H("1"),
    sourceRowSha256: H("2"),
    disposition,
    ...(phase === "T0" ? {} : { ownerSourceIdentitySha256: H("3") }),
    ...(disposition === "quarantine" ? {
      decisionAttestationSha256: H("4"),
      quarantine: { reasonCode: "OWNER_MAPPING_UNRESOLVED", algorithm: "aes-256-gcm-external-kek-v1", payloadCiphertextSha256: H("5"), keyReferenceSha256: H("6") },
    } : {
      targetTable,
      targetId: "11111111-1111-4111-8111-111111111111",
      expectedTargetAfterSha256: disposition === "skip_approved" ? H("6") : H("7"),
      ...(["merge", "skip_approved"].includes(disposition) ? { expectedTargetBeforeSha256: H("6"), decisionAttestationSha256: H("4") } : {}),
      ...(disposition === "merge" ? { beforeImage: { algorithm: "aes-256-gcm-external-kek-v1", plaintextSha256: H("6"), ciphertextSha256: H("8"), keyReferenceSha256: H("9") } } : {}),
    }),
  };
  const t0OwnerRecord = {
    sourceIdentitySha256: H("3"),
    sourceRowSha256: H("a"),
    disposition: "insert",
    targetTable: "hr_employee",
    targetId: "33333333-3333-4333-8333-333333333333",
    expectedTargetAfterSha256: H("b"),
  };
  const phases = ["T0", "T1", "T2", "T3"].map((name, ordinal) => ({
    phase: name,
    ordinal,
    sourceBatchManifestSha256: H(String(ordinal + 2)),
    beforeCanonicalSha256: H(String(ordinal + 3)),
    expectedAfterCanonicalSha256: H(String(ordinal + 4)),
    records: name === "T0" && phase !== "T0" ? [t0OwnerRecord] : (name === phase ? [record] : []),
  }));
  const plan = {
    formatVersion: 1,
    planKind: "yuzhou_hr_production_import_sealed_execution_plan",
    operationId: "yzprod-import-20260829T010000Z-123456abcdef",
    intent: "production_import",
    status: "SEALED",
    triple: { codeSha: "1".repeat(40), sourceSnapshotHash: H("a"), mappingContractHash: H("b") },
    target: TARGET,
    window: { startsAt: "2026-08-29T00:00:00.000Z", endsAt: "2026-08-29T02:00:00.000Z" },
    authorization: {
      intent: "production_import",
      artifactSha256: H("c"), nonceSha256: H("d"), issuedAt: "2026-08-29T00:30:00.000Z", expiresAt: "2026-08-29T01:30:00.000Z",
      binding: {
        triple: { codeSha: "1".repeat(40), sourceSnapshotHash: H("a"), mappingContractHash: H("b") },
        targetIdentitySha256: TARGET.identitySha256,
        finalRehearsalPairSha256: H("f"),
        manifestSha256: H("e"),
        windowStartsAt: "2026-08-29T00:00:00.000Z",
        windowEndsAt: "2026-08-29T02:00:00.000Z",
      },
      approvalSet: [
        { role: "hr_owner", subjectRefSha256: H("4"), signedDecisionSha256: H("7") },
        { role: "data_security_owner", subjectRefSha256: H("5"), signedDecisionSha256: H("8") },
        { role: "release_owner", subjectRefSha256: H("6"), signedDecisionSha256: H("9") },
      ],
    },
    manifestSha256: H("e"),
    finalRehearsalPair: {
      artifactSha256: H("f"),
      triple: { codeSha: "1".repeat(40), sourceSnapshotHash: H("a"), mappingContractHash: H("b") },
      rehearsals: [
        { rehearsal: "A", manifestSha256: H("1"), cleanupAuditSha256: H("2"), residualCount: 0 },
        { rehearsal: "B", manifestSha256: H("3"), cleanupAuditSha256: H("4"), residualCount: 0 },
      ],
    },
    phaseOrder: ["T0", "T1", "T2", "T3"],
    phases,
    rollback: { order: ["T3", "T2", "T1", "T0"], insert: "delete_operation_owned_target", merge: "encrypted_before_image_cas_restore", quarantine: "no_target_write", skipApproved: "no_target_write", residualCount: 0, canonicalHash: "EXACT" },
    sealing: { algorithm: "canonical-json-sha256-v1", sealedPlanSha256: H("0") },
    productionImport: "HOLD",
  };
  plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan);
  return plan;
}

const activatedOptions = plan => ({
  contract: activatedContract(),
  now: NOW,
  currentCodeSha: plan.triple.codeSha,
  mergedCodeSha: plan.triple.codeSha,
  targetIdentitySha256: plan.target.identitySha256,
});

function activatedContract() {
  const contract = structuredClone(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT);
  contract.activation = { status: "PASS", allowedTargets: [structuredClone(TARGET)], reasonCodes: [] };
  contract.productionImport = "READY";
  return contract;
}

function rollbackAuthorization(plan) {
  return {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_rollback_authorization",
    intent: "production_import_rollback",
    rollbackOperationId: "yzprod-rollback-20260829T020000Z-abcdef123456",
    importOperationId: plan.operationId,
    sealedPlanSha256: plan.sealing.sealedPlanSha256,
    targetIdentitySha256: plan.target.identitySha256,
    authorizationArtifactSha256: H("8"),
    authorizationNonceSha256: H("9"),
    issuedAt: "2026-08-29T00:30:00.000Z",
    expiresAt: "2026-08-29T01:30:00.000Z",
    productionImport: "HOLD",
  };
}

function mockDatabase(queryHandler = async () => ({ rows: [] })) {
  const calls = [];
  return {
    calls,
    async transaction(options, callback) {
      calls.push({ kind: "transaction", options });
      return callback({ query: async (sql, parameters = []) => {
        calls.push({ kind: "query", sql, parameters });
        return queryHandler(sql, parameters);
      } });
    },
  };
}

test("the repository execution contract keeps target activation empty and HOLD", () => {
  assert.equal(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.activation.status, "HOLD");
  assert.deepEqual(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.activation.allowedTargets, []);
  assert.equal(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.productionImport, "HOLD");
  const migration = readFileSync(resolve(ROOT, "database/migrations/000278_hr_yuzhou_production_import_control.sql"), "utf8");
  assert.match(migration, /current_setting\('transaction_isolation'\) <> 'serializable'/u);
  assert.match(migration, /UNIQUE[\s\S]+authorization_artifact_sha256/u);
  assert.match(migration, /REVOKE ALL ON FUNCTION hr_yuzhou_consume_import_authorization/u);
  assert.match(migration, /intent='production_import'[\s\S]+intent='production_import_rollback'/u);
  assert.match(migration, /authorization_issued_at >= window_starts_at[\s\S]+authorization_expires_at <= window_ends_at/u);
  assert.match(migration, /trg_hr_yuzhou_prod_record_owner_map/u);
  assert.match(migration, /ck_hr_yuzhou_prod_record_target_allowlist/u);
  assert.match(migration, /REVOKE ALL ON FUNCTION hr_yuzhou_consume_rollback_authorization/u);
  assert.match(migration, /REVOKE ALL ON SEQUENCE hr_yuzhou_production_import_authorization_use_usage_id_seq FROM PUBLIC/u);
  for (const path of [
    ".github/workflows/deploy-production.yml",
    "scripts/prod-deploy.sh",
    "scripts/db-seed-prod.sh",
    "scripts/hr-cutover/full-domain-lifecycle.sh",
  ]) assert.doesNotMatch(readFileSync(resolve(ROOT, path), "utf8"), /production-import-writer|production-import-execution-v1/u, `${path} must not reach production import execution`);
  const packageScripts = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).scripts;
  for (const [name, command] of Object.entries(packageScripts)) {
    if (name === "test:e2e:yuzhou-production-import-execution") continue;
    assert.doesNotMatch(command, /production-import-writer|production-import-execution-v1/u, `${name} must not reach production import execution`);
  }
});

test("a valid sealed T0-T3 plan is deterministic but default execution is unreachable", async () => {
  const plan = planFixture();
  assert.equal(validateSealedProductionImportPlan(plan, { now: NOW }).sealing.sealedPlanSha256, plan.sealing.sealedPlanSha256);
  await assert.rejects(
    executeSealedProductionImport(plan, { now: NOW, database: mockDatabase(), phaseWriters: {} }),
    error => error instanceof ProductionImportExecutionError && error.code === "PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE",
  );
});

test("even an activated contract cannot execute without concrete database and T0-T3 adapters", async () => {
  const plan = planFixture();
  await assert.rejects(executeSealedProductionImport(plan, activatedOptions(plan)), error => error.code === "PRODUCTION_IMPORT_DATABASE_ADAPTER_REQUIRED");
  await assert.rejects(executeSealedProductionImport(plan, { ...activatedOptions(plan), database: mockDatabase(), phaseWriters: {} }), error => error.code === "PRODUCTION_IMPORT_PHASE_WRITER_REQUIRED");
});

test("dependent phases require exact T0 source identity and no name matching escape", () => {
  const plan = planFixture({ phase: "T1" });
  delete plan.phases[1].records[0].ownerSourceIdentitySha256;
  plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan);
  assert.throws(() => validateSealedProductionImportPlan(plan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED");
  const foreign = planFixture({ phase: "T1" });
  foreign.phases[1].records[0].ownerSourceIdentitySha256 = H("0");
  foreign.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(foreign);
  assert.throws(() => validateSealedProductionImportPlan(foreign, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED");
  const contract = activatedContract();
  contract.identityResolution.nameMatching = true;
  assert.throws(() => validateSealedProductionImportPlan(planFixture(), { contract, now: NOW }), error => error.code === "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID");
});

test("merge requires encrypted before-image bound to the CAS precondition", () => {
  const valid = planFixture({ disposition: "merge" });
  assert.doesNotThrow(() => validateSealedProductionImportPlan(valid, { now: NOW }));
  valid.phases[0].records[0].beforeImage.plaintextSha256 = H("5");
  valid.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(valid);
  assert.throws(() => validateSealedProductionImportPlan(valid, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_CAS_PRECONDITION_REQUIRED");
});

test("activated-contract simulation executes all phases in one SERIALIZABLE transaction", async () => {
  const plan = planFixture();
  const database = mockDatabase();
  const phaseWriters = Object.fromEntries(plan.phases.map(phase => [phase.phase, async () => ({
    afterCanonicalSha256: phase.expectedAfterCanonicalSha256,
    records: phase.records.map(record => ({ sourceIdentitySha256: record.sourceIdentitySha256, disposition: record.disposition, targetId: record.targetId, targetAfterSha256: record.expectedTargetAfterSha256 })),
  })]));
  const result = await executeSealedProductionImport(plan, { ...activatedOptions(plan), database, phaseWriters });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(database.calls.filter(call => call.kind === "transaction").map(call => call.options), [
    { isolationLevel: "SERIALIZABLE", purpose: "consume_import_authorization" },
    { isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" },
  ]);
  assert(database.calls.some(call => call.sql?.includes("hr_yuzhou_consume_import_authorization")));
  assert.equal(database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_phase")).length, 4);
});

test("rollback enforces reverse phase order and merge CAS evidence", async () => {
  const plan = planFixture({ disposition: "merge" });
  const rollbackCalls = [];
  const database = mockDatabase(async sql => {
    if (sql.startsWith("SELECT status")) return { rows: [{ status: "succeeded", sealed_plan_sha256: plan.sealing.sealedPlanSha256 }] };
    if (sql.startsWith("SELECT count")) return { rows: [{ count: 0 }] };
    return { rows: [] };
  });
  const result = await rollbackSealedProductionImport(plan, rollbackAuthorization(plan), {
    ...activatedOptions(plan),
    database,
    rollbackRecord: async ({ phase, record }) => {
      rollbackCalls.push(phase);
      if (record.disposition === "merge") return { sourceIdentitySha256: record.sourceIdentitySha256, rollbackStatus: "restored_merge", observedCurrentSha256: record.expectedTargetAfterSha256, restoredSha256: record.expectedTargetBeforeSha256, casApplied: true };
      throw new Error("unexpected record");
    },
  });
  assert.equal(result.residualCount, 0);
  assert.equal(result.rollbackOperationId, "yzprod-rollback-20260829T020000Z-abcdef123456");
  assert.deepEqual(rollbackCalls, ["T0"]);
  const phaseUpdates = database.calls.filter(call => call.sql?.includes("UPDATE hr_yuzhou_production_import_phase SET status='rolling_back'")).map(call => call.parameters[1]);
  assert.deepEqual(phaseUpdates, ["T3", "T2", "T1", "T0"]);
});

test("import authorization consumption commits before a failed T0-T3 transaction and gets an independent failure receipt", async () => {
  const plan = planFixture();
  const database = mockDatabase();
  const phaseWriters = Object.fromEntries(plan.phases.map(phase => [phase.phase, async () => {
    if (phase.phase === "T1") throw new Error("simulated business failure");
    return { afterCanonicalSha256: phase.expectedAfterCanonicalSha256, records: phase.records.map(record => ({ sourceIdentitySha256: record.sourceIdentitySha256, disposition: record.disposition, targetId: record.targetId, targetAfterSha256: record.expectedTargetAfterSha256 })) };
  }]));
  await assert.rejects(executeSealedProductionImport(plan, { ...activatedOptions(plan), database, phaseWriters }), /simulated business failure/u);
  assert.deepEqual(database.calls.filter(call => call.kind === "transaction").map(call => call.options.purpose), ["consume_import_authorization", "apply_t0_t3", "record_import_failure"]);
  const consumeIndex = database.calls.findIndex(call => call.sql?.includes("hr_yuzhou_consume_import_authorization"));
  const failureIndex = database.calls.findIndex(call => call.sql?.includes("failure_code"));
  assert(consumeIndex >= 0 && failureIndex > consumeIndex);
});

test("rollback rejects the import authorization and consumes a distinct rollback intent first", async () => {
  const plan = planFixture();
  const reused = rollbackAuthorization(plan);
  reused.authorizationArtifactSha256 = plan.authorization.artifactSha256;
  const database = mockDatabase();
  await assert.rejects(rollbackSealedProductionImport(plan, reused, { ...activatedOptions(plan), database, rollbackRecord: async () => ({}) }), error => error.code === "PRODUCTION_IMPORT_ROLLBACK_AUTH_REUSED");
  assert.equal(database.calls.length, 0);
});

test("wrong target and stale authorization fail before opening a transaction", async () => {
  const plan = planFixture();
  const wrongTarget = activatedContract();
  wrongTarget.activation.allowedTargets[0].identitySha256 = H("0");
  const database = mockDatabase();
  await assert.rejects(executeSealedProductionImport(plan, { contract: wrongTarget, now: NOW, database, phaseWriters: {} }), error => error.code === "PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED");
  assert.equal(database.calls.length, 0);
  const stale = planFixture();
  await assert.rejects(executeSealedProductionImport(stale, { ...activatedOptions(stale), now: new Date("2026-08-29T01:30:00.000Z"), database, phaseWriters: {} }), error => error.code === "PRODUCTION_IMPORT_AUTH_STALE");
  assert.equal(database.calls.length, 0);
});

test("sealed execution binds exact A/B, triple, target, manifest, window and independent approval receipts", async () => {
  const plan = planFixture();
  const wrongPair = structuredClone(plan);
  wrongPair.finalRehearsalPair.rehearsals[1].manifestSha256 = wrongPair.finalRehearsalPair.rehearsals[0].manifestSha256;
  wrongPair.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(wrongPair);
  assert.throws(() => validateSealedProductionImportPlan(wrongPair, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID");

  const escapedWindow = structuredClone(plan);
  escapedWindow.authorization.expiresAt = "2026-08-29T02:30:00.000Z";
  escapedWindow.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(escapedWindow);
  assert.throws(() => validateSealedProductionImportPlan(escapedWindow, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH");

  const reusedReceipt = structuredClone(plan);
  reusedReceipt.authorization.approvalSet[1].signedDecisionSha256 = reusedReceipt.authorization.approvalSet[0].signedDecisionSha256;
  reusedReceipt.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(reusedReceipt);
  assert.throws(() => validateSealedProductionImportPlan(reusedReceipt, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH");

  const database = mockDatabase();
  await assert.rejects(executeSealedProductionImport(plan, { ...activatedOptions(plan), currentCodeSha: "0".repeat(40), database, phaseWriters: {} }), error => error.code === "PRODUCTION_IMPORT_CODE_SHA_MISMATCH");
  await assert.rejects(executeSealedProductionImport(plan, { ...activatedOptions(plan), targetIdentitySha256: H("0"), database, phaseWriters: {} }), error => error.code === "PRODUCTION_IMPORT_TARGET_IDENTITY_MISMATCH");
  assert.equal(database.calls.length, 0);
});
