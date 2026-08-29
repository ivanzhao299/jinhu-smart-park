#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { buildMachineCandidate, verifyMachineCandidate } from "../hr-cutover/build-yuzhou-job-state-review-package.mjs";
import { canonicalHash } from "../hr-cutover/materialize-reviewed-job-state.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const pretty = value => `${JSON.stringify(value, null, 2)}\n`;
const writePrivate = (path, value) => { writeFileSync(path, typeof value === "string" || Buffer.isBuffer(value) ? value : pretty(value), { mode: 0o600 }); chmodSync(path, 0o600); };
const dependencies = { validateConfigFn: value => value, currentStateFn: () => "review_hold", currentCodeShaFn: () => "a".repeat(40), currentMappingHashFn: () => "c".repeat(64), worktreeCleanFn: () => true, resolveBindingsFn: () => ({ YUZHOU_DEPARTMENTS_SHA256: "1".repeat(64), YUZHOU_POSITIONS_SHA256: "2".repeat(64), YUZHOU_EMPLOYEES_SHA256: "3".repeat(64) }) };

function fixture() {
  const sandbox = mkdtempSync(join(realpathSync(tmpdir()), "yuzhou-job-state-machine-package-")); chmodSync(sandbox, 0o700);
  const runtime = join(sandbox, "runtime"), stagingRoot = join(runtime, "staging"), evidenceRoot = join(runtime, "evidence"), outputRoot = join(sandbox, "package");
  for (const path of [runtime, stagingRoot, evidenceRoot, outputRoot]) { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); }
  const runId = "yzfull-20260828T120000Z-aaaaaaaa-rA";
  const config = { formatVersion: 1, runId, rehearsal: "A", backend: "lab", triple: { codeSha: "a".repeat(40), sourceSnapshotHash: "b".repeat(64), mappingContractHash: "c".repeat(64) }, target: { stagingRoot, evidenceRoot } };
  const configPath = join(sandbox, "config.json"); writePrivate(configPath, config);
  const staging = join(stagingRoot, `staging-${runId}-t0`); mkdirSync(staging, { mode: 0o700 }); chmodSync(staging, 0o700);
  const counts = [100, 200, 300, 400, 500, 600, 849];
  const states = counts.map((usageCount, index) => ({ sourceCode: `legacy-${index + 1}`, usageCount }));
  const codes = [...states.map((row, index) => ({ sourceCode: row.sourceCode, sourceName: `state-${index + 1}`, sortOrder: index + 1, isEnabled: 1, defaultCount: 1 })), { sourceCode: "unused", sourceName: "unused", sortOrder: 8, isEnabled: 1, defaultCount: 1 }];
  const statesPath = join(staging, "employee-job-states.raw.json"), metadataPath = join(staging, "job-state-code-metadata.raw.json"), codesPath = join(staging, "job-state-codes.raw.json");
  writePrivate(statesPath, states); writePrivate(metadataPath, []); writePrivate(codesPath, codes);
  const manifest = { formatVersion: 1, domains: { employeeJobStates: { rows: 7, file: "employee-job-states.raw.json", fileSha256: sha256(readFileSync(statesPath)) }, jobStateCodeMetadata: { rows: 0, file: "job-state-code-metadata.raw.json", fileSha256: sha256(readFileSync(metadataPath)) }, jobStateCodes: { rows: 8, file: "job-state-codes.raw.json", fileSha256: sha256(readFileSync(codesPath)) } } };
  const manifestPath = join(staging, "manifest.json"); writePrivate(manifestPath, manifest);
  const journalPath = join(evidenceRoot, "lifecycle-journal.jsonl"); writePrivate(journalPath, `${JSON.stringify({ kind: "state", state: "review_hold" })}\n`);
  const configSha256 = sha256(pretty({ runId, triple: config.triple, target: config.target })), binding = sha256(`${JSON.stringify(dependencies.resolveBindingsFn())}\n`);
  const checkpoint = { formatVersion: 1, status: "REVIEW_HOLD", triple: config.triple, runs: [
    { rehearsal: "A", runId, configSha256, state: "review_hold", t0ExtractManifestSha256: sha256(readFileSync(manifestPath)), t0ExtractBindingSha256: binding, journalSha256: sha256(readFileSync(journalPath)) },
    { rehearsal: "B", runId: "yzfull-20260828T120001Z-aaaaaaaa-rB", configSha256: "d".repeat(64), state: "review_hold", t0ExtractManifestSha256: "e".repeat(64), t0ExtractBindingSha256: "f".repeat(64), journalSha256: "0".repeat(64) }
  ], productionImport: "HOLD" };
  const checkpointPath = join(sandbox, "checkpoint.json"); writePrivate(checkpointPath, checkpoint);
  const decisions = states.map(row => ({ sourceIdentitySha256: sha256(`dbo.person.jobstate\0${row.sourceCode}`), decision: null, targetEmploymentStatus: null, semanticClassification: null, reasonCode: null })).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
  const targets = ["active", "probation", "suspended", "departed"];
  decisions.forEach((row, index) => index < 4 ? Object.assign(row, { decision: "map", targetEmploymentStatus: targets[index], semanticClassification: "derived_deterministic", reasonCode: "DETERMINISTIC_MAPPING" }) : Object.assign(row, { decision: "quarantine", semanticClassification: "quarantined_ambiguous", reasonCode: "UNKNOWN_SOURCE_VALUE" }));
  const plan = { formatVersion: 2, kind: "yuzhou-job-state-machine-decision-plan", runId, rehearsal: "A", decisions };
  const planPath = join(sandbox, "plan.json"); writePrivate(planPath, plan);
  const expectedCheckpointRootSha256 = sha256(readFileSync(checkpointPath)), outputPath = join(outputRoot, "machine-candidate.json");
  return { sandbox, configPath, checkpoint, checkpointPath, plan, planPath, outputPath, expectedCheckpointRootSha256, statesPath, manifestPath };
}
const options = value => ({ configPath: value.configPath, checkpointPath: value.checkpointPath, decisionPlanPath: value.planPath, expectedCheckpointRootSha256: value.expectedCheckpointRootSha256, outputPath: value.outputPath });
const rejects = (callback, code) => assert.throws(callback, error => error?.code === code);

test("builder emits a trusted-root v2 machine candidate and never emits human review fields", () => {
  const value = fixture(), result = buildMachineCandidate(options(value), dependencies), artifact = JSON.parse(readFileSync(value.outputPath, "utf8"));
  assert.equal(result.status, "MACHINE_CANDIDATE"); assert.equal(result.machineAssertion, "PASS"); assert.equal(result.productionImport, "HOLD");
  assert.equal(artifact.expectedCheckpointRootSha256, value.expectedCheckpointRootSha256); assert.equal(artifact.evidenceIndex.checkpointSha256, value.expectedCheckpointRootSha256);
  assert.equal(artifact.semanticLedger.sourceRecordCount, 2949); assert.equal(artifact.semanticLedger.mappedRecordCount + artifact.semanticLedger.quarantinedRecordCount, 2949);
  assert.equal((statSync(value.outputPath).mode & 0o777), 0o600);
  assert.doesNotMatch(JSON.stringify(artifact), /reviewer|approver|detachedHrApproval|approvalSubject|reviewedAt/u);
  assert.deepEqual(artifact.machineAssertion, { mode: "trusted_root_deterministic_machine_semantics", policyVersion: "yuzhou-job-state-machine-policy-v2", status: "PASS", reasonCodes: [], humanSignature: false, humanIdentityAsserted: false });
});

test("verify rebinds package to external root, current C/M, checkpoint and T0 bytes", () => {
  const value = fixture(); buildMachineCandidate(options(value), dependencies);
  const result = verifyMachineCandidate({ configPath: value.configPath, checkpointPath: value.checkpointPath, artifactPath: value.outputPath, expectedCheckpointRootSha256: value.expectedCheckpointRootSha256 }, dependencies);
  assert.equal(result.status, "MACHINE_CANDIDATE"); assert.equal(result.productionImport, "HOLD");
  const drift = fixture(); drift.plan.decisions[0].reasonCode = "APPROVED_MAPPING"; writePrivate(drift.planPath, drift.plan);
  rejects(() => buildMachineCandidate(options(drift), dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
});

test("self-computed or drifting roots and evidence cannot issue a package", () => {
  { const value = fixture(); rejects(() => buildMachineCandidate({ ...options(value), expectedCheckpointRootSha256: "9".repeat(64) }, dependencies), "YUZHOU_JOB_STATE_TRUSTED_ROOT_MISMATCH"); }
  { const value = fixture(); value.checkpoint.runs[0].journalSha256 = "9".repeat(64); writePrivate(value.checkpointPath, value.checkpoint); value.expectedCheckpointRootSha256 = sha256(readFileSync(value.checkpointPath)); rejects(() => buildMachineCandidate(options(value), dependencies), "YUZHOU_JOB_STATE_CHECKPOINT_DRIFT"); }
  { const value = fixture(); const manifest = JSON.parse(readFileSync(value.manifestPath, "utf8")); manifest.domains.employeeJobStates.fileSha256 = "9".repeat(64); writePrivate(value.manifestPath, manifest); value.checkpoint.runs[0].t0ExtractManifestSha256 = sha256(readFileSync(value.manifestPath)); writePrivate(value.checkpointPath, value.checkpoint); value.expectedCheckpointRootSha256 = sha256(readFileSync(value.checkpointPath)); rejects(() => buildMachineCandidate(options(value), dependencies), "YUZHOU_JOB_STATE_T0_DRIFT"); }
});

test("governed files reject links, broad permissions and existing outputs", () => {
  { const value = fixture(), alias = join(value.sandbox, "plan-link.json"); symlinkSync(value.planPath, alias); rejects(() => buildMachineCandidate({ ...options(value), decisionPlanPath: alias }, dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_UNSAFE"); }
  { const value = fixture(), alias = join(value.sandbox, "plan-hard.json"); linkSync(value.planPath, alias); rejects(() => buildMachineCandidate(options(value), dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_UNSAFE"); }
  { const value = fixture(); chmodSync(value.statesPath, 0o640); rejects(() => buildMachineCandidate(options(value), dependencies), "YUZHOU_JOB_STATE_T0_UNSAFE"); }
  { const value = fixture(); writePrivate(value.outputPath, { occupied: true }); rejects(() => buildMachineCandidate(options(value), dependencies), "YUZHOU_JOB_STATE_DRAFT_OUTPUT_EXISTS"); }
});

test("current code/mapping and clean worktree gates fail closed", () => {
  { const value = fixture(); rejects(() => buildMachineCandidate(options(value), { ...dependencies, currentCodeShaFn: () => "9".repeat(40) }), "YUZHOU_JOB_STATE_TRIPLE_CURRENT_DRIFT"); }
  { const value = fixture(); rejects(() => buildMachineCandidate(options(value), { ...dependencies, currentMappingHashFn: () => "9".repeat(64) }), "YUZHOU_JOB_STATE_TRIPLE_CURRENT_DRIFT"); }
  { const value = fixture(); rejects(() => buildMachineCandidate(options(value), { ...dependencies, worktreeCleanFn: () => false }), "YUZHOU_JOB_STATE_WORKTREE_DIRTY"); }
});

test("path-swap fault preserves both replacement and original private bytes", () => {
  const value = fixture(), preserved = join(value.sandbox, "package", "preserved.json"), replacement = { replacement: true };
  rejects(() => buildMachineCandidate(options(value), { ...dependencies, outputFaultHook: ({ outputPath }) => { renameSync(outputPath, preserved); writePrivate(outputPath, replacement); } }), "YUZHOU_JOB_STATE_DRAFT_OUTPUT_UNSAFE");
  assert.deepEqual(JSON.parse(readFileSync(value.outputPath, "utf8")), replacement); assert.equal(JSON.parse(readFileSync(preserved, "utf8")).artifactStatus, "MACHINE_CANDIDATE");
});

test("CLI exposes only machine-package commands and redacted errors", () => {
  const builder = resolve(import.meta.dirname, "../hr-cutover/build-yuzhou-job-state-review-package.mjs");
  const failed = spawnSync(process.execPath, [builder, "draft", "--config", "/Users/private/source.json"], { encoding: "utf8" });
  assert.notEqual(failed.status, 0); assert.equal(failed.stdout, ""); assert.match(failed.stderr, /^YUZHOU_[A-Z0-9_]+\n$/u); assert.doesNotMatch(failed.stderr, /Users|private|source/u);
  assert.doesNotMatch(readFileSync(builder, "utf8"), /artifactKind:\s*"yuzhou_employee_job_state_reviewed_decision"/u);
  assert.equal(canonicalHash({ stable: true }), canonicalHash({ stable: true }));
});
