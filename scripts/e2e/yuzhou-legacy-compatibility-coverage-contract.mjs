#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LegacyCoverageError, validateCoverageLedger } from "../hr-cutover/verify-legacy-compatibility-coverage.mjs";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const contract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-compatibility-coverage-v1.json"), "utf8"));
const ledger = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-compatibility-ledger-v1.json"), "utf8"));
const evidenceRef = `controlled-evidence:sha256:${"a".repeat(64)}`;
const attestationRef = `detached-attestation:sha256:${"b".repeat(64)}`;
const testRef = "scripts/e2e/yuzhou-legacy-compatibility-coverage-contract.mjs";
const validationOptions = { evidenceIndex: new Set([evidenceRef, attestationRef]) };

function clone(value) {
  return structuredClone(value);
}

function expectCode(code, mutate) {
  const candidate = clone(ledger);
  mutate(candidate);
  assert.throws(
    () => validateCoverageLedger(candidate, contract, validationOptions),
    (error) => error instanceof LegacyCoverageError && error.code === code,
    `expected ${code}`
  );
}

const baseline = validateCoverageLedger(ledger, contract);
assert.equal(baseline.ok, true);
assert.equal(baseline.completionStatus, "IN_PROGRESS");
assert.equal(baseline.totalScore, 13.75);
assert.equal(baseline.itemCount, 18);
assert.equal(baseline.menuFamilyCount, 13);
assert.deepEqual(baseline.reasonCodes, ["ATOMIC_INVENTORY_INCOMPLETE", "LEGACY_CLIENT_L4_TRAVERSAL_MISSING", "LEGACY_BUSINESS_L5_SIGNOFF_MISSING"]);
assert.deepEqual(baseline.inventoryMissing, ["page_entry:13/36", "field_dictionary:1/162", "state_action_rule:1/212", "permission_scope:1/915"]);
assert.deepEqual(baseline.sourceBaselines, {
  helpTopics: 46,
  menuFamilies: 13,
  tables: 162,
  storedProcedures: 194,
  functions: 16,
  triggers: 2,
  legacyAuthorizationRows: 915
});

expectCode("ITEM_ID_DUPLICATE", (candidate) => {
  candidate.items[1].id = candidate.items[0].id;
});
expectCode("MENU_FAMILY_MISSING", (candidate) => {
  candidate.items = candidate.items.filter((item) => item.menuFamily !== "training");
});
expectCode("CURRENT_TARGET_MISSING", (candidate) => {
  candidate.items[0].currentTarget = { routes: [], apis: [], entities: [], permissions: [] };
});
expectCode("TEST_EVIDENCE_MISSING", (candidate) => {
  candidate.items[0].status = "verified";
  candidate.items[0].legacyObject.evidenceLevel = "L4";
  candidate.items[0].legacyObject.evidenceRefs = [evidenceRef];
});
expectCode("EVIDENCE_LEVEL_TOO_LOW", (candidate) => {
  candidate.items[0].status = "verified";
  candidate.items[0].testRefs = [testRef];
  candidate.items[0].legacyObject.locator = { sourceTable: null, sourceColumn: null, sourceRoutine: null, page: "organization_job", action: "read", state: null, report: null };
  candidate.items[0].reasonCode = null;
});
expectCode("SOURCE_MATERIAL_FORBIDDEN", (candidate) => {
  candidate.items[0].legacyObject.evidenceRefs = ["/Users/example/Downloads/source.txt"];
});
expectCode("SOURCE_MATERIAL_FORBIDDEN", (candidate) => {
  candidate.items[0].legacyObject.name = "employee@example.com";
});
expectCode("SOURCE_MATERIAL_FORBIDDEN", (candidate) => {
  candidate.items[0].legacyObject.name = "13800138000";
});
expectCode("ATOMIC_LOCATOR_INVALID", (candidate) => {
  candidate.items[0].legacyObject.locator = { sourceTable: null, sourceColumn: null, sourceRoutine: null, page: null, action: null, state: null, report: null };
});
expectCode("REFERENCE_NOT_FOUND", (candidate) => {
  candidate.items[0].status = "tested";
  candidate.items[0].legacyObject.evidenceLevel = "L3";
  candidate.items[0].legacyObject.locator = { sourceTable: null, sourceColumn: null, sourceRoutine: null, page: "employee_profile", action: "read", state: null, report: null };
  candidate.items[0].testRefs = ["scripts/e2e/does-not-exist.mjs"];
});
expectCode("CURRENT_ROUTE_INVALID", (candidate) => {
  candidate.items[0].currentTarget.routes = ["/apartments/applications"];
});
expectCode("MENU_FAMILY_MISSING", (candidate) => {
  candidate.items = candidate.items.filter((item) => !(item.dimension === "page_entry" && item.menuFamily === "training"));
  candidate.items.push({ ...clone(candidate.items.at(-1)), id: "RULE-TRAINING-002", menuFamily: "training" });
});
expectCode("EVIDENCE_MISSING", (candidate) => {
  candidate.legacyRuntimeTraversal = { status: "completed", evidenceLevel: "L4", evidenceRefs: [], reasonCode: null };
});

const atomicField = clone(ledger);
atomicField.items[13].legacyObject.locator = {
  sourceTable: "person",
  sourceColumn: "structural_column_name",
  sourceRoutine: null,
  page: "employee_profile",
  action: "read",
  state: null,
  report: null
};
assert.equal(validateCoverageLedger(atomicField, contract, validationOptions).ok, true);

const runtimeMissing = clone(ledger);
runtimeMissing.businessSignoff = { status: "completed", evidenceLevel: "L5", evidenceRefs: [attestationRef], reasonCode: null };
for (const item of runtimeMissing.items) {
  item.status = "verified";
  item.legacyObject.evidenceLevel = "L4";
  item.legacyObject.evidenceRefs = [evidenceRef];
  item.legacyObject.locator = { sourceTable: null, sourceColumn: null, sourceRoutine: null, page: item.menuFamily ?? "modern_extension", action: "verify", state: null, report: null };
  if (!["routes", "apis", "entities", "permissions"].some((field) => item.currentTarget[field].length > 0)) item.currentTarget.entities = ["controlled-target:fixture"];
  item.testRefs = [testRef];
  item.reasonCode = null;
}
const capped = validateCoverageLedger(runtimeMissing, contract, validationOptions);
assert.equal(capped.totalScore, 97);
assert.equal(capped.dimensions.page_entry.rawScore, 15);
assert.equal(capped.dimensions.page_entry.score, 12);
assert.deepEqual(capped.reasonCodes, ["ATOMIC_INVENTORY_INCOMPLETE", "LEGACY_CLIENT_L4_TRAVERSAL_MISSING"]);

const complete = clone(runtimeMissing);
complete.legacyRuntimeTraversal = { status: "completed", evidenceLevel: "L4", evidenceRefs: [evidenceRef], reasonCode: null };
const targetCounts = contract.inventoryGate.minimumItemsByDimension;
for (const [dimension, minimum] of Object.entries(targetCounts)) {
  const current = complete.items.filter((item) => item.dimension === dimension).length;
  const prefix = { page_entry: "PAGE", field_dictionary: "FIELD", state_action_rule: "RULE", permission_scope: "RBAC", migration_reconciliation: "MIGRATION", modern_enterprise: "MODERN" }[dimension];
  for (let index = current + 1; index <= minimum; index += 1) {
    complete.items.push({
      id: `${prefix}-FILL-${String(index).padStart(3, "0")}`,
      dimension,
      menuFamily: dimension === "page_entry" ? contract.requiredMenuFamilies[(index - 1) % contract.requiredMenuFamilies.length] : null,
      legacyObject: {
        kind: "atomic_fixture",
        name: `${dimension}-${index}`,
        evidenceLevel: "L4",
        evidenceRefs: [evidenceRef],
        locator: { sourceTable: null, sourceColumn: null, sourceRoutine: null, page: `${dimension}-${index}`, action: "verify", state: null, report: null }
      },
      currentTarget: { routes: [], apis: [], entities: [`controlled-target:${dimension}`], permissions: [] },
      status: "verified",
      testRefs: [testRef],
      reasonCode: null
    });
  }
}
const completeReport = validateCoverageLedger(complete, contract, validationOptions);
assert.equal(completeReport.totalScore, 100);
assert.equal(completeReport.completionStatus, "COMPLETE");
assert.deepEqual(completeReport.reasonCodes, []);

const fakeArchived = clone(ledger);
fakeArchived.items[13].status = "approved_archived";
fakeArchived.items[13].reasonCode = "DEFERRED_COLD_ARCHIVE";
fakeArchived.items[13].legacyObject.evidenceLevel = "L5";
fakeArchived.items[13].legacyObject.evidenceRefs = [evidenceRef];
fakeArchived.items[13].legacyObject.locator = { sourceTable: "person", sourceColumn: "legacy_column", sourceRoutine: null, page: null, action: null, state: null, report: null };
assert.throws(() => validateCoverageLedger(fakeArchived, contract, validationOptions), (error) => error instanceof LegacyCoverageError && error.code === "ATTESTATION_REFERENCE_MISSING");

assert.throws(
  () => validateCoverageLedger(runtimeMissing, contract, { evidenceIndex: new Set() }),
  (error) => error instanceof LegacyCoverageError && error.code === "EVIDENCE_REFERENCE_UNRESOLVED"
);

console.log("Yuzhou legacy compatibility coverage contract passed (baseline plus fail-closed negative cases). ");
