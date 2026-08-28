#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildDraft,
  verifyDraft
} from "../hr-cutover/build-yuzhou-job-state-review-package.mjs";
import { canonicalHash } from "../hr-cutover/materialize-reviewed-job-state.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const pretty = value => `${JSON.stringify(value, null, 2)}\n`;
const writePrivate = (path, value) => {
  writeFileSync(path, typeof value === "string" || Buffer.isBuffer(value) ? value : pretty(value), { mode: 0o600 });
  chmodSync(path, 0o600);
};
const dependencies = {
  validateConfigFn: config => config,
  currentStateFn: () => "review_hold",
  currentCodeShaFn: () => "a".repeat(40),
  currentMappingHashFn: () => "c".repeat(64),
  worktreeCleanFn: () => true,
  resolveBindingsFn: () => ({
    YUZHOU_DEPARTMENTS_SHA256: "1".repeat(64),
    YUZHOU_POSITIONS_SHA256: "2".repeat(64),
    YUZHOU_EMPLOYEES_SHA256: "3".repeat(64)
  })
};

function fixture() {
  const sandbox = mkdtempSync(join(realpathSync(tmpdir()), "yuzhou-job-state-builder-"));
  chmodSync(sandbox, 0o700);
  const runtime = join(sandbox, "runtime"), stagingRoot = join(runtime, "staging"), evidenceRoot = join(runtime, "evidence");
  const reviewRoot = join(sandbox, "review"), runId = "yzfull-20260828T120000Z-aaaaaaaa-rA";
  for (const path of [runtime, stagingRoot, evidenceRoot, reviewRoot]) { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); }
  const config = {
    formatVersion: 1,
    runId,
    rehearsal: "A",
    backend: "lab",
    triple: { codeSha: "a".repeat(40), sourceSnapshotHash: "b".repeat(64), mappingContractHash: "c".repeat(64) },
    target: { stagingRoot, evidenceRoot }
  };
  const configPath = join(sandbox, "config.json"); writePrivate(configPath, config);
  const staging = join(stagingRoot, `staging-${runId}-t0`); mkdirSync(staging, { mode: 0o700 }); chmodSync(staging, 0o700);
  const counts = [100, 200, 300, 400, 500, 600, 849];
  const states = counts.map((usageCount, index) => ({ sourceCode: `legacy-${index + 1}`, usageCount }));
  const statesPath = join(staging, "employee-job-states.raw.json"), metadataPath = join(staging, "job-state-code-metadata.raw.json");
  writePrivate(statesPath, states); writePrivate(metadataPath, []);
  const manifest = {
    formatVersion: 1,
    generatedAt: "2026-08-28T12:00:00Z",
    domains: {
      employeeJobStates: { rows: 7, file: "employee-job-states.raw.json", fileSha256: sha256(readFileSync(statesPath)) },
      jobStateCodeMetadata: { rows: 0, file: "job-state-code-metadata.raw.json", fileSha256: sha256(readFileSync(metadataPath)) }
    }
  };
  const manifestPath = join(staging, "manifest.json"); writePrivate(manifestPath, manifest);
  const journalPath = join(evidenceRoot, "lifecycle-journal.jsonl");
  writePrivate(journalPath, `${JSON.stringify({ kind: "state", sequence: 3, state: "review_hold", triple: config.triple })}\n`);
  const configSha256 = sha256(pretty({ runId: config.runId, triple: config.triple, target: config.target }));
  const bindingSha256 = sha256(`${JSON.stringify(dependencies.resolveBindingsFn())}\n`);
  const checkpoint = {
    formatVersion: 1,
    status: "REVIEW_HOLD",
    triple: config.triple,
    runs: [
      {
        rehearsal: "A", runId, configSha256, state: "review_hold",
        t0ExtractManifestSha256: sha256(readFileSync(manifestPath)),
        t0ExtractBindingSha256: bindingSha256,
        journalSha256: sha256(readFileSync(journalPath))
      },
      {
        rehearsal: "B", runId: "yzfull-20260828T120001Z-aaaaaaaa-rB", configSha256: "d".repeat(64), state: "review_hold",
        t0ExtractManifestSha256: "e".repeat(64), t0ExtractBindingSha256: "f".repeat(64), journalSha256: "0".repeat(64)
      }
    ],
    productionImport: "HOLD"
  };
  const checkpointPath = join(sandbox, "checkpoint.json"); writePrivate(checkpointPath, checkpoint);
  const rows = states.map(row => ({
    sourceIdentitySha256: sha256(`dbo.person.jobstate\u0000${row.sourceCode.toLowerCase()}`),
    decision: null,
    targetEmploymentStatus: null,
    reasonCode: null
  })).sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const targets = ["active", "probation", "suspended", "departed"];
  rows.forEach((row, index) => {
    if (index < 4) {
      row.decision = "map"; row.targetEmploymentStatus = targets[index]; row.reasonCode = "APPROVED_MAPPING";
    } else {
      row.decision = "quarantine"; row.reasonCode = "UNKNOWN_SOURCE_VALUE";
    }
  });
  const plan = { formatVersion: 1, kind: "yuzhou-job-state-decision-plan", runId, rehearsal: "A", decisions: rows };
  const planPath = join(sandbox, "plan.json"); writePrivate(planPath, plan);
  return {
    sandbox, config, configPath, checkpoint, checkpointPath, plan, planPath, states, statesPath,
    outputPath: join(reviewRoot, "decision-draft.json")
  };
}

const options = value => ({
  configPath: value.configPath,
  checkpointPath: value.checkpointPath,
  decisionPlanPath: value.planPath,
  outputPath: value.outputPath
});
const rejects = (callback, code) => assert.throws(callback, error => error?.code === code);

test("controlled builder emits only a hash-bound DRAFT while approval remains HOLD", () => {
  const value = fixture(), result = buildDraft(options(value), dependencies);
  assert.deepEqual(Object.keys(result).sort(), [
    "artifactSha256", "canonicalDecisionSha256", "detachedHrApproval", "productionImport", "status"
  ]);
  assert.equal(result.status, "DRAFT");
  assert.equal(result.detachedHrApproval, "HOLD");
  assert.equal(result.productionImport, "HOLD");
  assert.equal((statSync(value.outputPath).mode & 0o777), 0o600);
  const artifact = JSON.parse(readFileSync(value.outputPath, "utf8"));
  assert.equal(artifact.artifactStatus, "DRAFT");
  assert.equal(artifact.review.status, "DRAFT");
  assert.equal(artifact.review.reviewerSubjectSha256, null);
  assert.deepEqual(artifact.detachedHrApproval, { required: true, status: "HOLD", attestationSha256: null });
  assert.equal(artifact.sourceContract.sourceRecordCount, 2949);
  assert.equal(artifact.sourceContract.sourceSnapshotSha256, canonicalHash({
    employeeJobStatesSha256: sha256(readFileSync(join(value.sandbox, "runtime/staging", `staging-${value.config.runId}-t0/employee-job-states.raw.json`))),
    jobStateCodeMetadataSha256: sha256(readFileSync(join(value.sandbox, "runtime/staging", `staging-${value.config.runId}-t0/job-state-code-metadata.raw.json`))),
    sourceDistinctStateCount: 7,
    sourceRecordCount: 2949
  }));
  assert.doesNotMatch(JSON.stringify(result), /(?:\/private\/|\/Users\/|legacy-|sourceCode|password|credential)/u);
  assert.doesNotMatch(JSON.stringify(artifact), /legacy-/u);
});

test("verify-draft rebinds the artifact to the current checkpoint and T0 bytes", () => {
  const value = fixture(); buildDraft(options(value), dependencies);
  const result = verifyDraft({ configPath: value.configPath, checkpointPath: value.checkpointPath, artifactPath: value.outputPath }, dependencies);
  assert.equal(result.status, "DRAFT");
  assert.equal(result.productionImport, "HOLD");
  assert.doesNotMatch(JSON.stringify(result), /(?:\/private\/|legacy-|sourceCode)/u);
});

test("unsafe input links, permissions and pre-existing outputs fail closed", () => {
  {
    const value = fixture(), symlink = join(value.sandbox, "plan-link.json"); symlinkSync(value.planPath, symlink);
    rejects(() => buildDraft({ ...options(value), decisionPlanPath: symlink }, dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_UNSAFE");
  }
  {
    const value = fixture(), hardlink = join(value.sandbox, "plan-hardlink.json"); linkSync(value.planPath, hardlink);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_UNSAFE");
  }
  {
    const value = fixture(); chmodSync(value.planPath, 0o640);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_UNSAFE");
  }
  {
    const value = fixture(); writePrivate(value.outputPath, { occupied: true });
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_DRAFT_OUTPUT_EXISTS");
  }
});

test("decision plans cannot carry source values, sensitive fields or unmatched identities", () => {
  {
    const value = fixture(); value.plan.decisions[0].sourceCode = "forbidden"; writePrivate(value.planPath, value.plan);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
  }
  {
    const value = fixture(); value.plan.password = "forbidden"; writePrivate(value.planPath, value.plan);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
  }
  {
    const value = fixture(); value.plan.decisions[0].sourceIdentitySha256 = "9".repeat(64);
    value.plan.decisions.sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
    writePrivate(value.planPath, value.plan);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_DECISION_PLAN_COVERAGE_MISMATCH");
  }
});

test("checkpoint and source-byte drift fail before output is created", () => {
  {
    const value = fixture(); value.checkpoint.runs[0].journalSha256 = "9".repeat(64); writePrivate(value.checkpointPath, value.checkpoint);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_CHECKPOINT_DRIFT");
  }
  {
    const value = fixture(); value.states[0].usageCount += 1; writePrivate(value.statesPath, value.states);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_T0_DRIFT");
  }
});

test("every governed input boundary rejects unsafe identity, links, modes and parents", () => {
  {
    const value = fixture(), alias = join(value.sandbox, "config-link.json"); symlinkSync(value.configPath, alias);
    rejects(() => buildDraft({ ...options(value), configPath: alias }, dependencies), "YUZHOU_JOB_STATE_CONFIG_UNSAFE");
  }
  {
    const value = fixture(), alias = join(value.sandbox, "checkpoint-hardlink.json"); linkSync(value.checkpointPath, alias);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_CHECKPOINT_UNSAFE");
  }
  {
    const value = fixture(); chmodSync(value.statesPath, 0o640);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_T0_UNSAFE");
  }
  {
    const value = fixture();
    const manifest = join(value.sandbox, "runtime/staging", `staging-${value.config.runId}-t0/manifest.json`);
    linkSync(manifest, join(value.sandbox, "manifest-hardlink.json"));
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_T0_UNSAFE");
  }
  {
    const value = fixture(); chmodSync(join(value.sandbox, "runtime/evidence/lifecycle-journal.jsonl"), 0o640);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_JOURNAL_UNSAFE");
  }
  {
    const value = fixture(); chmodSync(value.sandbox, 0o750);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_CONFIG_UNSAFE");
  }
  {
    const value = fixture(), parent = join(value.sandbox, "review"); chmodSync(parent, 0o750);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_DRAFT_OUTPUT_PARENT_UNSAFE");
  }
  {
    const value = fixture(), actual = join(value.sandbox, "actual-review"), alias = join(value.sandbox, "review-alias");
    mkdirSync(actual, { mode: 0o700 }); chmodSync(actual, 0o700); symlinkSync(actual, alias);
    rejects(() => buildDraft({ ...options(value), outputPath: join(alias, "draft.json") }, dependencies), "YUZHOU_JOB_STATE_DRAFT_OUTPUT_PARENT_UNSAFE");
  }
});

test("current C/M and the complete A/B checkpoint identity cannot drift", () => {
  {
    const value = fixture();
    rejects(() => buildDraft(options(value), { ...dependencies, currentCodeShaFn: () => "9".repeat(40) }), "YUZHOU_JOB_STATE_TRIPLE_CURRENT_DRIFT");
  }
  {
    const value = fixture();
    rejects(() => buildDraft(options(value), { ...dependencies, currentMappingHashFn: () => "9".repeat(64) }), "YUZHOU_JOB_STATE_TRIPLE_CURRENT_DRIFT");
  }
  {
    const value = fixture();
    rejects(() => buildDraft(options(value), { ...dependencies, worktreeCleanFn: () => false }), "YUZHOU_JOB_STATE_WORKTREE_DIRTY");
  }
  {
    const value = fixture(); value.checkpoint.runs[1].rehearsal = "A"; writePrivate(value.checkpointPath, value.checkpoint);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_CHECKPOINT_INVALID");
  }
  {
    const value = fixture(); value.checkpoint.runs[0].configSha256 = "9".repeat(64); writePrivate(value.checkpointPath, value.checkpoint);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_CHECKPOINT_DRIFT");
  }
  {
    const value = fixture(); value.checkpoint.runs[0].t0ExtractBindingSha256 = "9".repeat(64); writePrivate(value.checkpointPath, value.checkpoint);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_CHECKPOINT_DRIFT");
  }
  {
    const value = fixture(); value.checkpoint.triple.sourceSnapshotHash = "9".repeat(64); writePrivate(value.checkpointPath, value.checkpoint);
    rejects(() => buildDraft(options(value), dependencies), "YUZHOU_JOB_STATE_CHECKPOINT_INVALID");
  }
});

test("verify-draft rejects REVIEWED or self-approval claims", () => {
  {
    const value = fixture(); buildDraft(options(value), dependencies);
    const artifact = JSON.parse(readFileSync(value.outputPath, "utf8"));
    artifact.artifactStatus = "REVIEWED";
    artifact.review = { status: "REVIEWED", reviewerSubjectSha256: "8".repeat(64), reviewedDecisionSha256: artifact.canonicalDecisionSha256, reviewedAt: "2026-08-28T12:00:00Z" };
    writePrivate(value.outputPath, artifact);
    rejects(() => verifyDraft({ configPath: value.configPath, checkpointPath: value.checkpointPath, artifactPath: value.outputPath }, dependencies), "YUZHOU_JOB_STATE_DRAFT_CONTEXT_DRIFT");
  }
  {
    const value = fixture(); buildDraft(options(value), dependencies);
    const artifact = JSON.parse(readFileSync(value.outputPath, "utf8"));
    artifact.detachedHrApproval.status = "APPROVED";
    writePrivate(value.outputPath, artifact);
    assert.throws(
      () => verifyDraft({ configPath: value.configPath, checkpointPath: value.checkpointPath, artifactPath: value.outputPath }, dependencies),
      /YUZHOU_JOB_STATE_HR_APPROVAL_MUST_BE_DETACHED/u
    );
  }
});

test("implementation binds post-open identities and never performs path-based chmod cleanup", () => {
  const builderPath = resolve(import.meta.dirname, "../hr-cutover/build-yuzhou-job-state-review-package.mjs");
  const source = readFileSync(builderPath, "utf8");
  assert.match(source, /beforeFile = lstatSync[\s\S]*openSync[\s\S]*fstatSync[\s\S]*sameIdentity\(beforeFile, info\)[\s\S]*afterFile = lstatSync/u);
  assert.match(source, /fchmodSync\(fd, 0o600\)[\s\S]*fsyncSync\(fd\)[\s\S]*sameIdentity\(finalFd, finalPath\)/u);
  assert.doesNotMatch(source, /chmodSync\(candidate/u);
  assert.doesNotMatch(source, /unlinkSync/u);
  const failed = spawnSync(process.execPath, [builderPath, "draft", "--config", "/Users/private/source.json", "--checkpoint", "/Users/private/checkpoint.json", "--decision-plan", "/Users/private/plan.json", "--output", "/Users/private/output.json"], { encoding: "utf8" });
  assert.notEqual(failed.status, 0);
  assert.equal(failed.stdout, "");
  assert.match(failed.stderr, /^YUZHOU_[A-Z0-9_]+\n$/u);
  assert.doesNotMatch(failed.stderr, /(?:\/Users\/|source|checkpoint|plan|output)/u);
});

test("a path-swap fault never deletes the replacement or the original private bytes", () => {
  const value = fixture(), preserved = join(value.sandbox, "review", "preserved-draft.json");
  const replacement = { replacement: true };
  rejects(() => buildDraft(options(value), {
    ...dependencies,
    outputFaultHook: ({ outputPath }) => {
      renameSync(outputPath, preserved);
      writePrivate(outputPath, replacement);
    }
  }), "YUZHOU_JOB_STATE_DRAFT_OUTPUT_UNSAFE");
  assert.deepEqual(JSON.parse(readFileSync(value.outputPath, "utf8")), replacement);
  const original = JSON.parse(readFileSync(preserved, "utf8"));
  assert.equal(original.artifactStatus, "DRAFT");
  assert.equal((statSync(value.outputPath).mode & 0o777), 0o600);
  assert.equal((statSync(preserved).mode & 0o777), 0o600);
});
