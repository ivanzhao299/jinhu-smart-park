import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { URL } from "node:url";
import {
  ATTEMPT01_DOCKER_INTENT_SHA256, ATTEMPT01_DOCKER_RESULT_SHA256, ATTEMPT01_EVIDENCE_ROOT,
  ATTEMPT01_FAILURE_MANIFEST_SHA256, ATTEMPT01_FAILURE_TERMINAL_SHA256, ATTEMPT_ID,
  CANDIDATE_PATH, CANDIDATE_SHA256, DATABASE_GO_PATH,
  DATABASE_RECOVERY_REVIEW_PATH, DATABASE_RECOVERY_REVIEW_SHA256, DOCKER_PATH, DOCKER_SHA256,
  DOCKER_VERSION, EVIDENCE_ROOT, EXPECTED_HISTORY, FORMAL_RUN_ID, NODE_PATH, NODE_SHA256,
  HANDOFF_PATH, MANIFEST_PATH, OUTER_EXECUTION_MODE, QA_FAILURE_REVIEW_PATH,
  QA_FAILURE_REVIEW_SHA256, QA_GO_PATH, TARGETS,
  TEST_RECORD_PATH, V1_RUNNER_PATH, V1_RUNNER_SHA256, atomicClaimEvidenceRoot,
  executeClaimedAttempt, parseLoaderSuccess, parseStrictGrammar, staticEnvelope,
  validateContainerInspection, validateEmptyDatabase, validatePostLoad, verifyAuthorizationEnvelope,
} from "../track-b2c-000197-v11-gh-loader-runner-v2.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const runnerSha = "b".repeat(64);
const identity = (target) => [target.topology, target.container, target.containerId,
  target.database, target.volume].join("|");
const grammar = (header, fields) => Buffer.from(`${header}\n${Object.entries(fields)
  .map(([key, value]) => `${key}\t${value}`).join("\n")}\n`);

function authorityBytes(overrides = {}) {
  return grammar("b2c-000197-v11-gh-loader-attempt02-authority-v2", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, execution_authorized: "false",
    formal_go: "false", outer_execution_mode: OUTER_EXECUTION_MODE,
    candidate_raw_sha256: CANDIDATE_SHA256, runner_raw_sha256: runnerSha,
    v1_runner_path: V1_RUNNER_PATH, v1_runner_raw_sha256: V1_RUNNER_SHA256,
    evidence_root: EVIDENCE_ROOT, database_go_path: DATABASE_GO_PATH, qa_go_path: QA_GO_PATH,
    test_record_path: TEST_RECORD_PATH, test_record_raw_sha256: "d".repeat(64),
    manifest_path: MANIFEST_PATH, handoff_path: HANDOFF_PATH,
    database_recovery_review_path: DATABASE_RECOVERY_REVIEW_PATH,
    database_recovery_review_raw_sha256: DATABASE_RECOVERY_REVIEW_SHA256,
    qa_failure_review_path: QA_FAILURE_REVIEW_PATH,
    qa_failure_review_raw_sha256: QA_FAILURE_REVIEW_SHA256,
    attempt01_evidence_root: ATTEMPT01_EVIDENCE_ROOT,
    attempt01_failure_terminal_raw_sha256: ATTEMPT01_FAILURE_TERMINAL_SHA256,
    attempt01_failure_manifest_raw_sha256: ATTEMPT01_FAILURE_MANIFEST_SHA256,
    attempt01_docker_intent_raw_sha256: ATTEMPT01_DOCKER_INTENT_SHA256,
    attempt01_docker_result_raw_sha256: ATTEMPT01_DOCKER_RESULT_SHA256,
    node_path: NODE_PATH, node_raw_sha256: NODE_SHA256, docker_path: DOCKER_PATH,
    docker_raw_sha256: DOCKER_SHA256,
    postgres_image_id: "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
    target_g: identity(TARGETS[0]), target_h: identity(TARGETS[1]), ...overrides,
  });
}
function databaseGoBytes(authority, overrides = {}) {
  return grammar("b2c-000197-v11-gh-loader-attempt02-independent-database-go-v2", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, decision: "GO", execution_authorized: "true",
    formal_go: "false", outer_execution_mode: OUTER_EXECUTION_MODE,
    authority_raw_sha256: sha256(authority), runner_raw_sha256: runnerSha,
    candidate_raw_sha256: CANDIDATE_SHA256, evidence_root: EVIDENCE_ROOT,
    database_recovery_review_raw_sha256: DATABASE_RECOVERY_REVIEW_SHA256,
    qa_failure_review_raw_sha256: QA_FAILURE_REVIEW_SHA256,
    attempt01_failure_terminal_raw_sha256: ATTEMPT01_FAILURE_TERMINAL_SHA256,
    test_record_raw_sha256: "d".repeat(64), manifest_raw_sha256: "e".repeat(64),
    handoff_raw_sha256: "f".repeat(64),
    target_g_raw_sha256: sha256(identity(TARGETS[0])), target_h_raw_sha256: sha256(identity(TARGETS[1])),
    open_p0: "0", open_p1: "0", open_p2: "0",
    reviewer_authority: "independent-database-and-architecture-recovery-reviewer",
    qa_go_path: QA_GO_PATH,
    qa_go_schema: "b2c-000197-v11-gh-loader-attempt02-independent-qa-go-v2", ...overrides,
  });
}
function qaGoBytes(authority, databaseGo, overrides = {}) {
  return grammar("b2c-000197-v11-gh-loader-attempt02-independent-qa-go-v2", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, decision: "GO", execution_authorized: "true",
    formal_go: "false", outer_execution_mode: OUTER_EXECUTION_MODE,
    authority_raw_sha256: sha256(authority), runner_raw_sha256: runnerSha,
    candidate_raw_sha256: CANDIDATE_SHA256, evidence_root: EVIDENCE_ROOT,
    database_recovery_review_raw_sha256: DATABASE_RECOVERY_REVIEW_SHA256,
    qa_failure_review_raw_sha256: QA_FAILURE_REVIEW_SHA256,
    attempt01_failure_terminal_raw_sha256: ATTEMPT01_FAILURE_TERMINAL_SHA256,
    test_record_raw_sha256: "d".repeat(64), manifest_raw_sha256: "e".repeat(64),
    handoff_raw_sha256: "f".repeat(64),
    target_g_raw_sha256: sha256(identity(TARGETS[0])), target_h_raw_sha256: sha256(identity(TARGETS[1])),
    open_p0: "0", open_p1: "0", open_p2: "0", reviewer_authority: "independent-qa-security-reviewer",
    qa_go_path: QA_GO_PATH, qa_go_schema: "b2c-000197-v11-gh-loader-attempt02-independent-qa-go-v2",
    database_go_raw_sha256: sha256(databaseGo), ...overrides,
  });
}
function envelope(overrides = {}) {
  const authority = authorityBytes(overrides.authority);
  const databaseGo = databaseGoBytes(authority, overrides.databaseGo);
  const qaGo = qaGoBytes(authority, databaseGo, overrides.qaGo);
  return { authorityBytes: authority, databaseGoBytes: databaseGo, qaGoBytes: qaGo, runnerSha };
}
function inspectPayload(target, overrides = {}) {
  return JSON.stringify({ id: target.containerId,
    image: "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
    name: `/${target.container}`, status: "running", port_bindings: {}, publish_all_ports: false,
    ports: { "5432/tcp": null }, mounts: [{ Type: "volume", Name: target.volume,
      Destination: "/var/lib/postgresql/data", RW: true }], ...overrides });
}
function emptyPayload(target, overrides = {}) {
  return JSON.stringify({ database: target.database, server_version: "16.14", server_version_num: "160014",
    public_user_relations: 0, primary_history: null, mirror_history: null, approval_table: null,
    other_clients: 0, other_open_transactions: 0, ...overrides });
}
function loaderPayload(overrides = {}) {
  return JSON.stringify({ status: "passed", run_id: FORMAL_RUN_ID, targets: {
    upgrade: { container: TARGETS[0].container, database: TARGETS[0].database },
    fresh: { container: TARGETS[1].container, database: TARGETS[1].database },
  }, ...overrides });
}
function postPayload(target, overrides = {}) {
  return JSON.stringify({ database: target.database, server_version: "16.14",
    primary: EXPECTED_HISTORY, mirror: EXPECTED_HISTORY, failed_or_running: 0,
    optional_191_192: 0, prefix_197: 0, approval_rows: 0,
    indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
    predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
    build_residue: false, ...overrides });
}
const response = (stdout, overrides = {}) => ({ status: 0, signal: null,
  stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), ...overrides });
function successfulSpawn({ mutateStage, mutateResponse } = {}) {
  const stages = [];
  const spawn = (command, args, options) => {
    assert.equal(options.shell, false); let stage; let result;
    if (command === DOCKER_PATH && args[0] === "--version") {
      stage = "docker-version"; result = response(`${DOCKER_VERSION}\n`);
    } else if (command === DOCKER_PATH && args[0] === "inspect") {
      const target = TARGETS.find(({ container }) => container === args[1]);
      stage = `preflight-inspect-${target.key}`; result = response(inspectPayload(target));
    } else if (command === DOCKER_PATH && args[0] === "exec") {
      const target = TARGETS.find(({ container }) => container === args[2]);
      const post = String(options.input).includes("approval_rows");
      stage = `${post ? "postload" : "preflight"}-database-${target.key}`;
      result = response(post ? postPayload(target) : emptyPayload(target));
    } else if (command === NODE_PATH) { stage = "loader"; result = response(`${loaderPayload()}\n`); }
    else throw new Error("unexpected-fake-child");
    stages.push(stage); if (stage === mutateStage) result = mutateResponse(result); return result;
  };
  return { spawn, stages };
}
function withClaim(callback) {
  const parent = mkdtempSync("/tmp/b2c197-gh-loader-v2-"); const evidenceRoot = resolve(parent, "attempt02");
  try { atomicClaimEvidenceRoot(evidenceRoot); return callback(evidenceRoot); }
  finally { rmSync(parent, { recursive: true, force: true }); }
}

test("attempt02 defaults blocked with canonical new root and escalation mode", () => {
  const value = staticEnvelope(); assert.equal(value.execution_authorized, false);
  assert.equal(value.formal_go, false); assert.equal(value.loader_executed, false);
  assert.equal(value.outer_execution_mode, "escalated-full-runner");
  assert.match(value.attempt_id, /attempt02$/u); assert.match(value.evidence_root, /attempt02$/u);
  assert.notEqual(EVIDENCE_ROOT, ATTEMPT01_EVIDENCE_ROOT);
  assert.equal(existsSync(EVIDENCE_ROOT), false); assert.equal(existsSync(DATABASE_GO_PATH), false);
  assert.equal(existsSync(QA_GO_PATH), false);
});

test("frozen v1, reviews, and attempt01 evidence match exact 0444 bindings", () => {
  const files = [[V1_RUNNER_PATH, V1_RUNNER_SHA256],
    [DATABASE_RECOVERY_REVIEW_PATH, DATABASE_RECOVERY_REVIEW_SHA256],
    [QA_FAILURE_REVIEW_PATH, QA_FAILURE_REVIEW_SHA256],
    [resolve(ATTEMPT01_EVIDENCE_ROOT, "001-docker-version-intent.json"), ATTEMPT01_DOCKER_INTENT_SHA256],
    [resolve(ATTEMPT01_EVIDENCE_ROOT, "001-docker-version-result.json"), ATTEMPT01_DOCKER_RESULT_SHA256],
    [resolve(ATTEMPT01_EVIDENCE_ROOT, "failure-b2c197_prelim_20260802g_gh_loader_attempt01.json"),
      ATTEMPT01_FAILURE_TERMINAL_SHA256],
    [resolve(ATTEMPT01_EVIDENCE_ROOT,
      "failure-b2c197_prelim_20260802g_gh_loader_attempt01.manifest.json"), ATTEMPT01_FAILURE_MANIFEST_SHA256]];
  for (const [path, expected] of files) {
    assert.equal(sha256(readFileSync(path)), expected); assert.equal(statSync(path).mode & 0o777, 0o444);
  }
});

test("strict double GO requires escalation mode, review bindings, and attempt02 identity", () => {
  assert.doesNotThrow(() => verifyAuthorizationEnvelope(envelope()));
  for (const value of [envelope({ authority: { outer_execution_mode: "restricted" } }),
    envelope({ databaseGo: { outer_execution_mode: "restricted" } }),
    envelope({ qaGo: { database_recovery_review_raw_sha256: "0".repeat(64) } }),
    envelope({ qaGo: { qa_failure_review_raw_sha256: "0".repeat(64) } }),
    envelope({ databaseGo: { manifest_raw_sha256: "0".repeat(64) } }),
    envelope({ qaGo: { handoff_raw_sha256: "0".repeat(64) } }),
    envelope({ databaseGo: { formal_go: "true" } }), envelope({ qaGo: { open_p1: "1" } }),
    envelope({ qaGo: { database_go_raw_sha256: "0".repeat(64) } }),
    envelope({ databaseGo: { attempt_id: "b2c197_prelim_20260802g_gh_loader_attempt01" } }),
    envelope({ qaGo: { evidence_root: ATTEMPT01_EVIDENCE_ROOT } })]) {
    assert.throws(() => verifyAuthorizationEnvelope(value));
  }
  const missing = envelope(); missing.authorityBytes = Buffer.from(missing.authorityBytes.toString("utf8")
    .replace(/^outer_execution_mode\t.*\n/mu, ""));
  assert.throws(() => verifyAuthorizationEnvelope(missing), /missing:outer_execution_mode/u);
  assert.throws(() => parseStrictGrammar("wrong\na\t1\n", { header: "exact", keys: ["a"] }), /header/u);
});

test("exact G/H immediate preflight fixtures fail closed on identity, no-port, or empty-state drift", () => {
  for (const target of TARGETS) {
    assert.doesNotThrow(() => validateContainerInspection(inspectPayload(target), target));
    assert.doesNotThrow(() => validateEmptyDatabase(emptyPayload(target), target));
  }
  for (const mutation of [{ id: "wrong" }, { ports: { "5432/tcp": [{ HostPort: "5432" }] } },
    { mounts: [] }]) assert.throws(() => validateContainerInspection(inspectPayload(TARGETS[0], mutation), TARGETS[0]));
  for (const mutation of [{ public_user_relations: 1 }, { primary_history: "x" },
    { other_clients: 1 }, { other_open_transactions: 1 }]) {
    assert.throws(() => validateEmptyDatabase(emptyPayload(TARGETS[1], mutation), TARGETS[1]));
  }
});

test("loader JSON and postload exact 195 checks retain 191 192 197 absence", () => {
  assert.equal(parseLoaderSuccess(loaderPayload()).status, "passed");
  assert.doesNotThrow(() => validatePostLoad(postPayload(TARGETS[0]), TARGETS[0]));
  for (const mutation of [{ primary: [] }, { optional_191_192: 1 }, { prefix_197: 1 },
    { failed_or_running: 1 }, { approval_rows: 1 }, { build_residue: true }]) {
    assert.throws(() => validatePostLoad(postPayload(TARGETS[0], mutation), TARGETS[0]));
  }
});

test("fake success uses immediate G/H preflight, one loader, and mode-bound 0444 evidence", () => withClaim((evidenceRoot) => {
  const fake = successfulSpawn(); const result = executeClaimedAttempt({
    candidateBytes: readFileSync(CANDIDATE_PATH), evidenceRoot, spawn: fake.spawn });
  assert.deepEqual(result, { status: "SUCCESS", attempts: 1 });
  assert.deepEqual(fake.stages, ["docker-version", "preflight-inspect-g", "preflight-database-g",
    "preflight-inspect-h", "preflight-database-h", "loader", "postload-database-g", "postload-database-h"]);
  const intent = JSON.parse(readFileSync(resolve(evidenceRoot, "001-docker-version-intent.json")));
  const terminal = JSON.parse(readFileSync(resolve(evidenceRoot, `success-${ATTEMPT_ID}.json`)));
  assert.equal(intent.outer_execution_mode, OUTER_EXECUTION_MODE);
  assert.equal(terminal.outer_execution_mode, OUTER_EXECUTION_MODE);
  assert.equal(terminal.loader_process_attempts, 1); assert.equal(terminal.evidence_entries.length, 16);
  assert.equal(terminal.retry_attempted, false); assert.equal(terminal.cleanup_attempted, false);
  for (const entry of terminal.evidence_entries) {
    assert.equal(statSync(resolve(evidenceRoot, entry.filename)).mode & 0o777, 0o444);
  }
}));

test("preflight drift stops before loader with no retry or cleanup", () => withClaim((evidenceRoot) => {
  const fake = successfulSpawn({ mutateStage: "preflight-database-g",
    mutateResponse: () => response(emptyPayload(TARGETS[0], { other_clients: 1 })) });
  assert.throws(() => executeClaimedAttempt({ candidateBytes: readFileSync(CANDIDATE_PATH),
    evidenceRoot, spawn: fake.spawn }));
  assert.doesNotMatch(fake.stages.join(","), /loader/u);
  const terminal = JSON.parse(readFileSync(resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`)));
  assert.equal(terminal.loader_process_attempts, 0); assert.equal(terminal.attempt_reusable, false);
  assert.equal(terminal.cleanup_attempted, false); assert.equal(terminal.retry_attempted, false);
  assert.equal(terminal.outer_execution_mode, OUTER_EXECUTION_MODE);
}));

test("spawn errors and postload drift stay single-attempt with no cleanup", () => {
  withClaim((evidenceRoot) => {
    const fake = successfulSpawn({ mutateStage: "docker-version",
      mutateResponse: (result) => ({ ...result, error: new Error("spawnSync /usr/bin/docker EPERM") }) });
    assert.throws(() => executeClaimedAttempt({ candidateBytes: readFileSync(CANDIDATE_PATH),
      evidenceRoot, spawn: fake.spawn }));
    assert.equal(fake.stages.includes("loader"), false);
    const terminal = JSON.parse(readFileSync(resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`)));
    assert.equal(terminal.loader_process_attempts, 0); assert.equal(terminal.cleanup_attempted, false);
  });
  withClaim((evidenceRoot) => {
    const fake = successfulSpawn({ mutateStage: "postload-database-h",
      mutateResponse: () => response(postPayload(TARGETS[1], { prefix_197: 1 })) });
    assert.throws(() => executeClaimedAttempt({ candidateBytes: readFileSync(CANDIDATE_PATH),
      evidenceRoot, spawn: fake.spawn }));
    assert.equal(fake.stages.filter((stage) => stage === "loader").length, 1);
    const terminal = JSON.parse(readFileSync(resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`)));
    assert.equal(terminal.loader_process_attempts, 1); assert.equal(terminal.retry_attempted, false);
    assert.equal(terminal.cleanup_attempted, false);
  });
});

test("attempt02 claim is exclusive and source requires exact v2 execute key without shell bypass", () => {
  const parent = mkdtempSync("/tmp/b2c197-gh-loader-v2-claim-"); const evidenceRoot = resolve(parent, "attempt02");
  try {
    assert.equal(atomicClaimEvidenceRoot(evidenceRoot), evidenceRoot);
    assert.throws(() => atomicClaimEvidenceRoot(evidenceRoot), /EEXIST/u);
    assert.throws(() => atomicClaimEvidenceRoot(resolve(parent, "missing", "attempt02")));
  } finally { rmSync(parent, { recursive: true, force: true }); }
  const runner = readFileSync(new URL("../track-b2c-000197-v11-gh-loader-runner-v2.mjs", import.meta.url), "utf8");
  assert.match(runner, /B2C_000197_V11_GH_LOADER_V2_EXECUTE/u);
  assert.match(runner, /shell: false/u); assert.doesNotMatch(runner, /shell:\s*true/u);
});
