#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalHash } from "../hr-cutover/materialize-reviewed-job-state.mjs";
import { canonicalDecisionHash, canonicalEvidenceIndexHash } from "../hr-cutover/yuzhou-job-state-decision-artifact-lib.mjs";
import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";
import { verifyProductionJobStateSourceRevalidation } from "../hr-cutover/production-job-state-source-revalidation.mjs";
import { materializeProductionT0PhaseArtifact } from "../hr-cutover/materialize-production-t0-phase-artifact.mjs";
import { materializeProductionT0DecisionCandidates } from "../hr-cutover/materialize-production-t0-decision-candidates.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const current = { codeSha: "a".repeat(40), sourceSnapshotHash: "b".repeat(64), mappingContractHash: "c".repeat(64) };
const old = { ...current, codeSha: "d".repeat(40), mappingContractHash: "e".repeat(64) };
const codes = ["1", "a", "2", "3", "4", "5", "b"];
const target = ["active", "active", "departed", "departed", "departed", "suspended", "suspended"];
const states = codes.map((code, index) => ({ sourceCode: code, usageCount: index === 0 ? 2943 : 1 }));
const dictionary = [...codes, "unused"].map((sourceCode, sortOrder) => ({ sourceCode, sourceName: `Fixture state ${sortOrder}`, sortOrder, isEnabled: 1, defaultCount: 0 }));
const dictionaryBytes = { employeeJobStates: bytes(states), jobStateCodeMetadata: bytes([]), jobStateCodes: bytes(dictionary) };
const wrap = (table, key, source) => ({ sourceTable: table, sourceKey: key, sourceIdentitySha256: sha(`${table}\0${key}`), sourceRowSha256: sha(JSON.stringify(source, Object.keys(source).sort())), source });
const employees = states.flatMap(s => Array.from({ length: s.usageCount }, (_, index) => wrap("dbo.person", `${s.sourceCode}-${index}`, {
  fullName: "Synthetic Person", departmentCode: "000", positionCode: "P1", legacyStatus: s.sourceCode,
  hireDate: "2020-01-01", formalDate: "", departureDate: "",
})));
const sourceRows = {
  departments: [wrap("dbo.departmentcode", "000", { orgName: "Synthetic Org", rating: 1, sortOrder: 0 })],
  positions: [wrap("dbo.job", "P1", { positionName: "Synthetic Position", departmentCode: "000", headcountLimit: null })],
  employees,
};
const files = {
  departments: "departments.jsonl", positions: "positions.jsonl", employees: "employees.jsonl",
  employeeJobStates: "employee-job-states.raw.json", jobStateCodeMetadata: "job-state-code-metadata.raw.json", jobStateCodes: "job-state-codes.raw.json",
};
const allBytes = { ...dictionaryBytes, ...Object.fromEntries(Object.entries(sourceRows).map(([domain, rows]) => [domain, Buffer.from(`${rows.map(row => JSON.stringify(row)).join("\n")}\n`)])) };
const rowCounts = { departments: 1, positions: 1, employees: 2949, employeeJobStates: 7, jobStateCodeMetadata: 0, jobStateCodes: 8 };
const stageManifest = { formatVersion: 1, domains: Object.fromEntries(Object.keys(files).map(domain => [domain, { rows: rowCounts[domain], file: files[domain], fileSha256: sha(allBytes[domain]) }])) };
const stageManifestBytes = bytes(stageManifest);
const empty = keys => ({ stageManifestSha256: sha("synthetic empty stage"), domains: Object.fromEntries(keys.map(key => [key, { rows: 0, fileSha256: sha("") }])) });
const sourceManifest = {
  formatVersion: 1, artifactKind: "yuzhou_hr_production_source_manifest", sourceReadOnly: true,
  sourceSnapshotSha256: current.sourceSnapshotHash, sourceRestoreReceiptSha256: sha("synthetic receipt"), sourceCatalogSha256: sha("synthetic catalog"), mappingContractSha256: current.mappingContractHash,
  phases: {
    T0: { stageManifestSha256: sha(stageManifestBytes), domains: Object.fromEntries(Object.entries(stageManifest.domains).map(([key, { rows, fileSha256 }]) => [key, { rows, fileSha256 }])) },
    T1: empty(["employmentEventStates", "employmentEventTypes", "employmentEvents"]),
    T2: empty(["dbo.compact", "dbo.compact.state", "dbo.compact_c", "dbo.compacttypecode"]),
    T3: empty(["attendance", "insurance", "policies"]),
  }, productionImport: "HOLD",
};
const evidenceIndex = {
  checkpointSha256: sha("old checkpoint"), manifestSha256: sha("old lab manifest"), extractBindingSha256: sha("old extraction"), journalSha256: sha("old journal"),
  employeeJobStatesSha256: sha(dictionaryBytes.employeeJobStates), jobStateCodeMetadataSha256: sha(dictionaryBytes.jobStateCodeMetadata), jobStateCodesSha256: sha(dictionaryBytes.jobStateCodes),
};
const decisions = states.map((s, index) => ({ sourceIdentitySha256: sha(`dbo.person.jobstate\0${s.sourceCode}`), sourceRowSha256: canonicalHash({ sourceCode: s.sourceCode, usageCount: s.usageCount, dictionaryRowSha256: canonicalHash(dictionary[index]) }), observedRecordCount: s.usageCount, decision: "map", targetEmploymentStatus: target[index], semanticClassification: "derived_deterministic", reasonCode: "DETERMINISTIC_MAPPING" })).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
const decision = {
  formatVersion: 2, artifactKind: "yuzhou_employee_job_state_machine_decision", artifactVersion: "v2", artifactStatus: "MACHINE_CANDIDATE", triple: old,
  expectedCheckpointRootSha256: evidenceIndex.checkpointSha256, checkpointRootSha256: evidenceIndex.checkpointSha256,
  evidenceIndex, evidenceIndexSha256: canonicalEvidenceIndexHash(evidenceIndex),
  scopeBinding: { tenantIdentitySha256: sha("old lab tenant"), parkIdentitySha256: sha("old lab park") },
  sourceContract: { sourceSystem: "yuzhou-v10", dictionaryCode: "employee_job_state", sourceSnapshotSha256: canonicalHash({ employeeJobStatesSha256: evidenceIndex.employeeJobStatesSha256, jobStateCodeMetadataSha256: evidenceIndex.jobStateCodeMetadataSha256, jobStateCodesSha256: evidenceIndex.jobStateCodesSha256, sourceDictionaryRowCount: 8, sourceDistinctStateCount: 7, sourceRecordCount: 2949 }), sourceDistinctStateCount: 7, sourceRecordCount: 2949 },
  decisions, semanticLedger: { sourceDistinctStateCount: 7, sourceRecordCount: 2949, mappedStateCount: 7, quarantinedStateCount: 0, mappedRecordCount: 2949, quarantinedRecordCount: 0, conservationVerified: true }, canonicalDecisionSha256: "",
  machineAssertion: { mode: "trusted_root_deterministic_machine_semantics", policyVersion: "yuzhou-job-state-machine-policy-v2", status: "PASS", reasonCodes: [], humanSignature: false, humanIdentityAsserted: false }, productionImport: "HOLD",
};
decision.canonicalDecisionSha256 = canonicalDecisionHash(decision);
const input = { decision, triple: current, sourceManifest, stageManifestBytes, dictionaryBytes, employeeRows: employees };
const original = JSON.stringify(decision);
const verified = verifyProductionJobStateSourceRevalidation(input);
assert.equal(verified.sourceRecordCount, 2949);
assert.equal(verified.sourceDistinctStateCount, 7);
assert.equal(verified.decisions.size, 7);
assert.deepEqual(verified.originalTriple, old);
assert.equal(JSON.stringify(decision), original);
let checks = 1;
const rejected = (name, mutate) => {
  const candidate = structuredClone(input);
  mutate(candidate);
  assert.throws(() => verifyProductionJobStateSourceRevalidation(candidate), error => typeof error.code === "string" && !/Synthetic Person|Fixture state|\/Users\//.test(error.message), name);
  checks++;
};
const resign = d => { d.evidenceIndexSha256 = canonicalEvidenceIndexHash(d.evidenceIndex); d.canonicalDecisionSha256 = canonicalDecisionHash(d); };
rejected("different original source", i => { i.decision.triple.sourceSnapshotHash = sha("another source"); resign(i.decision); });
rejected("current mapping must be manifest bound", i => { i.triple.mappingContractHash = sha("another mapping"); });
rejected("current source must be manifest bound", i => { i.sourceManifest.sourceSnapshotSha256 = sha("another source"); });
rejected("stage manifest bytes drift", i => { i.stageManifestBytes = Buffer.from(`${Buffer.from(i.stageManifestBytes)} `); });
rejected("stage domain row count drift", i => { i.sourceManifest.phases.T0.domains.positions.rows = 2; });
rejected("dictionary changed even if empty metadata", i => { i.dictionaryBytes.jobStateCodeMetadata = bytes([{}]); });
rejected("old evidence drift", i => { i.decision.evidenceIndex.jobStateCodesSha256 = sha("different dictionary"); resign(i.decision); });
rejected("original decision row must match actual source", i => { i.decision.decisions[0].sourceRowSha256 = sha("another source row"); resign(i.decision); });
rejected("original semantic result must match current policy", i => { const row = i.decision.decisions.find(r => r.targetEmploymentStatus === "active"); row.targetEmploymentStatus = "departed"; resign(i.decision); });
rejected("actual employee counts are independently checked", i => { i.employeeRows[0].source.legacyStatus = "a"; });
rejected("employee omissions rejected", i => { i.employeeRows.pop(); });
rejected("unknown employee status rejected", i => { i.employeeRows[0].source.legacyStatus = "unknown"; });
rejected("source dictionary aggregate hash checked", i => { i.decision.sourceContract.sourceSnapshotSha256 = sha("different aggregate"); resign(i.decision); });
rejected("machine assertion cannot become human approval", i => { i.decision.machineAssertion.humanSignature = true; resign(i.decision); });
rejected("source must remain read only", i => { i.sourceManifest.sourceReadOnly = false; });
rejected("original HOLD required", i => { i.decision.productionImport = "GO"; resign(i.decision); });

const root = mkdtempSync(join(tmpdir(), "yuzhou-source-revalidation-"));
try {
  chmodSync(root, 0o700);
  const staging = join(root, "staging"), output = join(root, "output");
  mkdirSync(staging, { mode: 0o700 }); mkdirSync(output, { mode: 0o700 });
  const write = (path, value) => { writeFileSync(path, Buffer.isBuffer(value) ? value : bytes(value), { mode: 0o600 }); chmodSync(path, 0o600); };
  for (const domain of Object.keys(files)) write(join(staging, files[domain]), allBytes[domain]);
  write(join(staging, "manifest.json"), stageManifestBytes);
  const triplePath = join(root, "triple.json"), jobStatePath = join(root, "original-decision.json"), sourceManifestPath = join(root, "source-manifest.json");
  write(triplePath, current); write(jobStatePath, decision); write(sourceManifestPath, sourceManifest);
  const phaseArtifactPath = join(root, "phase.json");
  materializeProductionT0PhaseArtifact({ stagingDir: staging, triplePath, outputPath: phaseArtifactPath }, { head: () => current.codeSha });
  const scope = { tenantId: "current-tenant", parkId: "current-park" };
  const inventory = { formatVersion: 1, kind: "yuzhou_hr_production_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false, triple: current,
    sourceManifestSha256: verifyProductionSourceManifest(sourceManifest).manifestSha256, targetIdentitySha256: sha("current target"), targetScopeSha256: computeProductionImportTargetScopeHash(scope),
    targetTableCounts: Object.fromEntries(Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables).map(table => [table, 0])), records: [] };
  const targetInventoryPath = join(root, "inventory.json"), targetScopePath = join(root, "scope.json");
  write(targetInventoryPath, inventory); write(targetScopePath, scope);
  const args = { stagingDir: staging, triplePath, phaseArtifactPath, targetInventoryPath, targetScopePath, jobStatePath, outputPath: join(output, "candidate.json") };
  assert.throws(() => materializeProductionT0DecisionCandidates(args, { head: () => current.codeSha }), /PRODUCTION_IMPORT_T0_DECISION_JOB_STATE_INVALID/);
  assert.equal(existsSync(args.outputPath), false);
  const result = materializeProductionT0DecisionCandidates({ ...args, sourceManifestPath }, { head: () => current.codeSha });
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.recordCount, 2951);
  assert.equal(result.countByDisposition.insert, 2951);
  const artifact = JSON.parse(readFileSync(args.outputPath));
  assert.deepEqual(artifact.triple, current);
  assert.equal(artifact.targetScope.tenantId, scope.tenantId);
  assert.equal(artifact.jobStateDecisionArtifactSha256, sha(bytes(decision)));
  assert.equal(readFileSync(jobStatePath, "utf8"), `${original}\n`);
  const forbiddenOutput = join(output, "invalid-candidate.json");
  write(targetInventoryPath, { ...inventory, sourceManifestSha256: sha("wrong manifest") });
  assert.throws(() => materializeProductionT0DecisionCandidates({ ...args, outputPath: forbiddenOutput, sourceManifestPath }, { head: () => current.codeSha }));
  assert.equal(existsSync(forbiddenOutput), false);
  write(targetInventoryPath, inventory);
  const linkedManifest = join(root, "linked-manifest.json"); symlinkSync(sourceManifestPath, linkedManifest);
  assert.throws(() => materializeProductionT0DecisionCandidates({ ...args, outputPath: forbiddenOutput, sourceManifestPath: linkedManifest }, { head: () => current.codeSha }));
  assert.equal(existsSync(forbiddenOutput), false);
  const oversizedManifest = join(root, "oversized-manifest.json"); write(oversizedManifest, {}); truncateSync(oversizedManifest, 32 * 1024 * 1024 + 1);
  assert.throws(() => materializeProductionT0DecisionCandidates({ ...args, outputPath: forbiddenOutput, sourceManifestPath: oversizedManifest }, { head: () => current.codeSha }));
  assert.equal(existsSync(forbiddenOutput), false);
  chmodSync(sourceManifestPath, 0o644);
  assert.throws(() => materializeProductionT0DecisionCandidates({ ...args, outputPath: forbiddenOutput, sourceManifestPath }, { head: () => current.codeSha }));
  assert.equal(existsSync(forbiddenOutput), false);
  chmodSync(sourceManifestPath, 0o600);
  // CLI errors expose no values or paths, and opt-in never supplies a HEAD override.
  const cli = spawnSync(process.execPath, [new URL("../hr-cutover/materialize-production-t0-decision-candidates.mjs", import.meta.url).pathname, "--source-manifest"], { encoding: "utf8" });
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /^PRODUCTION_IMPORT_T0_DECISION_ARGUMENT_INVALID\s*$/);
  checks += 7;
} finally { rmSync(root, { recursive: true, force: true }); }
console.log(`Yuzhou production job-state source revalidation: ${checks} checks passed; original provenance retained; production HOLD`);
