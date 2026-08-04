import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { URL } from "node:url";
import {
  ATTEMPT_ID, AUTHORITY_PATH, CANDIDATE_PATH, CANDIDATE_SHA256, DATABASE_GO_PATH,
  DOCKER_PATH, DOCKER_SHA256, DOCKER_VERSION, EVIDENCE_ROOT, EXPECTED_HISTORY, FORMAL_RUN_ID,
  NODE_PATH, NODE_SHA256, QA_GO_PATH, TARGETS, TEST_RECORD_PATH, atomicClaimEvidenceRoot,
  executeClaimedAttempt, parseLoaderSuccess, parseStrictGrammar, staticEnvelope,
  validateContainerInspection, validateEmptyDatabase, validatePostLoad, verifyAuthorizationEnvelope,
} from "../track-b2c-000197-v11-gh-loader-runner-v1.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const runnerSha = "b".repeat(64);
const identity = (target) => [target.topology, target.container, target.containerId,
  target.database, target.volume].join("|");
const grammar = (header, fields) => Buffer.from(`${header}\n${Object.entries(fields)
  .map(([key, value]) => `${key}\t${value}`).join("\n")}\n`);

function authorityBytes(overrides = {}) {
  return grammar("b2c-000197-v11-gh-loader-authority-v1", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, execution_authorized: "false",
    formal_go: "false", candidate_raw_sha256: CANDIDATE_SHA256, runner_raw_sha256: runnerSha,
    evidence_root: EVIDENCE_ROOT, database_go_path: DATABASE_GO_PATH, qa_go_path: QA_GO_PATH,
    test_record_path: TEST_RECORD_PATH, test_record_raw_sha256: "d".repeat(64), node_path: NODE_PATH,
    node_raw_sha256: NODE_SHA256, docker_path: DOCKER_PATH, docker_raw_sha256: DOCKER_SHA256,
    postgres_image_id: "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
    target_g: identity(TARGETS[0]), target_h: identity(TARGETS[1]), ...overrides,
  });
}
function databaseGoBytes(authority, overrides = {}) {
  return grammar("b2c-000197-v11-gh-loader-independent-database-go-v1", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, decision: "GO", execution_authorized: "true",
    formal_go: "false", authority_raw_sha256: sha256(authority), runner_raw_sha256: runnerSha,
    candidate_raw_sha256: CANDIDATE_SHA256, evidence_root: EVIDENCE_ROOT,
    target_g_raw_sha256: sha256(identity(TARGETS[0])), target_h_raw_sha256: sha256(identity(TARGETS[1])),
    open_p0: "0", open_p1: "0", open_p2: "0",
    reviewer_authority: "independent-database-and-architecture-reviewer", qa_go_path: QA_GO_PATH,
    qa_go_schema: "b2c-000197-v11-gh-loader-independent-qa-go-v1", ...overrides,
  });
}
function qaGoBytes(authority, databaseGo, overrides = {}) {
  return grammar("b2c-000197-v11-gh-loader-independent-qa-go-v1", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, decision: "GO", execution_authorized: "true",
    formal_go: "false", authority_raw_sha256: sha256(authority), runner_raw_sha256: runnerSha,
    candidate_raw_sha256: CANDIDATE_SHA256, evidence_root: EVIDENCE_ROOT,
    target_g_raw_sha256: sha256(identity(TARGETS[0])), target_h_raw_sha256: sha256(identity(TARGETS[1])),
    open_p0: "0", open_p1: "0", open_p2: "0", reviewer_authority: "independent-qa-security-reviewer",
    qa_go_path: QA_GO_PATH, qa_go_schema: "b2c-000197-v11-gh-loader-independent-qa-go-v1",
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
  const parent = mkdtempSync("/tmp/b2c197-gh-loader-"); const evidenceRoot = resolve(parent, "attempt01");
  try { atomicClaimEvidenceRoot(evidenceRoot); return callback(evidenceRoot); }
  finally { rmSync(parent, { recursive: true, force: true }); }
}

test("candidate and runner contain only new G/H authority and no prior A-F or E/F identities", () => {
  const candidate = readFileSync(CANDIDATE_PATH, "utf8");
  const runner = readFileSync(new URL("../track-b2c-000197-v11-gh-loader-runner-v1.mjs", import.meta.url), "utf8");
  assert.equal(sha256(Buffer.from(candidate)), CANDIDATE_SHA256);
  assert.match(candidate, /spawnSync\("\/usr\/bin\/docker"/u); assert.match(candidate, /shell: false/u);
  const oldRun = `b2c197_prelim_20260802${"f"}`;
  const oldContainer = `jinhu-b2c197-prelim-20260802${"f"}-[ef]`;
  const oldIds = ["e8cdea7ae9692bc5fe7407026def4675722f6b7379bd4dd8a915625c73c8" + "daaf",
    "485454ceaa64e29fbf737c6b0c4e206c7bb15fb95e601124e754d5c4b5def" + "cfe"];
  for (const source of [candidate, runner]) {
    assert.doesNotMatch(source, new RegExp(oldRun, "u")); assert.doesNotMatch(source, new RegExp(oldContainer, "u"));
    for (const id of oldIds) assert.doesNotMatch(source, new RegExp(id, "u"));
    assert.doesNotMatch(source, /jinhu_b2c197_[a-f]\b/u);
  }
});

test("default is blocked and attempt root remains unclaimed", () => {
  const value = staticEnvelope(); assert.equal(value.execution_authorized, false);
  assert.equal(value.formal_go, false); assert.equal(value.loader_executed, false);
});

test("strict double-GO grammar accepts exact acyclic binding and rejects missing wrong or formal true", () => {
  assert.doesNotThrow(() => verifyAuthorizationEnvelope(envelope()));
  for (const value of [envelope({ databaseGo: { formal_go: "true" } }),
    envelope({ qaGo: { open_p1: "1" } }), envelope({ qaGo: { database_go_raw_sha256: "0".repeat(64) } })]) {
    assert.throws(() => verifyAuthorizationEnvelope(value));
  }
  const missing = envelope(); missing.databaseGoBytes = Buffer.from(missing.databaseGoBytes.toString("utf8")
    .replace(/^formal_go\t.*\n/mu, ""));
  assert.throws(() => verifyAuthorizationEnvelope(missing), /missing:formal_go/u);
  assert.throws(() => parseStrictGrammar("wrong\na\t1\n", { header: "exact", keys: ["a"] }), /header/u);
});

test("container and immediate empty-database validators fail closed on critical drift", () => {
  assert.doesNotThrow(() => validateContainerInspection(inspectPayload(TARGETS[0]), TARGETS[0]));
  assert.doesNotThrow(() => validateEmptyDatabase(emptyPayload(TARGETS[1]), TARGETS[1]));
  for (const mutation of [{ id: "wrong" }, { ports: { "5432/tcp": [{ HostPort: "5432" }] } }, { mounts: [] }]) {
    assert.throws(() => validateContainerInspection(inspectPayload(TARGETS[0], mutation), TARGETS[0]));
  }
  for (const mutation of [{ public_user_relations: 1 }, { primary_history: "x" },
    { other_clients: 1 }, { other_open_transactions: 1 }]) {
    assert.throws(() => validateEmptyDatabase(emptyPayload(TARGETS[1], mutation), TARGETS[1]));
  }
});

test("loader JSON and postload exact 195 invariants reject drift including 191/192/197", () => {
  assert.equal(parseLoaderSuccess(loaderPayload()).status, "passed");
  for (const value of ["", "{} {}", loaderPayload({ run_id: "wrong" }), loaderPayload({ extra: true })]) {
    assert.throws(() => parseLoaderSuccess(value));
  }
  assert.doesNotThrow(() => validatePostLoad(postPayload(TARGETS[0]), TARGETS[0]));
  for (const mutation of [{ primary: [] }, { optional_191_192: 1 }, { prefix_197: 1 },
    { failed_or_running: 1 }, { approval_rows: 1 }, { build_residue: true }]) {
    assert.throws(() => validatePostLoad(postPayload(TARGETS[0], mutation), TARGETS[0]));
  }
});

test("fake success preserves exact G/H stage order, single loader, and immutable terminal", () => withClaim((evidenceRoot) => {
  const fake = successfulSpawn(); const result = executeClaimedAttempt({
    candidateBytes: readFileSync(CANDIDATE_PATH), evidenceRoot, spawn: fake.spawn });
  assert.deepEqual(result, { status: "SUCCESS", attempts: 1 });
  assert.deepEqual(fake.stages, ["docker-version", "preflight-inspect-g", "preflight-database-g",
    "preflight-inspect-h", "preflight-database-h", "loader", "postload-database-g", "postload-database-h"]);
  const terminal = JSON.parse(readFileSync(resolve(evidenceRoot, `success-${ATTEMPT_ID}.json`)));
  assert.equal(terminal.loader_process_attempts, 1); assert.equal(terminal.evidence_entries.length, 16);
  assert.equal(terminal.retry_attempted, false); assert.equal(terminal.cleanup_attempted, false);
  for (const entry of terminal.evidence_entries) assert.equal(statSync(resolve(evidenceRoot, entry.filename)).mode & 0o777, 0o444);
}));

test("preflight drift stops before loader and leaves nonreusable failure without cleanup", () => withClaim((evidenceRoot) => {
  const fake = successfulSpawn({ mutateStage: "preflight-database-g",
    mutateResponse: () => response(emptyPayload(TARGETS[0], { other_clients: 1 })) });
  assert.throws(() => executeClaimedAttempt({ candidateBytes: readFileSync(CANDIDATE_PATH), evidenceRoot, spawn: fake.spawn }));
  assert.doesNotMatch(fake.stages.join(","), /loader/u);
  const terminal = JSON.parse(readFileSync(resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`)));
  assert.equal(terminal.loader_process_attempts, 0); assert.equal(terminal.attempt_reusable, false);
  assert.equal(terminal.cleanup_attempted, false); assert.equal(terminal.retry_attempted, false);
}));

test("loader nonzero, spawn error, malformed output, and postload drift never retry or cleanup", () => {
  for (const mutateResponse of [() => response("", { status: 2, stderr: Buffer.from("password=hunter2") }),
    () => { throw new Error("secret=hidden"); }, () => response("{} {}")]) withClaim((evidenceRoot) => {
    const fake = successfulSpawn({ mutateStage: "loader", mutateResponse });
    assert.throws(() => executeClaimedAttempt({ candidateBytes: readFileSync(CANDIDATE_PATH), evidenceRoot, spawn: fake.spawn }));
    assert.equal(fake.stages.filter((stage) => stage === "loader").length, 1);
    const terminal = readFileSync(resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`), "utf8");
    assert.doesNotMatch(terminal, /hunter2|hidden/u); assert.equal(JSON.parse(terminal).cleanup_attempted, false);
  });
  withClaim((evidenceRoot) => {
    const fake = successfulSpawn({ mutateStage: "postload-database-h",
      mutateResponse: () => response(postPayload(TARGETS[1], { prefix_197: 1 })) });
    assert.throws(() => executeClaimedAttempt({ candidateBytes: readFileSync(CANDIDATE_PATH), evidenceRoot, spawn: fake.spawn }));
    assert.equal(fake.stages.filter((stage) => stage === "loader").length, 1);
  });
});

test("attempt01 atomic claim is exclusive, nonrecursive, and never aliases formal evidence", () => {
  const parent = mkdtempSync("/tmp/b2c197-gh-loader-claim-"); const evidenceRoot = resolve(parent, "attempt01");
  try {
    assert.equal(atomicClaimEvidenceRoot(evidenceRoot), evidenceRoot);
    assert.throws(() => atomicClaimEvidenceRoot(evidenceRoot), /EEXIST/u);
    assert.throws(() => atomicClaimEvidenceRoot(resolve(parent, "missing", "attempt")));
    assert.doesNotMatch(EVIDENCE_ROOT, /formal-evidence/u);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("tool and resource authority are frozen to absolute identities", () => {
  assert.equal(NODE_PATH.startsWith("/"), true); assert.equal(DOCKER_PATH.startsWith("/"), true);
  assert.match(NODE_SHA256, /^[a-f0-9]{64}$/u); assert.match(DOCKER_SHA256, /^[a-f0-9]{64}$/u);
  assert.match(AUTHORITY_PATH, /gh-loader-authority-v1/u); assert.match(DATABASE_GO_PATH, /gh-loader-independent-database-go-v1/u);
  assert.match(QA_GO_PATH, /gh-loader-independent-qa-go-v1/u);
});
