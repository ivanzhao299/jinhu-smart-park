import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  ProductionImportRealArtifactBridgeError,
  bridgeProductionImportRealArtifacts,
} from "../hr-cutover/production-import-real-artifact-bridge.mjs";
import { computeFrozenArtifactHash } from "../hr-cutover/production-import-payload-generator.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } from "../hr-cutover/production-import-target-model.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const sha = value => hash(`fixture:${value}`);
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: sha("source"), mappingContractHash: sha("mapping") };
const targetScopeBase = { tenantId: "11111111-1111-4111-8111-111111111111", parkId: "22222222-2222-4222-8222-222222222222" };
const targetScope = { ...targetScopeBase, scopeSha256: computeProductionImportTargetScopeHash(targetScopeBase) };

const jsonBytes = value => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
const explicit = (path, value) => {
  const bytes = jsonBytes(value);
  return { path, bytes, sha256: hash(bytes) };
};
const envelopeHash = content => computeFrozenArtifactHash(content);

function fieldValue(rule, field, table) {
  if (rule.integerFields.includes(field)) return 1;
  if (rule.booleanFields.includes(field)) return true;
  if (rule.decimalStringFields.includes(field)) return "1.000000";
  if (rule.dateFields.includes(field)) return "2026-01-01";
  if (rule.timestampFields.includes(field)) return "2026-01-01T00:00:00Z";
  if (rule.jsonObjectFields.includes(field)) return {};
  return `${table}_${field}`;
}

const entries = Object.entries(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables);
const sourceIdentityByTable = Object.fromEntries(entries.map(([table], index) => [table, sha(`source-${index}`)]));
const records = entries.map(([targetTable, rule], index) => ({
  phase: rule.phase,
  targetTable,
  sourceSystem: "yuzhou-v10",
  sourceTable: rule.allowedSourceTables[0],
  sourcePkCanonical: `sha256:${sourceIdentityByTable[targetTable]}`,
  sourceIdentitySha256: sourceIdentityByTable[targetTable],
  sourceRowSha256: sha(`row-${index}`),
}));
const phaseDocuments = Object.fromEntries(["T0", "T1", "T2", "T3"].map(phase => [phase, {
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_real_phase_staging",
  triple,
  phase,
  records: records.filter(row => row.phase === phase),
}]));
const phaseArtifacts = Object.fromEntries(Object.entries(phaseDocuments).map(([phase, value]) => [phase, explicit(`/controlled/${phase}.json`, value)]));
const stagingContent = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_frozen_staging_index", sourceSnapshotHash: triple.sourceSnapshotHash, records };
const stagingArtifactSha256 = envelopeHash(stagingContent);
const inventoryContent = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_frozen_target_inventory", targetScope, records: [] };
const inventoryArtifactSha256 = envelopeHash(inventoryContent);
const scopeContent = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_sealed_scope", targetScope };
const scopeArtifactSha256 = envelopeHash(scopeContent);
const decisionRecords = entries.map(([targetTable, rule]) => ({
  phase: rule.phase,
  targetTable,
  sourceIdentitySha256: sourceIdentityByTable[targetTable],
  disposition: "insert",
  targetFields: Object.fromEntries(rule.requiredFields.map(field => [field, fieldValue(rule, field, targetTable)])),
  dependencyRefs: rule.foreignKeys.filter(reference => reference.required).map(reference => ({
    role: reference.dependencyRole,
    phase: DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables[reference.targetTable].phase,
    sourceIdentitySha256: sourceIdentityByTable[reference.targetTable],
    expectedTargetTable: reference.targetTable,
  })),
}));
const decisionsContent = {
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_frozen_decisions",
  stagingArtifactSha256,
  targetInventoryArtifactSha256: inventoryArtifactSha256,
  sealedScopeArtifactSha256: scopeArtifactSha256,
  phaseManifests: Object.fromEntries(Object.entries(phaseArtifacts).map(([phase, artifact]) => [phase, artifact.sha256])),
  records: decisionRecords,
};

const roleArtifact = (role, artifactKind, payload) => explicit(`/controlled/${role}.json`, { formatVersion: 1, artifactKind, triple, payload });
const baseInput = {
  expectedTriple: triple,
  phaseArtifacts: [phaseArtifacts.T3, phaseArtifacts.T1, phaseArtifacts.T0, phaseArtifacts.T2],
  targetInventoryArtifact: roleArtifact("inventory", "yuzhou_hr_production_import_real_target_inventory", inventoryContent),
  decisionsArtifact: roleArtifact("decisions", "yuzhou_hr_production_import_real_decisions", decisionsContent),
  sealedScopeArtifact: roleArtifact("scope", "yuzhou_hr_production_import_real_sealed_scope", scopeContent),
};

const ready = bridgeProductionImportRealArtifacts(baseInput);
assert.equal(ready.status, "READY");
assert.equal(ready.productionImport, "HOLD");
assert.deepEqual(ready.reasonCodes, []);
assert.equal(ready.targetTableCoverage.expectedCount, 16);
assert.equal(ready.targetTableCoverage.presentCount, 16);
assert.deepEqual(ready.targetTableCoverage.missingTables, []);
assert.equal(ready.generationEvidence.recordCount, 16);
assert.deepEqual(Object.keys(ready.phaseEvidence), ["T0", "T1", "T2", "T3"]);
assert.equal(ready.generatorInput.stagingArtifact.artifactSha256, stagingArtifactSha256);
assert.equal(ready.generatorInput.decisionsArtifact.artifactSha256, envelopeHash(decisionsContent));
assert.ok(Object.values(ready.phaseEvidence).every(value => /^[0-9a-f]{64}$/u.test(value.sourcePathSha256) && value.recordCount > 0));
assert.doesNotMatch(JSON.stringify({ phaseEvidence: ready.phaseEvidence, generationEvidence: ready.generationEvidence }), /张三|320101|13800138000|password|token/iu);

const missingTableInput = structuredClone(baseInput);
const t3 = JSON.parse(Buffer.from(missingTableInput.phaseArtifacts[0].bytes).toString("utf8"));
t3.records = t3.records.filter(row => row.targetTable !== "hr_employee_insurance_item");
missingTableInput.phaseArtifacts[0] = explicit("/controlled/T3-old.json", t3);
const missingTable = bridgeProductionImportRealArtifacts(missingTableInput);
assert.equal(missingTable.status, "REVIEW_HOLD");
assert.equal(missingTable.generatorInput, null);
assert.deepEqual(missingTable.reasonCodes, ["PRODUCTION_IMPORT_REAL_ARTIFACT_TABLE_COVERAGE_INCOMPLETE"]);
assert.deepEqual(missingTable.targetTableCoverage.missingTables, ["hr_employee_insurance_item"]);

const oldArtifactInput = structuredClone(baseInput);
const t0Index = oldArtifactInput.phaseArtifacts.findIndex(value => JSON.parse(Buffer.from(value.bytes).toString("utf8")).phase === "T0");
const oldT0 = JSON.parse(Buffer.from(oldArtifactInput.phaseArtifacts[t0Index].bytes).toString("utf8"));
delete oldT0.records.find(row => row.targetTable === "hr_employee").sourceRowSha256;
oldArtifactInput.phaseArtifacts[t0Index] = explicit("/controlled/T0-legacy-incomplete.json", oldT0);
const oldStagingRecords = oldArtifactInput.phaseArtifacts
  .map(value => JSON.parse(Buffer.from(value.bytes).toString("utf8")))
  .sort((left, right) => ["T0", "T1", "T2", "T3"].indexOf(left.phase) - ["T0", "T1", "T2", "T3"].indexOf(right.phase))
  .flatMap(value => value.records);
oldArtifactInput.decisionsArtifact = roleArtifact("decisions-old", "yuzhou_hr_production_import_real_decisions", {
  ...decisionsContent,
  stagingArtifactSha256: envelopeHash({ ...stagingContent, records: oldStagingRecords }),
  phaseManifests: { ...decisionsContent.phaseManifests, T0: oldArtifactInput.phaseArtifacts[t0Index].sha256 },
});
const oldArtifact = bridgeProductionImportRealArtifacts(oldArtifactInput);
assert.equal(oldArtifact.status, "REVIEW_HOLD");
assert.equal(oldArtifact.generatorInput, null);
assert.deepEqual(oldArtifact.reasonCodes, ["PRODUCTION_IMPORT_FROZEN_STAGING_INVALID"]);

const stalePhaseHashInput = structuredClone(baseInput);
const changedT2Index = stalePhaseHashInput.phaseArtifacts.findIndex(value => JSON.parse(Buffer.from(value.bytes).toString("utf8")).phase === "T2");
const changedT2 = JSON.parse(Buffer.from(stalePhaseHashInput.phaseArtifacts[changedT2Index].bytes).toString("utf8"));
changedT2.records[0].sourceRowSha256 = sha("changed-row");
stalePhaseHashInput.phaseArtifacts[changedT2Index] = explicit("/controlled/T2-current.json", changedT2);
const stalePhaseHash = bridgeProductionImportRealArtifacts(stalePhaseHashInput);
assert.equal(stalePhaseHash.status, "REVIEW_HOLD");
assert.deepEqual(stalePhaseHash.reasonCodes, ["PRODUCTION_IMPORT_REAL_PHASE_HASH_BINDING_MISMATCH"]);

const expectBridgeCode = (input, code) => assert.throws(
  () => bridgeProductionImportRealArtifacts(input),
  error => error instanceof ProductionImportRealArtifactBridgeError && error.code === code && !/张三|320101|13800138000/u.test(error.message),
);
const badHashInput = structuredClone(baseInput);
badHashInput.phaseArtifacts[0].sha256 = sha("tampered");
expectBridgeCode(badHashInput, "PRODUCTION_IMPORT_REAL_ARTIFACT_HASH_MISMATCH");
const badTripleInput = structuredClone(baseInput);
const badTriplePhase = JSON.parse(Buffer.from(badTripleInput.phaseArtifacts[0].bytes).toString("utf8"));
badTriplePhase.triple.codeSha = "2".repeat(40);
badTripleInput.phaseArtifacts[0] = explicit("/controlled/T3-wrong-sha.json", badTriplePhase);
expectBridgeCode(badTripleInput, "PRODUCTION_IMPORT_REAL_ARTIFACT_TRIPLE_MISMATCH");

console.log("Yuzhou production import real-artifact bridge contract passed: exact C/S/M, four phases, 16 tables, incomplete legacy artifacts REVIEW_HOLD, no PII logging");
