#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
  ProductionImportExecutionError,
  computeProductionImportPayloadBundleHash,
  computeProductionImportPayloadHash,
  computeProductionImportTargetScopeHash,
  computeSealedProductionImportPlanHash,
  productionImportHash,
  validateProductionImportPayloadBundle,
  validateProductionPerformanceFactIdentityPlanBinding,
  validateProductionPerformanceFactLoaderPlanBinding,
  validateSealedProductionImportPlan,
} from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { executeSealedProductionImport, rollbackSealedProductionImport } from "../hr-cutover/production-import-writer.mjs";
import {
  attachHeldPerformanceRelationsBinding,
  createHeldPerformanceRelationsBinding,
} from "../hr-cutover/production-import-performance-relations-contract.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const NOW = new Date("2026-08-29T01:00:00.000Z");
const H = label => productionImportHash(`fixture:${label}`);
const uuid = index => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const TARGET = { environment: "production", alias: "jinhu-smart-park-production", identitySha256: H("target") };
const TARGET_SCOPE = { tenantId: "tenant-production", parkId: "park-production", scopeSha256: "" };
TARGET_SCOPE.scopeSha256 = computeProductionImportTargetScopeHash(TARGET_SCOPE);

function ref(role, record) {
  return { role, phase: record.phase, sourceIdentitySha256: record.sourceIdentitySha256, expectedTargetTable: record.plannedTargetTable };
}

function record(label, phase, plannedTargetTable, dependencyMode, dependencyRefs = []) {
  const payload = { legacyKey: label, normalizedVersion: 1 };
  return {
    phase,
    payload,
    sourceSystem: "yuzhou-v10",
    sourceTable: `dbo.fixture_${plannedTargetTable}`,
    sourcePkCanonical: `sha256:${H(`${label}:identity`)}`,
    sourceIdentitySha256: H(`${label}:identity`),
    sourceRowSha256: H(`${label}:row`),
    payloadSha256: computeProductionImportPayloadHash(payload),
    plannedTargetTable,
    dependencyMode,
    dependencyRefs,
    disposition: "insert",
    targetTable: plannedTargetTable,
    targetId: uuid(record.nextId++),
    businessIdentitySha256: H(`${label}:business-identity`),
    expectedTargetAfterSha256: H(`${label}:after`),
    targetVersionAfter: 1,
  };
}
record.nextId = 1;

export function v2Fixture() {
  record.nextId = 1;
  const org = record("org", "T0", "sys_org", "scope");
  const position = record("position", "T0", "hr_position", "record_graph", [ref("org", org)]);
  const employee = record("employee", "T0", "hr_employee", "record_graph", [ref("primary_org", org), ref("position", position)]);
  const event = record("event", "T1", "hr_employment_event", "employee", [ref("employee", employee)]);
  const contractType = record("contract-type", "T2", "hr_contract_type", "scope");
  const contract = record("contract", "T2", "hr_contract", "record_graph", [ref("employee", employee), ref("contract_type", contractType)]);
  const contractChange = record("contract-change", "T2", "hr_contract_change", "record_graph", [ref("contract", contract)]);
  const contractEvidence = record("contract-evidence", "T2", "hr_contract_legacy_evidence", "record_graph", [ref("contract", contract)]);
  const attendanceBatch = record("attendance-batch", "T3", "hr_attendance_import_batch", "scope");
  const symbolRule = record("symbol-rule", "T3", "hr_attendance_symbol_rule", "scope");
  const calendar = record("calendar", "T3", "hr_attendance_calendar_source", "record_graph", [ref("import_batch", attendanceBatch)]);
  const attendanceDay = record("attendance-day", "T3", "hr_attendance_day", "record_graph", [ref("calendar_source", calendar)]);
  const policy = record("policy", "T3", "hr_insurance_policy", "scope");
  const policyItem = record("policy-item", "T3", "hr_insurance_policy_item", "record_graph", [ref("policy", policy)]);
  const insurancePeriod = record("insurance-period", "T3", "hr_employee_insurance_period", "employee", [ref("employee", employee)]);
  const insuranceItem = record("insurance-item", "T3", "hr_employee_insurance_item", "record_graph", [ref("period", insurancePeriod)]);
  const byPhase = {
    T0: [org, position, employee],
    T1: [event],
    T2: [contractType, contract, contractChange, contractEvidence],
    T3: [attendanceBatch, symbolRule, calendar, attendanceDay, policy, policyItem, insurancePeriod, insuranceItem],
  };
  const payloadBundles = {};
  const phases = ["T0", "T1", "T2", "T3"].map((phaseName, ordinal) => {
    const sourceBatchManifestSha256 = H(`${phaseName}:source-manifest`);
    const bundle = {
      formatVersion: 2,
      artifactKind: "yuzhou_hr_production_import_payload_bundle",
      phase: phaseName,
      targetScope: structuredClone(TARGET_SCOPE),
      canonicalizationVersion: DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.canonicalizationVersion,
      sourceBatchManifestSha256,
      records: byPhase[phaseName].map(({ sourceIdentitySha256, sourceRowSha256, plannedTargetTable, payloadSha256, payload }) => ({
        sourceIdentitySha256, sourceRowSha256, targetTable: plannedTargetTable, payloadSha256, payload,
      })),
    };
    const artifact = Buffer.from(JSON.stringify(bundle));
    payloadBundles[phaseName] = artifact;
    return {
      phase: phaseName,
      ordinal,
      sourceBatchManifestSha256,
      payloadBundleArtifactSha256: productionImportHash(artifact),
      payloadBundleSha256: computeProductionImportPayloadBundleHash(bundle),
      canonicalizationVersion: bundle.canonicalizationVersion,
      beforeCanonicalSha256: H(`${phaseName}:before`),
      expectedAfterCanonicalSha256: H(`${phaseName}:after`),
      records: byPhase[phaseName].map(({ phase: ignoredPhase, payload: ignoredPayload, ...planned }) => planned),
    };
  });
  const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: H("source"), mappingContractHash: H("mapping") };
  const plan = {
    formatVersion: 2,
    planKind: "yuzhou_hr_production_import_sealed_execution_plan",
    operationId: "yzprod-import-20260829T010000Z-123456abcdef",
    intent: "production_import",
    status: "SEALED",
    triple,
    target: structuredClone(TARGET),
    targetScope: structuredClone(TARGET_SCOPE),
    window: { startsAt: "2026-08-29T00:00:00.000Z", endsAt: "2026-08-29T02:00:00.000Z" },
    authorization: {
      intent: "production_import", artifactSha256: H("authorization"), nonceSha256: H("nonce"), issuedAt: "2026-08-29T00:30:00.000Z", expiresAt: "2026-08-29T01:30:00.000Z",
      binding: {
        triple, targetIdentitySha256: TARGET.identitySha256, targetScopeSha256: TARGET_SCOPE.scopeSha256,
        finalRehearsalPairSha256: H("pair"), manifestSha256: H("manifest"),
        windowStartsAt: "2026-08-29T00:00:00.000Z", windowEndsAt: "2026-08-29T02:00:00.000Z",
      },
      approvalSet: [
        { role: "hr_owner", subjectRefSha256: H("hr-subject"), signedDecisionSha256: H("hr-decision") },
        { role: "data_security_owner", subjectRefSha256: H("security-subject"), signedDecisionSha256: H("security-decision") },
        { role: "release_owner", subjectRefSha256: H("release-subject"), signedDecisionSha256: H("release-decision") },
      ],
    },
    manifestSha256: H("manifest"),
    finalRehearsalPair: {
      artifactSha256: H("pair"), triple,
      rehearsals: [
        { rehearsal: "A", manifestSha256: H("rehearsal-a"), cleanupAuditSha256: H("cleanup-a"), residualCount: 0 },
        { rehearsal: "B", manifestSha256: H("rehearsal-b"), cleanupAuditSha256: H("cleanup-b"), residualCount: 0 },
      ],
    },
    phaseOrder: ["T0", "T1", "T2", "T3"], phases,
    rollback: { order: ["T3", "T2", "T1", "T0"], insert: "delete_operation_owned_target", merge: "encrypted_before_image_cas_restore", quarantine: "no_target_write", skipApproved: "no_target_write", residualCount: 0, canonicalHash: "EXACT" },
    sealing: { algorithm: "canonical-json-sha256-v1", sealedPlanSha256: H("placeholder") },
    productionImport: "HOLD",
  };
  plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan);
  return { plan, payloadBundles };
}

function activatedContract(plan) {
  const contract = structuredClone(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT);
  contract.activation = { status: "PASS", allowedTargets: [{ ...structuredClone(plan.target), targetScopeSha256: plan.targetScope.scopeSha256 }], reasonCodes: [] };
  contract.productionImport = "READY";
  return contract;
}

function defaultDatabaseResult(sql, parameters = []) {
  if (sql.includes("UPDATE hr_yuzhou_production_import_record AS record") && sql.includes("RETURNING record.source_identity_sha256")) return { rows: JSON.parse(parameters[2]).map(row => ({ source_identity_sha256: row.source_identity_sha256 })) };
  if (/\bUPDATE\b[\s\S]+\bRETURNING\b/u.test(sql)) return { rows: [{}] };
  if (sql.includes("AS not_started_count")) return { rows: [{ not_started_count: 0, rolled_back_phase_count: 4, phase_count: 4, active_map_count: 0, succeeded_batch_count: 4, batch_count: 4 }] };
  return { rows: [] };
}

function mockDatabase(queryHandler = async (sql, parameters) => defaultDatabaseResult(sql, parameters)) {
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

function executionOptions(plan, payloadBundles, database = mockDatabase()) {
  return {
    contract: activatedContract(plan), now: NOW, currentCodeSha: plan.triple.codeSha, mergedCodeSha: plan.triple.codeSha,
    targetIdentitySha256: plan.target.identitySha256, targetScope: structuredClone(plan.targetScope), database, payloadBundles,
    phaseWriters: Object.fromEntries(plan.phases.map(phase => [phase.phase, async ({ targetScope, payloadBundle }) => ({
      payloadBundleArtifactSha256: phase.payloadBundleArtifactSha256,
      payloadBundleSha256: phase.payloadBundleSha256,
      canonicalizationVersion: phase.canonicalizationVersion,
      targetScopeSha256: targetScope.scopeSha256,
      afterCanonicalSha256: phase.expectedAfterCanonicalSha256,
      records: payloadBundle.records.map(row => {
        const planned = phase.records.find(record => record.sourceIdentitySha256 === row.sourceIdentitySha256);
        return { sourceIdentitySha256: row.sourceIdentitySha256, disposition: planned.disposition, targetId: planned.targetId, targetAfterSha256: planned.expectedTargetAfterSha256, targetVersionAfter: planned.targetVersionAfter };
      }),
    })])),
  };
}

const reseal = plan => { plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan); return plan; };
const findRecord = (plan, table) => plan.phases.flatMap(phase => phase.records).find(record => record.plannedTargetTable === table);

function withFactIdentity(plan) {
  const parent = createHeldPerformanceRelationsBinding({
    triple: plan.triple, relationPayloadArtifactSha256: H("performance-relations-payload"),
    identityDecisionArtifactSha256: H("performance-relations-decisions"),
    t0PhaseReceiptSha256: H("performance-relations-t0-receipt"),
  });
  const result = attachHeldPerformanceRelationsBinding(plan, parent);
  result.performanceFactLoader = {
    formatVersion: 1, bindingKind: "yuzhou_hr_production_import_performance_fact_loader_binding",
    triple: structuredClone(plan.triple), sourceRestoreReceiptSha256: H("restore"),
    sourceFactLocationReceiptSha256: parent.sourceFactLocationReceiptSha256,
    sourceFactLocationCanonicalSha256: parent.sourceFactLocationCanonicalSha256,
    factPayloadArtifactSha256: H("config-detail-artifact"), masterPayloadArtifactSha256: H("master-artifact"),
    t0PhaseReceiptSha256: parent.t0PhaseReceiptSha256,
    ...Object.fromEntries([300, 301, 302, 303, 310, 311].map(n => [`migration${n}Sha256`, H(`synthetic-migration-${n}`)])),
    templateRows: 1, levelRuleRows: 1, dimensionRows: 1, guideRows: 0,
    dimensionResultRows: 0, masterResultRows: 0, activeFactMaps: 3,
    identityFactSetSha256: productionImportHash("[]"), fullFactSetSha256: H("synthetic-full-facts"),
    sourceOutcomeFactStatus: "AUTHORITATIVE_EMPTY",
    forwardOrder: ["legacy_config_and_detail", "legacy_master"],
    rollbackOrder: ["master_result", "dimension_result", "dimension_level_guide", "dimension_profile", "level_rule", "template_profile"],
    productionImport: "HOLD",
  };
  result.performanceFactIdentity = {
    formatVersion: 1, bindingKind: "yuzhou_hr_production_import_performance_fact_identity_binding",
    triple: structuredClone(plan.triple), contractArtifactSha256: H("fact-contract"),
    t0PhaseReceiptSha256: parent.t0PhaseReceiptSha256,
    parentPerformanceRelationsContractSha256: computeProductionImportPayloadHash(parent),
    parentPerformanceFactLoaderContractSha256: computeProductionImportPayloadHash(result.performanceFactLoader),
    expectedDimensionRows: 0, expectedMasterRows: 0, expectedFactRows: 0,
    // SQL fact-set canonical bytes omit the newline used by sealed JSON payloads.
    expectedFactSetSha256: productionImportHash("[]"),
    migration308Sha256: "ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa",
    migration310Sha256: H("synthetic-migration-310"),
    factKinds: ["dimension_result", "master_result"],
    rollbackOrder: ["fact_identity", "performance_relations", "performance_facts"],
    adapterStatus: "PRODUCTION_CAPABILITY_BOUND", productionImport: "HOLD",
  };
  result.authorization.binding.performanceFactIdentityContractSha256 = computeProductionImportPayloadHash(result.performanceFactIdentity);
  result.authorization.binding.performanceFactLoaderContractSha256 = computeProductionImportPayloadHash(result.performanceFactLoader);
  return reseal(result);
}

test("fact identity seals stable parent inputs without a circular execution receipt dependency", () => {
  const plan = withFactIdentity(v2Fixture().plan);
  const validated = validateSealedProductionImportPlan(plan, { now: NOW });
  assert.deepEqual(validated.performanceFactIdentity, plan.performanceFactIdentity);
  assert.equal(validated.performanceFactIdentity.parentPerformanceRelationsContractSha256, computeProductionImportPayloadHash(plan.performanceRelations));
  assert.equal("parentRelationsReceiptSha256" in validated.performanceFactIdentity, false);
  assert.equal(computeSealedProductionImportPlanHash(plan), plan.sealing.sealedPlanSha256);
});

test("fact identity rejects parent, source, count, hash and rollback drift even after resealing", () => {
  const mutations = [
    p => { delete p.performanceFactLoader; },
    p => { p.performanceFactIdentity.parentPerformanceFactLoaderContractSha256 = H("other-loader"); },
    p => { p.performanceFactIdentity.triple.sourceSnapshotHash = H("other-source"); },
    p => { p.performanceFactIdentity.t0PhaseReceiptSha256 = H("other-t0"); },
    p => { p.performanceFactIdentity.parentPerformanceRelationsContractSha256 = H("other-parent"); },
    p => { p.performanceFactIdentity.expectedDimensionRows = 1; },
    p => { p.performanceFactIdentity.expectedMasterRows = -1; },
    p => { p.performanceFactIdentity.expectedFactRows = Number.MAX_SAFE_INTEGER + 1; },
    p => { p.performanceFactIdentity.expectedFactSetSha256 = H("nonempty"); },
    p => { p.performanceFactIdentity.expectedFactRows = p.performanceFactIdentity.expectedMasterRows = 1; },
    p => { p.performanceFactIdentity.migration308Sha256 = H("other-migration"); },
    p => { p.performanceFactIdentity.migration310Sha256 = null; },
    p => { p.performanceFactIdentity.rollbackOrder.reverse(); },
    p => { p.performanceFactIdentity.factKinds.reverse(); },
    p => { p.performanceFactIdentity.productionImport = "READY"; },
    p => { p.performanceFactIdentity.parentRelationsReceiptSha256 = H("circular-receipt"); },
  ];
  for (const mutate of mutations) {
    const plan = withFactIdentity(v2Fixture().plan);
    mutate(plan);
    plan.authorization.binding.performanceFactIdentityContractSha256 = computeProductionImportPayloadHash(plan.performanceFactIdentity);
    assert.throws(() => validateSealedProductionImportPlan(reseal(plan), { now: NOW }), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID");
  }
});

test("fact identity extension requires exact authorization binding and leaves old plans valid", () => {
  for (const mutation of [
    p => { delete p.authorization.binding.performanceFactIdentityContractSha256; },
    p => { p.authorization.binding.performanceFactIdentityContractSha256 = H("stale"); },
    p => { delete p.performanceFactIdentity; },
  ]) {
    const plan = withFactIdentity(v2Fixture().plan);
    mutation(plan);
    assert.throws(() => validateSealedProductionImportPlan(reseal(plan), { now: NOW }), error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH");
  }
  assert.equal(validateSealedProductionImportPlan(v2Fixture().plan, { now: NOW }).performanceFactIdentity, undefined);
});

test("an unwired fact identity extension cannot silently succeed or consume authorization", async () => {
  const fixture = v2Fixture();
  const plan = withFactIdentity(fixture.plan);
  const database = mockDatabase();
  const options = executionOptions(plan, fixture.payloadBundles, database);
  await assert.rejects(() => executeSealedProductionImport(plan, options), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_NOT_WIRED");
  await assert.rejects(() => rollbackSealedProductionImport(plan, {}, options), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_NOT_WIRED");
  assert.equal(database.calls.length, 0);
});

test("fact loader metadata rejects count, source classification, parent and authorization drift", () => {
  const mutations = [
    p => { p.performanceFactLoader.activeFactMaps++; },
    p => { p.performanceFactLoader.templateRows = -1; },
    p => { p.performanceFactLoader.dimensionRows = Number.MAX_SAFE_INTEGER; },
    p => { p.performanceFactLoader.sourceOutcomeFactStatus = "AUTHORITATIVE_NONEMPTY"; },
    p => { p.performanceFactLoader.identityFactSetSha256 = H("wrong-empty-set"); },
    p => { p.performanceFactLoader.sourceRestoreReceiptSha256 = null; },
    p => { p.performanceFactLoader.productionImport = "AUTHORIZED"; },
    p => { p.performanceFactLoader.rollbackOrder.reverse(); },
    p => { p.performanceFactLoader.sourceFactLocationReceiptSha256 = H("another-source"); },
    p => { p.performanceFactLoader.sourceFactLocationCanonicalSha256 = H("another-canonical"); },
    p => { delete p.performanceRelations; },
  ];
  for (const mutate of mutations) {
    const plan = withFactIdentity(v2Fixture().plan);
    mutate(plan);
    assert.throws(() => validateSealedProductionImportPlan(reseal(plan), { now: NOW }), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_BINDING_INVALID");
  }
  for (const mutate of [
    p => { delete p.authorization.binding.performanceFactLoaderContractSha256; },
    p => { p.authorization.binding.performanceFactLoaderContractSha256 = H("wrong-binding"); },
  ]) {
    const plan = withFactIdentity(v2Fixture().plan);
    mutate(plan);
    assert.throws(() => validateSealedProductionImportPlan(reseal(plan), { now: NOW }), error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH");
  }
});

test("direct identity validation cannot combine different source receipts behind a rehashed loader", () => {
  for (const key of ["sourceFactLocationReceiptSha256", "sourceFactLocationCanonicalSha256"]) {
    const plan = withFactIdentity(v2Fixture().plan);
    plan.performanceFactLoader[key] = H(`other-${key}`);
    plan.performanceFactIdentity.parentPerformanceFactLoaderContractSha256 = computeProductionImportPayloadHash(plan.performanceFactLoader);
    assert.throws(() => validateProductionPerformanceFactIdentityPlanBinding(plan.performanceFactIdentity, plan.triple, plan.performanceRelations, plan.performanceFactLoader), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID");
  }
});

test("synthetic nonempty loader and identity metadata must agree and does not claim source or runtime verification", () => {
  const plan = withFactIdentity(v2Fixture().plan);
  const loader = plan.performanceFactLoader;
  Object.assign(loader, { dimensionResultRows: 2, masterResultRows: 1, activeFactMaps: 6,
    identityFactSetSha256: H("synthetic-nonempty-identity-set"),
    fullFactSetSha256: H("synthetic-nonempty-full-set"), sourceOutcomeFactStatus: "AUTHORITATIVE_NONEMPTY" });
  Object.assign(plan.performanceFactIdentity, {
    expectedDimensionRows: 2, expectedMasterRows: 1, expectedFactRows: 3,
    expectedFactSetSha256: loader.identityFactSetSha256,
    parentPerformanceFactLoaderContractSha256: computeProductionImportPayloadHash(loader),
  });
  assert.deepEqual(validateProductionPerformanceFactLoaderPlanBinding(loader, plan.triple), loader);
  assert.deepEqual(validateProductionPerformanceFactIdentityPlanBinding(plan.performanceFactIdentity, plan.triple, plan.performanceRelations, loader), plan.performanceFactIdentity);
  plan.performanceFactIdentity.expectedDimensionRows = 1;
  plan.performanceFactIdentity.expectedMasterRows = 2;
  assert.throws(() => validateProductionPerformanceFactIdentityPlanBinding(plan.performanceFactIdentity, plan.triple, plan.performanceRelations, loader), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_BINDING_INVALID");
});

test("loader-only plans cannot bypass the incomplete execution guard", async () => {
  const fixture = v2Fixture();
  const plan = withFactIdentity(fixture.plan);
  delete plan.performanceFactIdentity;
  delete plan.authorization.binding.performanceFactIdentityContractSha256;
  reseal(plan);
  const database = mockDatabase();
  const options = executionOptions(plan, fixture.payloadBundles, database);
  await assert.rejects(() => executeSealedProductionImport(plan, options), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_NOT_WIRED");
  await assert.rejects(() => rollbackSealedProductionImport(plan, {}, options), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_NOT_WIRED");
  assert.equal(database.calls.length, 0);
});

function bindRuntimeReleaseEvidence(plan) {
  plan.runtimeReleaseEvidence = {
    artifactSha256: H("approved-runtime-receipt-bytes"),
    observedAt: "2026-08-28T23:55:00.000Z",
    expiresAt: plan.authorization.expiresAt,
  };
  plan.authorization.binding.runtimeReleaseEvidenceBindingSha256 = computeProductionImportPayloadHash(plan.runtimeReleaseEvidence);
  return reseal(plan);
}

test("external runtime receipt binds exact bytes and validity without changing the code SHA", () => {
  const { plan } = v2Fixture();
  const originalCode = plan.triple.codeSha;
  const originalSeal = plan.sealing.sealedPlanSha256;
  bindRuntimeReleaseEvidence(plan);
  assert.equal(validateSealedProductionImportPlan(plan, { now: NOW }).triple.codeSha, originalCode);
  assert.notEqual(plan.sealing.sealedPlanSha256, originalSeal);
  assert.deepEqual(validateSealedProductionImportPlan(v2Fixture().plan, { now: NOW }).runtimeReleaseEvidence, undefined);
});

test("runtime receipt cannot be swapped or removed under an existing authorization binding", () => {
  for (const mutate of [
    plan => { delete plan.authorization.binding.runtimeReleaseEvidenceBindingSha256; },
    plan => { plan.runtimeReleaseEvidence.artifactSha256 = H("replacement-receipt"); },
    plan => { plan.runtimeReleaseEvidence.observedAt = "2026-08-28T23:56:00.000Z"; },
    plan => { delete plan.runtimeReleaseEvidence; },
  ]) {
    const plan = bindRuntimeReleaseEvidence(v2Fixture().plan);
    mutate(plan);
    reseal(plan);
    assert.throws(() => validateSealedProductionImportPlan(plan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH");
  }
});

test("runtime observation rejects invalid, future, post-approval and expired intervals", () => {
  for (const override of [
    { observedAt: null }, { observedAt: "2026-02-30T00:00:00.000Z" },
    { observedAt: "2026-08-29" }, { observedAt: "2026-08-29T01:01:00.000Z" },
    { observedAt: "2026-08-29T00:31:00.000Z" },
    { expiresAt: NOW.toISOString() }, { expiresAt: "2026-08-29T01:31:00.000Z" },
    { artifactSha256: "not-a-hash" }, { artifactSha256: [H("array-hash")] }, { extra: true },
  ]) {
    const plan = bindRuntimeReleaseEvidence(v2Fixture().plan);
    Object.assign(plan.runtimeReleaseEvidence, override);
    plan.authorization.binding.runtimeReleaseEvidenceBindingSha256 = computeProductionImportPayloadHash(plan.runtimeReleaseEvidence);
    reseal(plan);
    assert.throws(() => validateSealedProductionImportPlan(plan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_INVALID");
  }
});

test("runtime receipt changes remain covered by the sealed plan hash", () => {
  const plan = bindRuntimeReleaseEvidence(v2Fixture().plan);
  plan.runtimeReleaseEvidence.artifactSha256 = H("replacement-receipt");
  plan.authorization.binding.runtimeReleaseEvidenceBindingSha256 = computeProductionImportPayloadHash(plan.runtimeReleaseEvidence);
  assert.throws(() => validateSealedProductionImportPlan(plan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_SEALED_PLAN_HASH_MISMATCH");
});

test("invalid runtime evidence fails before database access", async () => {
  const { plan, payloadBundles } = v2Fixture();
  bindRuntimeReleaseEvidence(plan);
  plan.runtimeReleaseEvidence.artifactSha256 = H("unapproved");
  reseal(plan);
  const database = mockDatabase();
  await assert.rejects(() => executeSealedProductionImport(plan, executionOptions(plan, payloadBundles, database)), error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH");
  assert.equal(database.calls.length, 0);
});

test("performance relation binding requires private artifacts before capability probe or authorization consumption", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const binding = createHeldPerformanceRelationsBinding({
    triple: plan.triple,
    relationPayloadArtifactSha256: H("performance-relations-payload"),
    identityDecisionArtifactSha256: H("performance-relations-decisions"),
    t0PhaseReceiptSha256: H("performance-relations-t0-receipt"),
  });
  const attached = attachHeldPerformanceRelationsBinding(plan, binding);
  assert.deepEqual(validateSealedProductionImportPlan(attached, { now: NOW }).performanceRelations, binding);
  assert.equal(attached.authorization.binding.performanceRelationsContractSha256, computeProductionImportPayloadHash(binding));

  const database = mockDatabase();
  await assert.rejects(
    () => executeSealedProductionImport(attached, executionOptions(attached, payloadBundles, database)),
    error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_ARTIFACT_INVALID",
  );
  assert.equal(database.calls.length, 0, "writer touched the database before validating sealed private artifacts");
});

test("production relation writer runs immediately after T0 only after the read-only schema capability passes", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const binding = createHeldPerformanceRelationsBinding({
    triple: plan.triple,
    relationPayloadArtifactSha256: H("performance-relations-payload"),
    identityDecisionArtifactSha256: H("performance-relations-decisions"),
    t0PhaseReceiptSha256: H("performance-relations-t0-receipt"),
  });
  const attached = attachHeldPerformanceRelationsBinding(plan, binding);
  const database = mockDatabase(async (sql, parameters) => {
    if (sql.includes("hr-prod-performance-relations:apply")) return { rows: [{
      status: "succeeded", replayed: false, session_rows: 7, score_source_rows: 0,
      assignment_rows: 117, active_relation_maps: 124, identity_resolution_rows: 234,
      session_binding_rows: 7, subject_unmatched_rows: 108, blank_assessor_rows: 117,
      receipt_sha256: H("performance-relation-receipt"),
    }] };
    return defaultDatabaseResult(sql, parameters);
  });
  const options = executionOptions(attached, payloadBundles, database);
  options.performanceRelations = {
    relationPayloadArtifact: Buffer.from("fixture:performance-relations-payload"),
    identityDecisionArtifact: Buffer.from("fixture:performance-relations-decisions"),
    readOnlyQuery: async () => ({ rows: [{
      capability_id: "jinhu-yuzhou-performance-relations-production-v1",
      migration_305_sha256: binding.migration305Sha256,
      migration_306_sha256: binding.migration306Sha256,
      production_context_supported: true,
      reverse_order: "identity_resolution>source_person_assignments",
    }] }),
  };
  const receipt = await executeSealedProductionImport(attached, options);
  assert.deepEqual(receipt.phases, ["T0", "PERFORMANCE_RELATIONS", "T1", "T2", "T3"]);
  assert.deepEqual(receipt.databaseReceiptSha256ByDomain, { PERFORMANCE_RELATIONS: H("performance-relation-receipt") });
  const businessQueries = database.calls.filter(call => call.kind === "query").map(call => call.sql);
  const t0Finished = businessQueries.findIndex(sql => sql.includes("phase=$2") && sql.includes("status='succeeded'"));
  const relationApplied = businessQueries.findIndex(sql => sql.includes("hr-prod-performance-relations:apply"));
  const t1Started = businessQueries.findIndex((sql, index) => index > relationApplied && sql.includes("INSERT INTO hr_yuzhou_production_import_phase"));
  assert.ok(t0Finished >= 0 && relationApplied > t0Finished && t1Started > relationApplied);
});

test("performance relation binding cannot be appended outside the sealed authorization", () => {
  const { plan } = v2Fixture();
  plan.performanceRelations = createHeldPerformanceRelationsBinding({
    triple: plan.triple,
    relationPayloadArtifactSha256: H("performance-relations-payload"),
    identityDecisionArtifactSha256: H("performance-relations-decisions"),
    t0PhaseReceiptSha256: H("performance-relations-t0-receipt"),
  });
  reseal(plan);
  assert.throws(
    () => validateSealedProductionImportPlan(plan, { now: NOW }),
    error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH",
  );
});

test("an optional T5 nonfile binding is sealed into the same production authorization without exposing payload values", () => {
  const { plan } = v2Fixture();
  plan.t5Nonfile = {
    privateStageSha256: H("t5-private-stage"), sourceSnapshotSha256: plan.triple.sourceSnapshotHash,
    sourceRestoreReceiptSha256: H("t5-restore"), sourceBusinessSha256: H("t5-business"),
    t0DecisionArtifactSha256: H("t0-decisions"),
    t0TargetIdentitySha256: plan.target.identitySha256, t0TargetScopeSha256: plan.targetScope.scopeSha256,
    recordCount: 7752, actorId: uuid(99),
  };
  plan.authorization.binding.t5NonfilePrivateStageSha256 = plan.t5Nonfile.privateStageSha256;
  plan.rollback.order = ["T5", "T3", "T2", "T1", "T0"];
  reseal(plan);
  assert.deepEqual(validateSealedProductionImportPlan(plan, { now: NOW }).t5Nonfile, plan.t5Nonfile);
  const unbound = structuredClone(plan);
  delete unbound.authorization.binding.t5NonfilePrivateStageSha256;
  reseal(unbound);
  assert.throws(() => validateSealedProductionImportPlan(unbound, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH");
  const drift = structuredClone(plan);
  drift.t5Nonfile.sourceSnapshotSha256 = H("other-source");
  reseal(drift);
  assert.throws(() => validateSealedProductionImportPlan(drift, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_T5_NONFILE_PLAN_INVALID");
});

test("a sealed T5 private stage joins the T0-T3 transaction only after its exact hash binding is verified", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const employeeSource = H("t5-employee");
  const t5Source = H("t5-skill");
  const stage = {
    formatVersion: 1, artifactKind: "yuzhou_hr_production_import_t5_nonfile_private_payload_stage", phase: "T5",
    triple: structuredClone(plan.triple), sourceSnapshotHash: plan.triple.sourceSnapshotHash,
    sourceRestoreReceiptSha256: H("t5-restore"), sourceBusinessSha256: H("t5-business"), mappingContractSha256: plan.triple.mappingContractHash, t0DecisionArtifactSha256: H("t0-decisions"), t0TargetIdentitySha256: plan.target.identitySha256, t0TargetScopeSha256: plan.targetScope.scopeSha256, productionImport: "HOLD",
    records: [{
      sourceSystem: "yuzhou-v10", sourceTable: "dbo.knowhow", sourcePkCanonical: `sha256:${t5Source}`,
      sourceIdentitySha256: t5Source, sourceRowSha256: H("t5-row"), targetTable: "hr_employee_skill", dependencyMode: "employee",
      dependencyRefs: [{ role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employeeSource }],
      disposition: "insert", payload: { skill_name: "synthetic", proficiency: null, legacy_grade: null, note: null, legacy_source_identity_sha256: t5Source, legacy_source_row_sha256: H("t5-row") },
    }],
  };
  plan.t5Nonfile = {
    privateStageSha256: computeProductionImportPayloadHash(stage), sourceSnapshotSha256: plan.triple.sourceSnapshotHash,
    sourceRestoreReceiptSha256: stage.sourceRestoreReceiptSha256, sourceBusinessSha256: stage.sourceBusinessSha256,
    t0DecisionArtifactSha256: stage.t0DecisionArtifactSha256,
    t0TargetIdentitySha256: stage.t0TargetIdentitySha256, t0TargetScopeSha256: stage.t0TargetScopeSha256,
    recordCount: stage.records.length, actorId: uuid(98),
  };
  plan.authorization.binding.t5NonfilePrivateStageSha256 = plan.t5Nonfile.privateStageSha256;
  plan.rollback.order = ["T5", "T3", "T2", "T1", "T0"];
  reseal(plan);
  const database = mockDatabase(async (sql, parameters) => {
    if (sql.includes("assert-writer-context")) return { rows: [{ authorized: true }] };
    if (sql.includes("resolve-employees")) return { rows: [{ source_identity_sha256: employeeSource, employee_id: uuid(97) }] };
    if (sql.includes("hr-prod-t5:create-batch")) return { rows: [{ id: uuid(96) }] };
    if (sql.includes("hr-prod-t5:insert:hr_employee_skill")) return { rows: [{ id: uuid(95), legacy_source_identity_sha256: t5Source }] };
    if (sql.includes("hr-prod-t5:insert-maps")) return { rows: [{ source_identity_sha256: t5Source }] };
    if (sql.includes("hr-prod-t5:finish-batch")) return { rows: [{ id: uuid(96) }] };
    if (sql.includes("readback-projection")) return { rows: [{ source_identity_sha256: t5Source, source_row_sha256: H("t5-row"), target_table: "hr_employee_skill", target_id: uuid(95), mapping_status: "loaded", target_tenant_id: plan.targetScope.tenantId, target_park_id: plan.targetScope.parkId, target_source_identity_sha256: t5Source, target_source_row_sha256: H("t5-row"), target_safe_payload: null }] };
    return defaultDatabaseResult(sql, parameters);
  });
  const result = await executeSealedProductionImport(plan, { ...executionOptions(plan, payloadBundles, database), t5NonfilePrivateStage: stage });
  assert.deepEqual(result.phases, ["T0", "T1", "T2", "T3", "T5"]);
  assert.deepEqual(database.calls.filter(call => call.kind === "transaction").map(call => call.options.purpose), ["consume_import_authorization", "apply_t0_t5"]);
  assert.equal(database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_phase")).length, 5);
  assert.ok(database.calls.some(call => call.sql?.includes("hr-prod-t5:create-batch")));
  assert.ok(database.calls.some(call => call.sql?.includes("hr_yuzhou_production_import_projection_receipt")));
  const controlInsert = database.calls.find(call => call.sql?.includes("owner_source_identity_sha256") && call.parameters?.[0] && JSON.parse(call.parameters[0])[0]?.phase === "T5");
  assert.ok(controlInsert);
  const t5ControlRows = JSON.parse(controlInsert.parameters[0]);
  assert.equal(t5ControlRows[0].phase, "T5");
  assert.equal(t5ControlRows[0].owner_source_identity_sha256, null);
  const dependencyInsert = database.calls.find(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_record_dependency")
    && call.parameters?.[0]
    && JSON.parse(call.parameters[0])[0]?.phase === "T5");
  assert.ok(dependencyInsert);
  assert.deepEqual(JSON.parse(dependencyInsert.parameters[0]), [{
    operation_id: plan.operationId,
    phase: "T5",
    source_identity_sha256: t5Source,
    dependency_role: "employee",
    depends_on_phase: "T0",
    depends_on_source_identity_sha256: employeeSource,
    expected_target_table: "hr_employee",
  }]);
});

test("v2 repository contract is HOLD with an empty production target allowlist", () => {
  assert.equal(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.formatVersion, 2);
  assert.equal(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.activation.status, "HOLD");
  assert.deepEqual(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.activation.allowedTargets, []);
  assert.equal(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.productionImport, "HOLD");
  const targetTables = Object.values(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.targetTables).flat().sort();
  assert.deepEqual(Object.keys(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.targetTableRules).sort(), targetTables);
  const migration = readFileSync(resolve(ROOT, "database/migrations/000281_hr_yuzhou_production_import_control_v2.sql"), "utf8");
  assert.match(migration, /trg_hr_yuzhou_prod_v2_operation_scope/u);
  assert.match(migration, /HR_PRODUCTION_IMPORT_TARGET_SCOPE_IMMUTABLE/u);
  assert.match(migration, /trg_hr_yuzhou_prod_v2_dependency_parent/u);
  assert.match(migration, /REVOKE ALL ON FUNCTION hr_yuzhou_consume_import_authorization_v2/u);
  const writer = readFileSync(resolve(ROOT, "scripts/hr-cutover/production-import-writer.mjs"), "utf8");
  assert.match(writer, /const resultBySourceIdentity = new Map/u);
  assert.doesNotMatch(writer, /result\.records\.find\(/u, "control receipt lookup must remain O(n), not O(n squared)");
  const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
  const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  assert.match(ci, /pnpm test:e2e:yuzhou-production-import-preflight/u);
  assert.match(ci, /pnpm test:e2e:yuzhou-production-import-v2(?:\s|$)/u);
  assert.match(ci, /pnpm test:e2e:yuzhou-production-import-t5-private-stage/u);
  assert.equal(
    packageJson.scripts["test:e2e:yuzhou-production-import-t5-private-stage"],
    "pnpm test:e2e:yuzhou-production-import-t5-nonfile",
  );
  assert.match(ci, /pnpm test:e2e:yuzhou-production-import-v2:pg/u);
  assert.match(ci, /jinhu_hr_migration_lab_ci_\$\{GITHUB_RUN_ID\}/u);
  for (const path of [".github/workflows/deploy-production.yml", "scripts/prod-deploy.sh", "scripts/db-seed-prod.sh", "scripts/hr-cutover/full-domain-lifecycle.sh"]) {
    assert.doesNotMatch(readFileSync(resolve(ROOT, path), "utf8"), /production-import-writer|production-import-execution-v2/u);
  }
});

test("scope hash and all four payload bundles are byte/hash/plan bound", () => {
  const { plan, payloadBundles } = v2Fixture();
  assert.equal(validateSealedProductionImportPlan(plan, { now: NOW }).targetScope.scopeSha256, TARGET_SCOPE.scopeSha256);
  for (const phase of plan.phases) {
    const bundle = JSON.parse(payloadBundles[phase.phase]);
    assert.equal(validateProductionImportPayloadBundle(bundle, { phase: phase.phase, targetScope: plan.targetScope, sourceBatchManifestSha256: phase.sourceBatchManifestSha256 }).records.length, phase.records.length);
    assert.equal(productionImportHash(payloadBundles[phase.phase]), phase.payloadBundleArtifactSha256);
    assert.equal(computeProductionImportPayloadBundleHash(bundle), phase.payloadBundleSha256);
  }
  const unsafe = JSON.parse(payloadBundles.T3);
  unsafe.records[0].payload.decimalMoney = 0.1;
  unsafe.records[0].payloadSha256 = computeProductionImportPayloadHash(unsafe.records[0].payload);
  assert.throws(() => validateProductionImportPayloadBundle(unsafe, { phase: "T3", targetScope: plan.targetScope, sourceBatchManifestSha256: plan.phases[3].sourceBatchManifestSha256 }), error => error.code === "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID");
  delete unsafe.records[0].payload.decimalMoney;
  unsafe.records[0].payload.legacyPassword = "must-not-enter-a-payload";
  unsafe.records[0].payloadSha256 = computeProductionImportPayloadHash(unsafe.records[0].payload);
  assert.throws(() => validateProductionImportPayloadBundle(unsafe, { phase: "T3", targetScope: plan.targetScope, sourceBatchManifestSha256: plan.phases[3].sourceBatchManifestSha256 }), error => error.code === "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID");
});

test("global records stay scope-owned while employee and parent graphs use exact typed record refs", () => {
  const { plan } = v2Fixture();
  for (const table of ["sys_org", "hr_contract_type", "hr_attendance_import_batch", "hr_attendance_symbol_rule", "hr_insurance_policy"]) {
    assert.equal(findRecord(plan, table).dependencyMode, "scope");
    assert.deepEqual(findRecord(plan, table).dependencyRefs, []);
  }
  assert.deepEqual(findRecord(plan, "hr_employment_event").dependencyRefs.map(row => [row.role, row.phase, row.expectedTargetTable]), [["employee", "T0", "hr_employee"]]);
  assert.deepEqual(findRecord(plan, "hr_contract").dependencyRefs.map(row => row.expectedTargetTable).sort(), ["hr_contract_type", "hr_employee"]);
  assert.deepEqual(findRecord(plan, "hr_employee_insurance_item").dependencyRefs.map(row => row.expectedTargetTable), ["hr_employee_insurance_period"]);
});

test("an employee-owned record cannot escape to scope or name matching", () => {
  const { plan } = v2Fixture();
  const event = findRecord(plan, "hr_employment_event");
  event.dependencyMode = "scope";
  event.dependencyRefs = [];
  reseal(plan);
  assert.throws(() => validateSealedProductionImportPlan(plan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_DEPENDENCY_INVALID");
  const { plan: namePlan } = v2Fixture();
  const contract = structuredClone(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT);
  contract.identityResolution.nameMatching = true;
  assert.throws(() => validateSealedProductionImportPlan(namePlan, { contract, now: NOW }), error => error.code === "PRODUCTION_IMPORT_EXECUTION_CONTRACT_INVALID");
});

test("parent table, phase, missing required role, cycle and active dependency state fail closed", () => {
  const cases = [
    plan => { findRecord(plan, "hr_contract_change").dependencyRefs[0].expectedTargetTable = "hr_employee"; },
    plan => { findRecord(plan, "hr_contract").dependencyRefs = findRecord(plan, "hr_contract").dependencyRefs.filter(row => row.role !== "contract_type"); },
    plan => { findRecord(plan, "hr_position").dependencyRefs[0] = ref("org", findRecord(plan, "hr_position")); },
    plan => { const org = findRecord(plan, "sys_org"); org.dependencyMode = "record_graph"; org.dependencyRefs = [ref("parent_org", findRecord(plan, "hr_position"))]; },
    plan => { const employee = findRecord(plan, "hr_employee"); employee.disposition = "quarantine"; for (const key of ["targetTable", "targetId", "businessIdentitySha256", "expectedTargetAfterSha256", "targetVersionAfter"]) delete employee[key]; employee.decisionAttestationSha256 = H("quarantine-decision"); employee.quarantine = { reasonCode: "OWNER_MAPPING_UNRESOLVED", algorithm: "aes-256-gcm-external-kek-v1", payloadCiphertextSha256: H("ciphertext"), keyReferenceSha256: H("key") }; },
  ];
  for (const mutate of cases) {
    const { plan } = v2Fixture();
    mutate(plan);
    reseal(plan);
    assert.throws(() => validateSealedProductionImportPlan(plan, { now: NOW }), error => error instanceof ProductionImportExecutionError);
  }
  const { plan: duplicateTargetPlan } = v2Fixture();
  const duplicateTarget = structuredClone(findRecord(duplicateTargetPlan, "hr_contract_type"));
  duplicateTarget.sourceIdentitySha256 = H("duplicate-target:identity");
  duplicateTarget.sourcePkCanonical = `sha256:${duplicateTarget.sourceIdentitySha256}`;
  duplicateTarget.sourceRowSha256 = H("duplicate-target:row");
  duplicateTarget.payloadSha256 = H("duplicate-target:payload");
  duplicateTargetPlan.phases[2].records.push(duplicateTarget);
  reseal(duplicateTargetPlan);
  assert.throws(() => validateSealedProductionImportPlan(duplicateTargetPlan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_TARGET_MAP_DUPLICATE");
  const { plan: reversedGraphPlan } = v2Fixture();
  const t2Records = reversedGraphPlan.phases[2].records;
  [t2Records[0], t2Records[1]] = [t2Records[1], t2Records[0]];
  reseal(reversedGraphPlan);
  assert.throws(() => validateSealedProductionImportPlan(reversedGraphPlan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_DEPENDENCY_SEQUENCE_INVALID");
});

test("merge keeps encrypted before-image tied to the exact CAS precondition", () => {
  const { plan } = v2Fixture();
  const row = findRecord(plan, "hr_contract");
  row.disposition = "merge";
  row.expectedTargetBeforeSha256 = H("contract:before");
  row.expectedTargetVersionBefore = 1;
  row.targetVersionAfter = 2;
  row.decisionAttestationSha256 = H("contract:merge-decision");
  row.beforeImage = { algorithm: "aes-256-gcm-external-kek-v1", plaintextSha256: row.expectedTargetBeforeSha256, ciphertextSha256: H("contract:ciphertext"), keyReferenceSha256: H("contract:key") };
  reseal(plan);
  assert.doesNotThrow(() => validateSealedProductionImportPlan(plan, { now: NOW }));
  row.beforeImage.plaintextSha256 = H("wrong-before");
  reseal(plan);
  assert.throws(() => validateSealedProductionImportPlan(plan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_CAS_PRECONDITION_REQUIRED");
});

test("quarantine retains planned target table without claiming an actual target", () => {
  const { plan } = v2Fixture();
  const row = findRecord(plan, "hr_contract_legacy_evidence");
  row.disposition = "quarantine";
  for (const key of ["targetTable", "targetId", "businessIdentitySha256", "expectedTargetAfterSha256", "targetVersionAfter"]) delete row[key];
  row.decisionAttestationSha256 = H("quarantine-decision");
  row.quarantine = { reasonCode: "SOURCE_FILE_MISSING", algorithm: "aes-256-gcm-external-kek-v1", payloadCiphertextSha256: H("ciphertext"), keyReferenceSha256: H("key") };
  reseal(plan);
  assert.doesNotThrow(() => validateSealedProductionImportPlan(plan, { now: NOW }));
  assert.equal(row.plannedTargetTable, "hr_contract_legacy_evidence");
  assert.equal(row.targetTable, undefined);
});

test("target scope and authorization scope are inseparable", () => {
  const { plan } = v2Fixture();
  plan.targetScope.parkId = "another-park";
  reseal(plan);
  assert.throws(() => validateSealedProductionImportPlan(plan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_TARGET_SCOPE_HASH_MISMATCH");
  const { plan: bindingPlan } = v2Fixture();
  bindingPlan.authorization.binding.targetScopeSha256 = H("other-scope");
  reseal(bindingPlan);
  assert.throws(() => validateSealedProductionImportPlan(bindingPlan, { now: NOW }), error => error.code === "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH");
});

test("writer rejects raw and canonical payload tampering before authorization consumption", async () => {
  const raw = v2Fixture();
  raw.payloadBundles.T1 = Buffer.concat([raw.payloadBundles.T1, Buffer.from(" ")]);
  const rawDatabase = mockDatabase();
  await assert.rejects(executeSealedProductionImport(raw.plan, executionOptions(raw.plan, raw.payloadBundles, rawDatabase)), error => error.code === "PRODUCTION_IMPORT_PAYLOAD_ARTIFACT_HASH_MISMATCH");
  assert.equal(rawDatabase.calls.length, 0);

  const canonical = v2Fixture();
  const bundle = JSON.parse(canonical.payloadBundles.T1);
  bundle.records[0].payload = { ...bundle.records[0].payload, changed: true };
  bundle.records[0].payloadSha256 = computeProductionImportPayloadHash(bundle.records[0].payload);
  canonical.payloadBundles.T1 = Buffer.from(JSON.stringify(bundle));
  canonical.plan.phases[1].payloadBundleArtifactSha256 = productionImportHash(canonical.payloadBundles.T1);
  reseal(canonical.plan);
  const canonicalDatabase = mockDatabase();
  await assert.rejects(executeSealedProductionImport(canonical.plan, executionOptions(canonical.plan, canonical.payloadBundles, canonicalDatabase)), error => error.code === "PRODUCTION_IMPORT_PAYLOAD_BUNDLE_HASH_MISMATCH");
  assert.equal(canonicalDatabase.calls.length, 0);
});

test("activated simulation consumes v2 scope and writes payload/dependency receipts in SERIALIZABLE transactions", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const database = mockDatabase();
  const result = await executeSealedProductionImport(plan, executionOptions(plan, payloadBundles, database));
  assert.equal(result.status, "succeeded");
  assert.deepEqual(database.calls.filter(call => call.kind === "transaction").map(call => call.options.purpose), ["consume_import_authorization", "apply_t0_t5"]);
  const consume = database.calls.find(call => call.sql?.includes("hr_yuzhou_consume_import_authorization_v2"));
  assert(consume);
  assert.deepEqual(consume.parameters.slice(6, 9), [plan.targetScope.tenantId, plan.targetScope.parkId, plan.targetScope.scopeSha256]);
  assert.equal(database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_phase")).length, 4);
  const recordInserts = database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_record("));
  const recordRows = recordInserts.flatMap(call => JSON.parse(call.parameters[0]));
  assert.equal(recordInserts.length, 4, "small fixture emits one bulk control insert per phase");
  assert.equal(recordRows.length, plan.phases.flatMap(phase => phase.records).length);
  assert(recordInserts.every(call => call.sql.includes("jsonb_to_recordset") && call.sql.includes("business_identity_sha256")));
  assert(recordRows.every(row => row.source_system === "yuzhou-v10" && /^dbo\./u.test(row.source_table) && row.source_pk_canonical === `sha256:${row.source_identity_sha256}` && typeof row.planned_target_table === "string" && /^[0-9a-f]{64}$/u.test(row.business_identity_sha256) && row.target_version_after === 1));
  const dependencyInserts = database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_record_dependency"));
  assert(dependencyInserts.every(call => call.sql.includes("jsonb_to_recordset")));
  assert.equal(dependencyInserts.flatMap(call => JSON.parse(call.parameters[0])).length, plan.phases.flatMap(phase => phase.records).reduce((count, row) => count + row.dependencyRefs.length, 0));
});

test("control receipts are bulk inserted in bounded 1000-row batches", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const phase = plan.phases[0];
  const bundle = JSON.parse(payloadBundles.T0);
  for (let index = 0; index < 1000; index += 1) {
    const generated = record(`bulk-org-${index}`, "T0", "sys_org", "scope");
    const payload = generated.payload;
    const planned = structuredClone(generated);
    delete planned.phase;
    delete planned.payload;
    phase.records.push(planned);
    bundle.records.push({ sourceIdentitySha256: planned.sourceIdentitySha256, sourceRowSha256: planned.sourceRowSha256, targetTable: planned.plannedTargetTable, payloadSha256: planned.payloadSha256, payload });
  }
  payloadBundles.T0 = Buffer.from(JSON.stringify(bundle));
  phase.payloadBundleArtifactSha256 = productionImportHash(payloadBundles.T0);
  phase.payloadBundleSha256 = computeProductionImportPayloadBundleHash(bundle);
  reseal(plan);
  const database = mockDatabase();
  await executeSealedProductionImport(plan, executionOptions(plan, payloadBundles, database));
  const inserts = database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_record("));
  const sizes = inserts.map(call => JSON.parse(call.parameters[0]).length);
  assert.equal(sizes.reduce((sum, size) => sum + size, 0), 1016);
  assert.ok(sizes.every(size => size >= 1 && size <= 1000));
  assert.equal(sizes.filter(size => size === 1000).length, 1);
});

test("consumed import authorization survives an independently recorded business failure", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const database = mockDatabase();
  const options = executionOptions(plan, payloadBundles, database);
  options.phaseWriters.T1 = async () => { throw new Error("simulated business failure"); };
  await assert.rejects(executeSealedProductionImport(plan, options), /simulated business failure/u);
  assert.deepEqual(database.calls.filter(call => call.kind === "transaction").map(call => call.options.purpose), ["consume_import_authorization", "apply_t0_t5", "record_import_failure"]);
  const consumeIndex = database.calls.findIndex(call => call.sql?.includes("consume_import_authorization_v2"));
  const failureIndex = database.calls.findIndex(call => call.sql?.includes("failure_code"));
  assert(consumeIndex >= 0 && failureIndex > consumeIndex);
});

test("every critical writer state transition fails closed when its UPDATE affects no row", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const database = mockDatabase(async (sql, parameters) => {
    if (sql.includes("UPDATE hr_yuzhou_production_import_phase SET status='succeeded'")) return { rows: [] };
    return defaultDatabaseResult(sql, parameters);
  });
  await assert.rejects(executeSealedProductionImport(plan, executionOptions(plan, payloadBundles, database)), error => error.code === "PRODUCTION_IMPORT_STATE_TRANSITION_FAILED");
  assert(database.calls.some(call => call.sql?.includes("RETURNING operation_id,status")), "failure state UPDATE must also be checked with RETURNING");
});

test("wrong runtime scope and missing payloads are rejected before opening a transaction", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const database = mockDatabase();
  const wrongScopeOptions = executionOptions(plan, payloadBundles, database);
  wrongScopeOptions.targetScope.parkId = "other";
  await assert.rejects(executeSealedProductionImport(plan, wrongScopeOptions), error => error.code === "PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH");
  assert.equal(database.calls.length, 0);
  const missingPayloadOptions = executionOptions(plan, payloadBundles, database);
  delete missingPayloadOptions.payloadBundles.T2;
  await assert.rejects(executeSealedProductionImport(plan, missingPayloadOptions), error => error.code === "PRODUCTION_IMPORT_WRITER_RESULT_INVALID");
  assert.equal(database.calls.length, 0);
  const stalePlan = v2Fixture();
  const staleOptions = executionOptions(stalePlan.plan, stalePlan.payloadBundles, database);
  staleOptions.now = new Date("2026-08-29T01:30:00.000Z");
  await assert.rejects(executeSealedProductionImport(stalePlan.plan, staleOptions), error => error.code === "PRODUCTION_IMPORT_AUTH_STALE");
  assert.equal(database.calls.length, 0);
});

test("rollback remains independently authorized and scope bound", async () => {
  const { plan } = v2Fixture();
  const database = mockDatabase(async (sql, parameters) => {
    if (sql.startsWith("SELECT status")) return { rows: [{ status: "succeeded", sealed_plan_sha256: plan.sealing.sealedPlanSha256 }] };
    return defaultDatabaseResult(sql, parameters);
  });
  const authorization = {
    formatVersion: 1, artifactKind: "yuzhou_hr_production_import_rollback_authorization", intent: "production_import_rollback",
    rollbackOperationId: "yzprod-rollback-20260829T020000Z-abcdef123456", importOperationId: plan.operationId,
    sealedPlanSha256: plan.sealing.sealedPlanSha256, targetIdentitySha256: plan.target.identitySha256,
    authorizationArtifactSha256: H("rollback-authorization"), authorizationNonceSha256: H("rollback-nonce"),
    issuedAt: "2026-08-29T00:30:00.000Z", expiresAt: "2026-08-29T01:30:00.000Z", productionImport: "HOLD",
  };
  const result = await rollbackSealedProductionImport(plan, authorization, {
    contract: activatedContract(plan), now: NOW, currentCodeSha: plan.triple.codeSha, mergedCodeSha: plan.triple.codeSha,
    targetIdentitySha256: plan.target.identitySha256, targetScope: plan.targetScope, database,
    rollbackPhase: async ({ records }) => records.map(planned => ({ sourceIdentitySha256: planned.sourceIdentitySha256, rollbackStatus: "deleted_insert" })),
    verifyBusinessResiduals: async ({ operationId, targetScope }) => ({ operationId, targetScopeSha256: targetScope.scopeSha256, residualCount: 0, evidenceSha256: H("business-residual") }),
  });
  assert.equal(result.residualCount, 0);
  assert.equal(result.businessResidualEvidenceSha256, H("business-residual"));
  assert.deepEqual(database.calls.filter(call => call.sql?.includes("SET status='rolling_back'")).map(call => call.parameters[1]), ["T3", "T2", "T1", "T0"]);
  const finalResidualQuery = database.calls.find(call => call.sql?.includes("AS not_started_count"));
  assert(finalResidualQuery?.sql.includes("status='succeeded') AS succeeded_batch_count"), "apply migration batches remain immutable succeeded history and must be explicitly verified");
  assert.equal(database.calls.some(call => /^UPDATE migration_batch/u.test(call.sql ?? "")), false, "rollback must not rewrite immutable apply-batch history");

  const reused = { ...authorization, authorizationArtifactSha256: plan.authorization.artifactSha256 };
  const untouchedDatabase = mockDatabase();
  await assert.rejects(rollbackSealedProductionImport(plan, reused, {
    contract: activatedContract(plan), now: NOW, currentCodeSha: plan.triple.codeSha, mergedCodeSha: plan.triple.codeSha,
    targetIdentitySha256: plan.target.identitySha256, targetScope: plan.targetScope, database: untouchedDatabase, rollbackPhase: async () => [], verifyBusinessResiduals: async () => ({}),
  }), error => error.code === "PRODUCTION_IMPORT_ROLLBACK_AUTH_REUSED");
  assert.equal(untouchedDatabase.calls.length, 0);
});

test("performance relation rollback runs identity then relations after T1 and before T0", async () => {
  const { plan } = v2Fixture();
  const binding = createHeldPerformanceRelationsBinding({
    triple: plan.triple, relationPayloadArtifactSha256: H("performance-relations-payload"),
    identityDecisionArtifactSha256: H("performance-relations-decisions"),
    t0PhaseReceiptSha256: H("performance-relations-t0-receipt"),
  });
  const attached = attachHeldPerformanceRelationsBinding(plan, binding);
  const database = mockDatabase(async (sql, parameters) => {
    if (sql.startsWith("SELECT status")) return { rows: [{ status: "succeeded", sealed_plan_sha256: attached.sealing.sealedPlanSha256 }] };
    if (sql.includes("hr-prod-performance-relations:rollback-identity-then-relations")) return { rows: [{ status: "rolled_back", rollback_order: "identity_resolution>source_person_assignments", residual_count: 0, replayed: false, receipt_sha256: H("performance-relations-rollback") }] };
    return defaultDatabaseResult(sql, parameters);
  });
  const authorization = {
    formatVersion: 1, artifactKind: "yuzhou_hr_production_import_rollback_authorization", intent: "production_import_rollback",
    rollbackOperationId: "yzprod-rollback-20260829T020000Z-abcdef123456", importOperationId: attached.operationId,
    sealedPlanSha256: attached.sealing.sealedPlanSha256, targetIdentitySha256: attached.target.identitySha256,
    authorizationArtifactSha256: H("performance-rollback-authorization"), authorizationNonceSha256: H("performance-rollback-nonce"),
    issuedAt: "2026-08-29T00:30:00.000Z", expiresAt: "2026-08-29T01:30:00.000Z", productionImport: "HOLD",
  };
  await rollbackSealedProductionImport(attached, authorization, {
    contract: activatedContract(attached), now: NOW, currentCodeSha: attached.triple.codeSha, mergedCodeSha: attached.triple.codeSha,
    targetIdentitySha256: attached.target.identitySha256, targetScope: attached.targetScope, database,
    performanceRelations: { readOnlyQuery: async () => ({ rows: [{ capability_id: "jinhu-yuzhou-performance-relations-production-v1", migration_305_sha256: binding.migration305Sha256, migration_306_sha256: binding.migration306Sha256, production_context_supported: true, reverse_order: "identity_resolution>source_person_assignments" }] }) },
    rollbackPhase: async ({ records }) => records.map(record => ({ sourceIdentitySha256: record.sourceIdentitySha256, rollbackStatus: "deleted_insert" })),
    verifyBusinessResiduals: async ({ operationId, targetScope }) => ({ operationId, targetScopeSha256: targetScope.scopeSha256, residualCount: 0, evidenceSha256: H("performance-business-residual") }),
  });
  const queries = database.calls.filter(call => call.kind === "query");
  const relationRollback = queries.findIndex(call => call.sql.includes("hr-prod-performance-relations:rollback-identity-then-relations"));
  const t1Rollback = queries.findIndex(call => call.sql.includes("status='rolling_back'") && call.parameters?.[1] === "T1");
  const t0Rollback = queries.findIndex((call, index) => index > relationRollback && call.sql.includes("status='rolling_back'") && call.parameters?.[1] === "T0");
  assert.ok(t1Rollback >= 0 && relationRollback > t1Rollback && t0Rollback > relationRollback);
});

test("a T5-bound plan rolls T5 back before the core phases and accounts for its owned batch", async () => {
  const { plan } = v2Fixture();
  plan.t5Nonfile = {
    privateStageSha256: H("t5-private-stage"), sourceSnapshotSha256: plan.triple.sourceSnapshotHash,
    sourceRestoreReceiptSha256: H("t5-restore"), sourceBusinessSha256: H("t5-business"), t0DecisionArtifactSha256: H("t0-decisions"), t0TargetIdentitySha256: plan.target.identitySha256, t0TargetScopeSha256: plan.targetScope.scopeSha256, recordCount: 1, actorId: uuid(94),
  };
  plan.authorization.binding.t5NonfilePrivateStageSha256 = plan.t5Nonfile.privateStageSha256;
  plan.rollback.order = ["T5", "T3", "T2", "T1", "T0"];
  reseal(plan);
  const t5BatchId = uuid(93);
  const database = mockDatabase(async (sql, parameters) => {
    if (sql.startsWith("SELECT status")) return { rows: [{ status: "succeeded", sealed_plan_sha256: plan.sealing.sealedPlanSha256 }] };
    if (sql.includes("bind-rollback-context")) return { rows: [{ batch_id: t5BatchId, run_id: `${plan.operationId}-t5` }] };
    if (sql.includes("rollback-map-counts")) return { rows: [] };
    if (sql.includes("rollback-target-residual:")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-deactivate-maps")) return { rows: [] };
    if (sql.includes("rollback-residual")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-finish-batch")) return { rows: [{ id: t5BatchId }] };
    if (sql.includes("WHERE operation_id=$1 AND phase='T5' AND rollback_status='not_started'")) return { rows: [{ source_identity_sha256: H("t5-source") }] };
    if (sql.includes("AS not_started_count")) return { rows: [{ not_started_count: 0, rolled_back_phase_count: 5, phase_count: 5, active_map_count: 0, succeeded_batch_count: 4, batch_count: 5 }] };
    return defaultDatabaseResult(sql, parameters);
  });
  const authorization = {
    formatVersion: 1, artifactKind: "yuzhou_hr_production_import_rollback_authorization", intent: "production_import_rollback",
    rollbackOperationId: "yzprod-rollback-20260829T020000Z-abcdef123456", importOperationId: plan.operationId,
    sealedPlanSha256: plan.sealing.sealedPlanSha256, targetIdentitySha256: plan.target.identitySha256,
    authorizationArtifactSha256: H("rollback-t5-authorization"), authorizationNonceSha256: H("rollback-t5-nonce"),
    issuedAt: "2026-08-29T00:30:00.000Z", expiresAt: "2026-08-29T01:30:00.000Z", productionImport: "HOLD",
  };
  const result = await rollbackSealedProductionImport(plan, authorization, {
    contract: activatedContract(plan), now: NOW, currentCodeSha: plan.triple.codeSha, mergedCodeSha: plan.triple.codeSha,
    targetIdentitySha256: plan.target.identitySha256, targetScope: plan.targetScope, database,
    rollbackPhase: async ({ records }) => records.map(record => ({ sourceIdentitySha256: record.sourceIdentitySha256, rollbackStatus: "deleted_insert" })),
    verifyBusinessResiduals: async ({ operationId, targetScope }) => ({ operationId, targetScopeSha256: targetScope.scopeSha256, residualCount: 0, evidenceSha256: H("business-residual-t5") }),
  });
  assert.equal(result.residualCount, 0);
  assert.deepEqual(database.calls.filter(call => call.kind === "transaction").map(call => call.options.purpose), ["consume_rollback_authorization", "rollback_t5_t0"]);
  assert.equal(database.calls.filter(call => call.sql?.includes("SET status='rolling_back'")).at(0).parameters.length, 1);
  assert.ok(database.calls.some(call => call.sql?.includes("hr-prod-t5:rollback-finish-batch")));
});
