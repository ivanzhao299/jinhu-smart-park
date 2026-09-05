#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL, computeProductionImportBusinessIdentityHash, computeProductionImportTargetCanonicalHash } from "../hr-cutover/production-import-target-model.mjs";
import { canonicalDecisionHash, canonicalEvidenceIndexHash } from "../hr-cutover/yuzhou-job-state-decision-artifact-lib.mjs";
import { materializeProductionT0DecisionCandidates, ProductionT0DecisionCandidatesError } from "../hr-cutover/materialize-production-t0-decision-candidates.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const codeSha = "a".repeat(40);
const snapshot = "b".repeat(64);
const mapping = "c".repeat(64);
const root = mkdtempSync(join(tmpdir(), "yuzhou-t0-decision-candidates-"));
process.once("exit", () => rmSync(root, { recursive: true, force: true }));
chmodSync(root, 0o700);
const staging = join(root, "staging"), output = join(root, "output");
for (const dir of [staging, output]) { mkdirSync(dir, { mode: 0o700 }); chmodSync(dir, 0o700); }
const writePrivate = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const triple = { codeSha, sourceSnapshotHash: snapshot, mappingContractHash: mapping };
const domainRows = {
  departments: [
    { key: "0001", source: { orgName: "Fixture Department", rating: 2, sortOrder: 1 }, table: "dbo.departmentcode" },
    { key: "000", source: { orgName: "Fixture Root", rating: 1, sortOrder: 0 }, table: "dbo.departmentcode" },
  ],
  positions: [{ key: "P001", source: { positionName: "Fixture Position", departmentCode: "0001", jobgrade: "family", salarygrade: "level" }, table: "dbo.job" }],
  employees: [{ key: "E001", source: { fullName: "Fixture Person", departmentCode: "0001", positionCode: "P001", legacyStatus: "A", hireDate: "2024-01-01", formalDate: "2024-02-01", departureDate: "" }, table: "dbo.person" }],
};
const files = { departments: "departments.jsonl", positions: "positions.jsonl", employees: "employees.jsonl" };
const manifest = { formatVersion: 1, domains: {} };
for (const [domain, rows] of Object.entries(domainRows)) {
  const bytes = `${rows.map(row => JSON.stringify({ sourceTable: row.table, sourceKey: row.key, sourceIdentitySha256: sha(`${row.table}\0${row.key}`), sourceRowSha256: sha(canonical(row.source)), source: row.source })).join("\n")}\n`;
  writePrivate(join(staging, files[domain]), bytes);
  manifest.domains[domain] = { rows: rows.length, file: files[domain], fileSha256: sha(bytes) };
}
// The real runner enforces 138/18/2949. The fixture adds replicated safe rows below after covering mapping semantics.
for (let index = 2; index < 138; index += 1) {
  const row = { table: "dbo.departmentcode", key: `D${String(index).padStart(3, "0")}`, source: { orgName: `Fixture Department ${index}`, rating: 2, sortOrder: index } };
  const next = `${readFileSync(join(staging, files.departments), "utf8")}${JSON.stringify({ sourceTable: row.table, sourceKey: row.key, sourceIdentitySha256: sha(`${row.table}\0${row.key}`), sourceRowSha256: sha(canonical(row.source)), source: row.source })}\n`;
  writePrivate(join(staging, files.departments), next);
}
for (let index = 1; index < 18; index += 1) {
  const row = { table: "dbo.job", key: `P${String(index + 1).padStart(3, "0")}`, source: { positionName: `Fixture Position ${index + 1}`, departmentCode: "0001" } };
  const next = `${readFileSync(join(staging, files.positions), "utf8")}${JSON.stringify({ sourceTable: row.table, sourceKey: row.key, sourceIdentitySha256: sha(`${row.table}\0${row.key}`), sourceRowSha256: sha(canonical(row.source)), source: row.source })}\n`;
  writePrivate(join(staging, files.positions), next);
}
for (let index = 1; index < 2949; index += 1) {
  const row = { table: "dbo.person", key: `E${String(index + 1).padStart(4, "0")}`, source: { fullName: `Fixture Person ${index + 1}`, departmentCode: "0001", positionCode: "P001", legacyStatus: "A", hireDate: "2024-01-01", formalDate: "", departureDate: "" } };
  const next = `${readFileSync(join(staging, files.employees), "utf8")}${JSON.stringify({ sourceTable: row.table, sourceKey: row.key, sourceIdentitySha256: sha(`${row.table}\0${row.key}`), sourceRowSha256: sha(canonical(row.source)), source: row.source })}\n`;
  writePrivate(join(staging, files.employees), next);
}
for (const [domain, file] of Object.entries(files)) {
  const bytes = readFileSync(join(staging, file));
  manifest.domains[domain] = { rows: bytes.toString("utf8").split("\n").filter(Boolean).length, file, fileSha256: sha(bytes) };
}
writePrivate(join(staging, "manifest.json"), `${JSON.stringify(manifest)}\n`);
const triplePath = join(root, "triple.json"); writePrivate(triplePath, `${JSON.stringify(triple)}\n`);
const records = Object.entries(domainRows).flatMap(([domain, rows]) => rows.map(row => ({ phase: "T0", targetTable: domain === "departments" ? "sys_org" : domain === "positions" ? "hr_position" : "hr_employee", sourceSystem: "yuzhou-v10", sourceTable: row.table, sourcePkCanonical: `sha256:${sha(`${row.table}\0${row.key}`)}`, sourceIdentitySha256: sha(`${row.table}\0${row.key}`), sourceRowSha256: sha(canonical(row.source)) })));
// Read the stage itself so the phase artifact contains every safe fixture row.
for (const [domain, targetTable] of [["departments", "sys_org"], ["positions", "hr_position"], ["employees", "hr_employee"]]) for (const line of readFileSync(join(staging, files[domain]), "utf8").toString().split("\n").filter(Boolean).slice(domainRows[domain].length)) { const row = JSON.parse(line); records.push({ phase: "T0", targetTable, sourceSystem: "yuzhou-v10", sourceTable: row.sourceTable, sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 }); }
const phasePath = join(root, "phase.json"); writePrivate(phasePath, `${JSON.stringify({ formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple, phase: "T0", records })}\n`);
const scope = { tenantId: "tenant", parkId: "park" }; const targetScope = { ...scope, scopeSha256: computeProductionImportTargetScopeHash(scope) };
const rootFields = { org_code: "000", org_name: "Fixture Root", org_type: "company", sort_order: 0, status: "enabled", remark: null };
const rootBusiness = computeProductionImportBusinessIdentityHash("sys_org", targetScope, rootFields);
const rootCanonical = computeProductionImportTargetCanonicalHash("sys_org", targetScope, rootFields);
const inventoryPath = join(root, "inventory.json"); writePrivate(inventoryPath, `${JSON.stringify({ formatVersion: 1, kind: "yuzhou_hr_production_t0_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false, targetIdentitySha256: "d".repeat(64), targetScopeSha256: targetScope.scopeSha256, targetTableCounts: { sys_org: 1, hr_position: 0, hr_employee: 0 }, records: [{ targetTable: "sys_org", businessIdentitySha256: rootBusiness, targetId: "11111111-1111-4111-8111-111111111111", targetCanonicalSha256: rootCanonical, targetVersion: 3 }] })}\n`);
const scopePath = join(root, "scope.json"); writePrivate(scopePath, `${JSON.stringify(scope)}\n`);
const decisions = ["A", "B", "C", "D", "E", "F", "G"].map((code, index) => ({ sourceIdentitySha256: sha(`dbo.person.jobstate\0${code.toLowerCase()}`), sourceRowSha256: sha(`state:${code}`), observedRecordCount: index === 0 ? 2943 : 1, decision: "map", targetEmploymentStatus: "active", semanticClassification: "source_exact", reasonCode: "DETERMINISTIC_MAPPING" }));
decisions[0].observedRecordCount = 2943;
decisions.sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
const job = { formatVersion: 2, artifactKind: "yuzhou_employee_job_state_machine_decision", artifactVersion: "v2", artifactStatus: "MACHINE_CANDIDATE", triple, expectedCheckpointRootSha256: "e".repeat(64), checkpointRootSha256: "e".repeat(64), evidenceIndex: { checkpointSha256: "e".repeat(64), manifestSha256: "f".repeat(64), extractBindingSha256: "1".repeat(64), journalSha256: "2".repeat(64), employeeJobStatesSha256: "3".repeat(64), jobStateCodeMetadataSha256: "4".repeat(64), jobStateCodesSha256: "5".repeat(64) }, evidenceIndexSha256: "", scopeBinding: { tenantIdentitySha256: "6".repeat(64), parkIdentitySha256: "7".repeat(64) }, sourceContract: { sourceSystem: "yuzhou-v10", dictionaryCode: "employee_job_state", sourceSnapshotSha256: snapshot, sourceDistinctStateCount: 7, sourceRecordCount: 2949 }, decisions, semanticLedger: { sourceDistinctStateCount: 7, sourceRecordCount: 2949, mappedStateCount: 7, quarantinedStateCount: 0, mappedRecordCount: 2949, quarantinedRecordCount: 0, conservationVerified: true }, canonicalDecisionSha256: "", machineAssertion: { mode: "trusted_root_deterministic_machine_semantics", policyVersion: "yuzhou-job-state-machine-policy-v2", status: "PASS", reasonCodes: [], humanSignature: false, humanIdentityAsserted: false }, productionImport: "HOLD" };
job.evidenceIndexSha256 = canonicalEvidenceIndexHash(job.evidenceIndex);
job.canonicalDecisionSha256 = canonicalDecisionHash(job);
const jobPath = join(root, "job.json"); writePrivate(jobPath, `${JSON.stringify(job)}\n`);
const outputPath = join(output, "candidates.json");
const result = materializeProductionT0DecisionCandidates({ stagingDir: staging, triplePath, phaseArtifactPath: phasePath, targetInventoryPath: inventoryPath, targetScopePath: scopePath, jobStatePath: jobPath, outputPath }, { head: () => codeSha });
assert.equal(result.status, "READY_FOR_FREEZE");
assert.deepEqual(result.targetTableCounts, { sys_org: 138, hr_position: 18, hr_employee: 2949 });
assert.equal(result.countByDisposition.skip_exact, 1);
assert.equal(result.countByDisposition.insert, 3104);
assert.doesNotMatch(JSON.stringify(result), /Fixture Person|Fixture Department|E0001/u);
const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
assert.equal(artifact.records.find(row => row.targetTable === "sys_org" && row.candidateDisposition === "skip_exact").expectedTargetVersion, 3);
assert.equal(artifact.records.find(row => row.targetTable === "hr_employee").dependencyRefs.length, 2);
assert.equal(artifact.productionImport, "HOLD");
const fullInventory = {
  ...JSON.parse(readFileSync(inventoryPath, "utf8")),
  kind: "yuzhou_hr_production_target_inventory_readonly",
  triple,
  sourceManifestSha256: "8".repeat(64),
};
fullInventory.records.push({ targetTable: "hr_contract_type", businessIdentitySha256: "7".repeat(64),
  targetId: "22222222-2222-4222-8222-222222222222", targetCanonicalSha256: "6".repeat(64), targetVersion: 1 });
fullInventory.targetTableCounts = Object.fromEntries(Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables)
  .map(table => [table, fullInventory.records.filter(row => row.targetTable === table).length]));
const fullInventoryPath = join(root, "full-inventory.json");
// Noncanonical whitespace makes hashing the parsed/reprojected JSON observably wrong.
const fullInventoryBytes = `${JSON.stringify(fullInventory, null, 2)}\n\n`;
writePrivate(fullInventoryPath, fullInventoryBytes);
const fullOutputPath = join(output, "full-candidates.json");
const fullInput = { stagingDir: staging, triplePath, phaseArtifactPath: phasePath,
  targetInventoryPath: fullInventoryPath, targetScopePath: scopePath, jobStatePath: jobPath, outputPath: fullOutputPath };
const fullResult = materializeProductionT0DecisionCandidates(fullInput, { head: () => codeSha });
const fullArtifact = JSON.parse(readFileSync(fullOutputPath, "utf8"));
assert.equal(fullResult.status, "READY_FOR_FREEZE");
assert.equal(fullArtifact.targetInventoryArtifactSha256, sha(fullInventoryBytes));
assert.notEqual(fullArtifact.targetInventoryArtifactSha256, sha(JSON.stringify(fullInventory)));
assert.notEqual(fullArtifact.targetInventoryArtifactSha256, artifact.targetInventoryArtifactSha256);
assert.deepEqual(fullArtifact.records, artifact.records);
assert.deepEqual(fullResult.countByDisposition, result.countByDisposition);
assert.deepEqual(fullResult.targetTableCounts, result.targetTableCounts);
assert.equal(fullArtifact.productionImport, "HOLD");
assert.equal(readFileSync(fullInventoryPath, "utf8"), fullInventoryBytes);
// Replacing the file after the first read must never bind one snapshot's hash to another's data.
const originalReadFileSync = fs.readFileSync;
let inventoryReads = 0;
try {
  fs.readFileSync = (...args) => {
    const bytes = originalReadFileSync(...args);
    if (args[0] === fullInventoryPath) {
      inventoryReads += 1;
      writePrivate(fullInventoryPath, `${JSON.stringify({ ...fullInventory, status: "FAIL" })}\n`);
    }
    return bytes;
  };
  syncBuiltinESMExports();
  const snapshotOutput = join(output, "snapshot-candidates.json");
  materializeProductionT0DecisionCandidates({ ...fullInput, outputPath: snapshotOutput }, { head: () => codeSha });
  const snapshotArtifact = JSON.parse(readFileSync(snapshotOutput, "utf8"));
  assert.equal(inventoryReads, 1);
  assert.equal(snapshotArtifact.targetInventoryArtifactSha256, sha(fullInventoryBytes));
  assert.deepEqual(snapshotArtifact.records, fullArtifact.records);
} finally {
  fs.readFileSync = originalReadFileSync;
  syncBuiltinESMExports();
  writePrivate(fullInventoryPath, fullInventoryBytes);
}
for (const drift of ["non-T0-count", "non-T0-record", "codeSha", "sourceSnapshotHash", "mappingContractHash"]) {
  const invalid = JSON.parse(fullInventoryBytes);
  if (drift === "non-T0-count") invalid.targetTableCounts.hr_contract_type = 0;
  else if (drift === "non-T0-record") invalid.records[1].targetCanonicalSha256 = "invalid";
  else invalid.triple[drift] = "9".repeat(drift === "codeSha" ? 40 : 64);
  const invalidPath = join(root, `invalid-${drift}.json`);
  const invalidOutput = join(output, `invalid-${drift}-candidates.json`);
  writePrivate(invalidPath, `${JSON.stringify(invalid)}\n`);
  assert.throws(() => materializeProductionT0DecisionCandidates({ ...fullInput,
    targetInventoryPath: invalidPath, outputPath: invalidOutput }, { head: () => codeSha }),
  error => error instanceof ProductionT0DecisionCandidatesError && error.code === "PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID");
  assert.equal(existsSync(invalidOutput), false);
}
const collisionInventoryPath = join(root, "collision-inventory.json");
writePrivate(collisionInventoryPath, `${JSON.stringify({ formatVersion: 1, kind: "yuzhou_hr_production_t0_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false, targetIdentitySha256: "d".repeat(64), targetScopeSha256: targetScope.scopeSha256, targetTableCounts: { sys_org: 1, hr_position: 0, hr_employee: 0 }, records: [{ targetTable: "sys_org", businessIdentitySha256: rootBusiness, targetId: "11111111-1111-4111-8111-111111111111", targetCanonicalSha256: "9".repeat(64), targetVersion: 3 }] })}\n`);
const collision = materializeProductionT0DecisionCandidates({ stagingDir: staging, triplePath, phaseArtifactPath: phasePath, targetInventoryPath: collisionInventoryPath, targetScopePath: scopePath, jobStatePath: jobPath, outputPath: join(output, "collision-candidates.json") }, { head: () => codeSha });
assert.equal(collision.status, "REVIEW_HOLD");
assert.equal(collision.countByDisposition.review_target_collision, 1);
assert.ok(collision.countByDisposition.quarantine > 0, "dependent records do not bypass a collision");
chmodSync(scopePath, 0o644);
assert.throws(() => materializeProductionT0DecisionCandidates({ stagingDir: staging, triplePath, phaseArtifactPath: phasePath, targetInventoryPath: inventoryPath, targetScopePath: scopePath, jobStatePath: jobPath, outputPath: join(output, "bad.json") }, { head: () => codeSha }), error => error instanceof ProductionT0DecisionCandidatesError && error.code === "PRODUCTION_IMPORT_T0_DECISION_PATH_INVALID");
console.log("Yuzhou production T0 decision-candidate contract passed: private C/S/M-bound source mapping, exact collision skip, dependency graph, no production write");
