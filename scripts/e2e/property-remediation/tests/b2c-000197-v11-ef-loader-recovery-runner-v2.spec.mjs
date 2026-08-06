import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync, mkdirSync, readFileSync, rmSync, statSync,
} from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ATTEMPT_ID, CANDIDATE_BYTES, CANDIDATE_PATH, CANDIDATE_SHA256, EVIDENCE_ROOT,
  FORMAL_RUN_ID, NODE_PATH, atomicClaimEvidenceRootV2, runFrozenLoaderAttemptV2,
  verifyCandidateBytesV2, verifyDockerVersionV2, verifyExecutableV2, verifyGoEnvelopeV2,
} from "../track-b2c-000197-v11-ef-loader-recovery-runner-v2.mjs";

const root = resolve(import.meta.dirname, "../../../..");
const writableTempRoot = "/tmp";
const reviewedPath = resolve(root,
  ".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-r0-fixture-loader-20260802.mjs");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function expectedCandidate() {
  return readFileSync(reviewedPath, "utf8")
    .replace('const runId = "b2c197_r0_20260802a";', `const runId = "${FORMAL_RUN_ID}";`)
    .replace('container: "jinhu-b2c197-r0-20260802a-a"',
      'container: "jinhu-b2c197-prelim-20260802f-e"')
    .replace('database: "jinhu_b2c197_a"', 'database: "jinhu_b2c197_e"')
    .replace('container: "jinhu-b2c197-r0-20260802a-b"',
      'container: "jinhu-b2c197-prelim-20260802f-f"')
    .replace('database: "jinhu_b2c197_b"', 'database: "jinhu_b2c197_f"')
    .replace('spawnSync("docker"', 'spawnSync("/usr/bin/docker"');
}

function authorityBytes() {
  return Buffer.from(`b2c-000197-v11-ef-loader-recovery-authority-v2\nformal_run_id\t${FORMAL_RUN_ID}\nattempt_id\t${ATTEMPT_ID}\nexecution_authorized\tfalse\ncandidate_raw_sha256\t${CANDIDATE_SHA256}\nrecovery_evidence_root\t${EVIDENCE_ROOT}\n`);
}

function goBytes({ decision = "GO", authoritySha = sha256(authorityBytes()), runnerSha = "runner-sha" } = {}) {
  return Buffer.from(`b2c-000197-v11-ef-loader-recovery-independent-qa-go-v2\nformal_run_id\t${FORMAL_RUN_ID}\nattempt_id\t${ATTEMPT_ID}\ndecision\t${decision}\nexecution_authorized\ttrue\nauthority_raw_sha256\t${authoritySha}\nrunner_raw_sha256\t${runnerSha}\ncandidate_raw_sha256\t${CANDIDATE_SHA256}\nrecovery_evidence_root\t${EVIDENCE_ROOT}\nopen_p0\t0\nopen_p1\t0\nopen_p2\t0\n`);
}

function withTempRoot(callback) {
  const parent = mkdtempSync(resolve(writableTempRoot, "b2c197-recovery-v2-test-"));
  const evidenceRoot = resolve(parent, "attempt");
  try {
    atomicClaimEvidenceRootV2(evidenceRoot);
    return callback(evidenceRoot);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

test("candidate is exactly the five target substitutions plus one absolute Docker path", () => {
  const candidate = readFileSync(CANDIDATE_PATH);
  assert.equal(candidate.byteLength, CANDIDATE_BYTES);
  assert.equal(sha256(candidate), CANDIDATE_SHA256);
  assert.equal(candidate.toString("utf8"), expectedCandidate());
  assert.doesNotMatch(candidate.toString("utf8"), /spawnSync\("docker"/u);
  assert.equal(candidate.toString("utf8").match(/spawnSync\("\/usr\/bin\/docker"/gu)?.length, 1);
});

test("missing or incorrect QA GO is rejected", () => {
  assert.throws(() => verifyGoEnvelopeV2({
    authorityBytes: authorityBytes(), goBytes: Buffer.from("header\n"), runnerSha: "runner-sha",
  }), /go-drift:formal_run_id/u);
  assert.throws(() => verifyGoEnvelopeV2({
    authorityBytes: authorityBytes(), goBytes: goBytes({ decision: "NO-GO" }), runnerSha: "runner-sha",
  }), /go-drift:decision/u);
  assert.throws(() => verifyGoEnvelopeV2({
    authorityBytes: authorityBytes(), goBytes: goBytes({ authoritySha: "wrong" }), runnerSha: "runner-sha",
  }), /go-drift:authority_raw_sha256/u);
});

test("tool SHA drift and candidate drift are rejected", () => {
  assert.throws(() => verifyExecutableV2("/tool", "/real/tool", "wrong", "tool", {
    accessSync() {}, realpathSync: () => "/real/tool", readFileSync: () => Buffer.from("tool"),
  }), /tool-sha-drift/u);
  assert.throws(() => verifyDockerVersionV2(() => ({
    status: 0, signal: null, stdout: "Docker version drift", stderr: "",
  })), /docker-version-drift/u);
  const candidate = Buffer.from(readFileSync(CANDIDATE_PATH));
  candidate[0] ^= 1;
  assert.throws(() => verifyCandidateBytesV2(candidate), /candidate-drift/u);
});

test("exclusive root claim rejects an existing root and therefore a second invocation", () => {
  const parent = mkdtempSync(resolve(writableTempRoot, "b2c197-recovery-v2-claim-"));
  const evidenceRoot = resolve(parent, "attempt");
  try {
    atomicClaimEvidenceRootV2(evidenceRoot);
    assert.throws(() => atomicClaimEvidenceRootV2(evidenceRoot), /EEXIST/u);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("nonzero exit writes redacted immutable failure terminal once with no cleanup", () => withTempRoot((evidenceRoot) => {
  let calls = 0;
  assert.throws(() => runFrozenLoaderAttemptV2({
    candidateBytes: readFileSync(CANDIDATE_PATH), evidenceRoot,
    spawn(command, argv, options) {
      calls += 1;
      assert.equal(command, NODE_PATH);
      assert.deepEqual(argv, ["--input-type=module", "-"]);
      assert.equal(options.shell, false);
      return { status: 9, signal: null, stdout: Buffer.alloc(0),
        stderr: Buffer.from("password=hunter2 postgresql://user:pass@host/db") };
    },
  }), /stop-no-retry/u);
  assert.equal(calls, 1);
  const result = readFileSync(resolve(evidenceRoot, "001-loader-result.json"), "utf8");
  assert.doesNotMatch(result, /hunter2|user:pass/u);
  assert.match(result, /<redacted>/u);
  const terminalPath = resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`);
  const terminal = JSON.parse(readFileSync(terminalPath, "utf8"));
  assert.equal(terminal.cleanup_attempted, false);
  assert.equal(terminal.retry_attempted, false);
  assert.equal(terminal.resources_retained, true);
  for (const name of ["001-loader-intent.json", "001-loader-result.json",
    `failure-${ATTEMPT_ID}.json`, `failure-${ATTEMPT_ID}.manifest.json`]) {
    assert.equal(statSync(resolve(evidenceRoot, name)).mode & 0o777, 0o444);
  }
}));

test("signal writes a failure terminal and does not retry", () => withTempRoot((evidenceRoot) => {
  let calls = 0;
  assert.throws(() => runFrozenLoaderAttemptV2({
    candidateBytes: readFileSync(CANDIDATE_PATH), evidenceRoot,
    spawn() {
      calls += 1;
      return { status: null, signal: "SIGTERM", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
  }), /stop-no-retry/u);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(readFileSync(resolve(evidenceRoot,
    `failure-${ATTEMPT_ID}.json`), "utf8")).cleanup_attempted, false);
}));

test("success writes immutable terminal and retains resources without cleanup", () => withTempRoot((evidenceRoot) => {
  let calls = 0;
  const outcome = runFrozenLoaderAttemptV2({
    candidateBytes: readFileSync(CANDIDATE_PATH), evidenceRoot,
    spawn(command, argv, options) {
      calls += 1;
      assert.equal(command, NODE_PATH);
      assert.equal(options.shell, false);
      assert.equal(Buffer.compare(options.input, readFileSync(CANDIDATE_PATH)), 0);
      return { status: 0, signal: null, stdout: Buffer.from('{"status":"passed"}\n'),
        stderr: Buffer.alloc(0) };
    },
  });
  assert.deepEqual(outcome, { status: "passed", attempts: 1 });
  assert.equal(calls, 1);
  const terminal = JSON.parse(readFileSync(resolve(evidenceRoot,
    `success-${ATTEMPT_ID}.json`), "utf8"));
  assert.equal(terminal.cleanup_attempted, false);
  assert.equal(terminal.retry_attempted, false);
  assert.equal(terminal.resources_retained, true);
  assert.equal(statSync(resolve(evidenceRoot,
    `success-${ATTEMPT_ID}.manifest.json`)).mode & 0o777, 0o444);
}));
