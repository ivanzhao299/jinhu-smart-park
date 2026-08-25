#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ContractError, compareRehearsals, computeMappingContractHash, verifyManifest } from "../hr-cutover/verify-full-domain-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/full-domain-contract-v1.json");
const schemaPath = resolve(root, "scripts/hr-cutover/contracts/parent-manifest.schema.json");
const fixtureRoot = resolve(root, "scripts/hr-cutover/fixtures");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const valid = JSON.parse(readFileSync(resolve(fixtureRoot, "valid-parent-manifest.json"), "utf8"));
const legacy = JSON.parse(readFileSync(resolve(fixtureRoot, "legacy-domain-fragment.json"), "utf8"));
const negativeCases = JSON.parse(readFileSync(resolve(fixtureRoot, "negative-cases.json"), "utf8")).cases;
const t4Evidence = JSON.parse(readFileSync(resolve(root, ".trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json"), "utf8"));

const clone = (value) => structuredClone(value);
const expectCode = (code, operation) => assert.throws(operation, (error) => error instanceof ContractError && error.code === code, `expected ${code}`);

assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.additionalProperties, false);
for (const field of ["triple", "children", "resourceRegistry", "globalLedger", "canonical", "hardGates", "evidence", "security"]) {
  assert(schema.required.includes(field), `schema must require ${field}`);
}
assert.deepEqual(contract.domainOrder, ["T0", "T1", "T2", "T3", "T4", "T5"]);
assert.deepEqual(contract.rollbackOrder, [...contract.domainOrder].reverse());
assert.equal(contract.triple.comparison, "byte_exact");
assert.equal(valid.triple.mappingContractHash, computeMappingContractHash(contract));
assert.equal(contract.ledger.equation, "source=loaded+quarantined+approvedIgnored");
assert.deepEqual(contract.sourceProfileBaseline.T4, { salaryTables: 35, payrollRows: 46092, items: 711, formulas: 244, closes: 1431, memberships: 647, taxRules: 9 });
assert.equal(contract.canonicalNormalization.money, "decimal_string");
assert(contract.canonicalNormalization.excluded.includes("target_uuid"));
assert(contract.canonicalNormalization.excluded.includes("run_id"));
assert.equal(contract.approvedIgnoredReasons.freeTextBalancesLedger, false);
assert.equal(contract.redaction.manifestMayContainCredentials, false);
assert.equal(contract.isolation.directoryMode, "0700");
assert.equal(contract.isolation.fileMode, "0600");

for (const [index, domain] of contract.domainOrder.entries()) {
  const adapter = contract.domains[domain];
  assert.deepEqual(adapter.dependsOn, contract.domainOrder.slice(0, index));
  for (const field of ["extract", "transform", "load", "rollback"]) assert(readFileSync(resolve(root, adapter[field]), "utf8").length > 0, `${domain}.${field} missing`);
  for (const field of ["requiredEnv", "inputs", "outputs", "hashes"]) assert(Array.isArray(adapter[field]) && adapter[field].length > 0, `${domain}.${field} empty`);
  assert.equal(adapter.mutationFlag, "ALLOW_YUZHOU_MIGRATION=yes");
  assert.equal(adapter.rollbackFlag, "ALLOW_YUZHOU_ROLLBACK=yes");
  assert.equal(adapter.targetPolicyRef, "#/isolation");
  assert.equal(adapter.sideEffectAllowlistRef, "#/onlineSideEffectAllowlist");
}

assert.equal(verifyManifest(valid).ok, true);
assert.equal(verifyManifest(valid, { expectedTriple: valid.triple }).ok, true);
assert.equal(verifyManifest(valid, { t4Evidence }).state, "planned");
assert.equal(valid.hardGates.productionImport.status, "HOLD");

const mutations = {
  legacyFragment: () => legacy,
  wrongCodeSha: () => {
    const value = clone(valid); value.triple.codeSha = "0".repeat(40); return value;
  },
  wrongSourceHash: () => {
    const value = clone(valid); value.triple.sourceSnapshotHash = "0".repeat(64); return value;
  },
  wrongMappingHash: () => {
    const value = clone(valid); value.triple.mappingContractHash = "0".repeat(64); return value;
  },
  unsafeTarget: () => {
    const value = clone(valid); value.target.database = "jinhu_production"; return value;
  },
  unsafePermission: () => {
    const value = clone(valid); value.security.fileMode = "0644"; return value;
  },
  ledgerTamper: () => {
    const value = clone(valid); value.globalLedger[0].loaded -= 1; return value;
  },
  secretKey: () => {
    const value = clone(valid); value.accessToken = "redacted"; return value;
  },
  unexpectedProperty: () => {
    const value = clone(valid); value.unexpected = true; return value;
  },
  targetTraversal: () => {
    const value = clone(valid); value.target.evidenceRoot = "/tmp/jinhu_hr_migration_lab_full_contract_a/../production"; return value;
  },
  missingResourceType: () => {
    const value = clone(valid); value.resourceRegistry = value.resourceRegistry.filter((resource) => resource.type !== "credential_artifact"); return value;
  },
  invalidChildStatus: () => {
    const value = clone(valid); value.children[0].status = "complete"; return value;
  },
  partialVerified: () => {
    const value = clone(valid); value.state = "verified"; return value;
  },
  t4Advance: () => {
    const value = clone(valid); value.state = "loading"; return value;
  }
};

for (const testCase of negativeCases) {
  const value = mutations[testCase.mutation]();
  const options = testCase.mutation.startsWith("wrong") ? { expectedTriple: valid.triple } : testCase.mutation === "t4Advance" ? { t4Evidence } : {};
  expectCode(testCase.expectedCode, () => verifyManifest(value, options));
}

const rehearsalB = clone(valid);
rehearsalB.rehearsal = "B";
rehearsalB.parentRunId = rehearsalB.parentRunId.replace(/-rA$/, "-rB");
rehearsalB.children.forEach((child) => { child.runId = child.runId.replace(/-rA-/, "-rB-"); });
rehearsalB.target = {
  ...rehearsalB.target,
  database: "jinhu_hr_migration_lab_full_contract_b",
  composeProject: "jinhu_hr_migration_lab_full_contract_b",
  volume: "jinhu_hr_migration_lab_full_contract_b_pgdata",
  postgresContainer: "jinhu_hr_migration_lab_full_contract_b-postgres-1",
  apiPort: 43201,
  webPort: 43202,
  fileRoot: "/tmp/jinhu_hr_migration_lab_full_contract_b/files",
  stagingRoot: "/tmp/jinhu_hr_migration_lab_full_contract_b/staging",
  evidenceRoot: "/tmp/jinhu_hr_migration_lab_full_contract_b/evidence",
  accountNamespace: "yzfull_b_contract"
};
rehearsalB.resourceRegistry = rehearsalB.resourceRegistry.map((resource) => ({
  ...resource,
  planned: resource.planned.replaceAll("contract_a", "contract_b").replaceAll("yzfull_a", "yzfull_b").replaceAll("43101", "43201")
}));
assert.equal(compareRehearsals(valid, rehearsalB).ok, true);
const reused = clone(rehearsalB); reused.target.apiPort = valid.target.apiPort;
expectCode("REHEARSAL_RESOURCE_REUSE", () => compareRehearsals(valid, reused));
const reusedRegistry = clone(rehearsalB); reusedRegistry.resourceRegistry[0].planned = valid.resourceRegistry[0].planned;
expectCode("REHEARSAL_RESOURCE_REUSE", () => compareRehearsals(valid, reusedRegistry));
const mismatchedLedger = clone(rehearsalB); mismatchedLedger.globalLedger[0].loaded -= 1; mismatchedLedger.globalLedger[0].quarantined += 1;
expectCode("REHEARSAL_LEDGER_MISMATCH", () => compareRehearsals(valid, mismatchedLedger));
const mismatchedCanonical = clone(rehearsalB); mismatchedCanonical.canonical.globalHash = "9".repeat(64);
expectCode("REHEARSAL_CANONICAL_MISMATCH", () => compareRehearsals(valid, mismatchedCanonical));

const evidenceRoot = mkdtempSync(join(tmpdir(), "jinhu-hr-full-contract-"));
try {
  chmodSync(evidenceRoot, 0o700);
  const evidencePath = join(evidenceRoot, "gate.json");
  const content = Buffer.from('{"status":"PASS"}\n');
  writeFileSync(evidencePath, content, { mode: 0o600 });
  const withEvidence = clone(valid);
  withEvidence.evidence = [{
    kind: "contract_gate",
    relativePath: "gate.json",
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.length,
    mode: "0600",
    redacted: true
  }];
  assert.equal(verifyManifest(withEvidence, { evidenceRoot }).ok, true);
  writeFileSync(evidencePath, '{"status":"FAIL"}\n', { mode: 0o600 });
  expectCode("EVIDENCE_HASH_MISMATCH", () => verifyManifest(withEvidence, { evidenceRoot }));
  writeFileSync(evidencePath, content, { mode: 0o644 });
  chmodSync(evidencePath, 0o644);
  expectCode("UNSAFE_FILE_PERMISSION", () => verifyManifest(withEvidence, { evidenceRoot }));
  const secretContent = Buffer.from('{"password":"never-store-this"}\n');
  writeFileSync(evidencePath, secretContent, { mode: 0o600 });
  chmodSync(evidencePath, 0o600);
  withEvidence.evidence[0].sha256 = createHash("sha256").update(secretContent).digest("hex");
  withEvidence.evidence[0].bytes = secretContent.length;
  expectCode("SECRET_PATTERN_DETECTED", () => verifyManifest(withEvidence, { evidenceRoot }));
  const personalContent = Buffer.from('{"employeeName":"redacted-is-still-forbidden"}\n');
  writeFileSync(evidencePath, personalContent, { mode: 0o600 });
  withEvidence.evidence[0].sha256 = createHash("sha256").update(personalContent).digest("hex");
  withEvidence.evidence[0].bytes = personalContent.length;
  expectCode("SECRET_PATTERN_DETECTED", () => verifyManifest(withEvidence, { evidenceRoot }));
} finally {
  rmSync(evidenceRoot, { recursive: true, force: true });
}

console.log(`Yuzhou full-domain Slice 1 contract passed (${negativeCases.length} negative cases).`);
