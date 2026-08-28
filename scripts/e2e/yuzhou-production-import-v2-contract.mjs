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
  validateSealedProductionImportPlan,
} from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { executeSealedProductionImport, rollbackSealedProductionImport } from "../hr-cutover/production-import-writer.mjs";

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
    sourceIdentitySha256: H(`${label}:identity`),
    sourceRowSha256: H(`${label}:row`),
    payloadSha256: computeProductionImportPayloadHash(payload),
    plannedTargetTable,
    dependencyMode,
    dependencyRefs,
    disposition: "insert",
    targetTable: plannedTargetTable,
    targetId: uuid(record.nextId++),
    expectedTargetAfterSha256: H(`${label}:after`),
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
        return { sourceIdentitySha256: row.sourceIdentitySha256, disposition: planned.disposition, targetId: planned.targetId, targetAfterSha256: planned.expectedTargetAfterSha256 };
      }),
    })])),
  };
}

const reseal = plan => { plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan); return plan; };
const findRecord = (plan, table) => plan.phases.flatMap(phase => phase.records).find(record => record.plannedTargetTable === table);

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
  assert.match(ci, /pnpm test:e2e:yuzhou-production-import-preflight/u);
  assert.match(ci, /pnpm test:e2e:yuzhou-production-import-v2(?:\s|$)/u);
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
    plan => { const employee = findRecord(plan, "hr_employee"); employee.disposition = "quarantine"; delete employee.targetTable; delete employee.targetId; delete employee.expectedTargetAfterSha256; employee.decisionAttestationSha256 = H("quarantine-decision"); employee.quarantine = { reasonCode: "OWNER_MAPPING_UNRESOLVED", algorithm: "aes-256-gcm-external-kek-v1", payloadCiphertextSha256: H("ciphertext"), keyReferenceSha256: H("key") }; },
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
  delete row.targetTable;
  delete row.targetId;
  delete row.expectedTargetAfterSha256;
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
  assert.deepEqual(database.calls.filter(call => call.kind === "transaction").map(call => call.options.purpose), ["consume_import_authorization", "apply_t0_t3"]);
  const consume = database.calls.find(call => call.sql?.includes("hr_yuzhou_consume_import_authorization_v2"));
  assert(consume);
  assert.deepEqual(consume.parameters.slice(6, 9), [plan.targetScope.tenantId, plan.targetScope.parkId, plan.targetScope.scopeSha256]);
  assert.equal(database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_phase")).length, 4);
  const recordInserts = database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_record("));
  assert.equal(recordInserts.length, plan.phases.flatMap(phase => phase.records).length);
  assert(recordInserts.every(call => call.sql.includes("planned_target_table") && typeof call.parameters[6] === "string"));
  assert.equal(database.calls.filter(call => call.sql?.includes("INSERT INTO hr_yuzhou_production_import_record_dependency")).length, plan.phases.flatMap(phase => phase.records).reduce((count, row) => count + row.dependencyRefs.length, 0));
});

test("consumed import authorization survives an independently recorded business failure", async () => {
  const { plan, payloadBundles } = v2Fixture();
  const database = mockDatabase();
  const options = executionOptions(plan, payloadBundles, database);
  options.phaseWriters.T1 = async () => { throw new Error("simulated business failure"); };
  await assert.rejects(executeSealedProductionImport(plan, options), /simulated business failure/u);
  assert.deepEqual(database.calls.filter(call => call.kind === "transaction").map(call => call.options.purpose), ["consume_import_authorization", "apply_t0_t3", "record_import_failure"]);
  const consumeIndex = database.calls.findIndex(call => call.sql?.includes("consume_import_authorization_v2"));
  const failureIndex = database.calls.findIndex(call => call.sql?.includes("failure_code"));
  assert(consumeIndex >= 0 && failureIndex > consumeIndex);
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
  const database = mockDatabase(async sql => {
    if (sql.startsWith("SELECT status")) return { rows: [{ status: "succeeded", sealed_plan_sha256: plan.sealing.sealedPlanSha256 }] };
    if (sql.startsWith("SELECT count")) return { rows: [{ count: 0 }] };
    return { rows: [] };
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
    rollbackRecord: async ({ record: planned }) => ({ sourceIdentitySha256: planned.sourceIdentitySha256, rollbackStatus: "deleted_insert" }),
  });
  assert.equal(result.residualCount, 0);
  assert.deepEqual(database.calls.filter(call => call.sql?.includes("SET status='rolling_back'")).map(call => call.parameters[1]), ["T3", "T2", "T1", "T0"]);

  const reused = { ...authorization, authorizationArtifactSha256: plan.authorization.artifactSha256 };
  const untouchedDatabase = mockDatabase();
  await assert.rejects(rollbackSealedProductionImport(plan, reused, {
    contract: activatedContract(plan), now: NOW, currentCodeSha: plan.triple.codeSha, mergedCodeSha: plan.triple.codeSha,
    targetIdentitySha256: plan.target.identitySha256, targetScope: plan.targetScope, database: untouchedDatabase, rollbackRecord: async () => ({}),
  }), error => error.code === "PRODUCTION_IMPORT_ROLLBACK_AUTH_REUSED");
  assert.equal(untouchedDatabase.calls.length, 0);
});
