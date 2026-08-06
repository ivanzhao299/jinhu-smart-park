import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ATTEMPT_ID, AUTHORITY_PATH, CANDIDATE_PATH, CANDIDATE_SHA256, DATABASE_GO_PATH,
  DOCKER_PATH, DOCKER_VERSION, EVIDENCE_ROOT, EXPECTED_HISTORY, FORMAL_RUN_ID, NODE_PATH,
  QA_GO_PATH, TARGETS, TEST_RESULT_PATH, atomicClaimEvidenceRootV4, executeClaimedAttemptV4,
  parseLoaderSuccessV4, parseStrictGrammarV4, validateContainerInspectionV4,
  validateEmptyDatabasePreflightV4, validatePostLoadDatabaseV4, verifyAuthorizationEnvelopeV4,
} from "../track-b2c-000197-v11-ef-loader-recovery-runner-v4.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const preflightSha = "a".repeat(64);
const runnerSha = "b".repeat(64);

function grammar(header, fields) {
  return Buffer.from(`${header}\n${Object.entries(fields).map(([key, value]) => `${key}\t${value}`).join("\n")}\n`);
}

function authorityBytes(overrides = {}) {
  return grammar("b2c-000197-v11-ef-loader-recovery-authority-v4-machine", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, execution_authorized: "false",
    candidate_raw_sha256: CANDIDATE_SHA256, runner_raw_sha256: runnerSha,
    preflight_raw_sha256: preflightSha, recovery_evidence_root: EVIDENCE_ROOT,
    database_go_path: DATABASE_GO_PATH, qa_go_path: QA_GO_PATH,
    test_result_path: TEST_RESULT_PATH, test_result_raw_sha256: "d".repeat(64),
    v3_database_no_go_audit_raw_sha256: "b2cc91297a88829d622142063ccb1b3420b245495dd02995a56311d7a3fcf6f5",
    v3_qa_no_go_audit_raw_sha256: "c1b97284fc326e22731717dbe5edace52e78eae5e8645a74d80686362597d864",
    ...overrides,
  });
}

function databaseGoBytes(authority, overrides = {}) {
  return grammar("b2c-000197-v11-ef-loader-recovery-independent-database-go-v4", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, decision: "GO",
    execution_authorized: "true", formal_go: "false", authority_raw_sha256: sha256(authority),
    runner_raw_sha256: runnerSha, candidate_raw_sha256: CANDIDATE_SHA256,
    preflight_raw_sha256: preflightSha, recovery_evidence_root: EVIDENCE_ROOT,
    open_p0: "0", open_p1: "0", open_p2: "0",
    reviewer_authority: "independent-database-and-architecture-reviewer",
    qa_go_path: QA_GO_PATH,
    qa_go_schema: "b2c-000197-v11-ef-loader-recovery-independent-qa-go-v4", ...overrides,
  });
}

function qaGoBytes(authority, databaseGo, overrides = {}) {
  return grammar("b2c-000197-v11-ef-loader-recovery-independent-qa-go-v4", {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, decision: "GO",
    execution_authorized: "true", formal_go: "false", authority_raw_sha256: sha256(authority),
    runner_raw_sha256: runnerSha, candidate_raw_sha256: CANDIDATE_SHA256,
    preflight_raw_sha256: preflightSha, recovery_evidence_root: EVIDENCE_ROOT,
    open_p0: "0", open_p1: "0", open_p2: "0",
    reviewer_authority: "independent-qa-security-reviewer",
    qa_go_path: QA_GO_PATH,
    qa_go_schema: "b2c-000197-v11-ef-loader-recovery-independent-qa-go-v4",
    database_go_raw_sha256: sha256(databaseGo), ...overrides,
  });
}

function validEnvelope(overrides = {}) {
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

function emptyDatabasePayload(target, overrides = {}) {
  return JSON.stringify({ database: target.database, server_version: "16.14",
    server_version_num: "160014", public_user_relations: 0, primary_history: null,
    mirror_history: null, approval_table: null, other_clients: 0,
    other_open_transactions: 0, ...overrides });
}

function loaderPayload(overrides = {}) {
  return JSON.stringify({ status: "passed", run_id: FORMAL_RUN_ID,
    targets: { upgrade: { container: TARGETS[0].container, database: TARGETS[0].database },
      fresh: { container: TARGETS[1].container, database: TARGETS[1].database } }, ...overrides });
}

function postloadPayload(target, overrides = {}) {
  return JSON.stringify({ database: target.database, server_version: "16.14",
    primary: EXPECTED_HISTORY, mirror: EXPECTED_HISTORY, failed_or_running: 0,
    optional_191_192: 0, prefix_197: 0, approval_rows: 0,
    indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
    predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
    build_residue: false, ...overrides });
}

function response(stdout, overrides = {}) {
  return { status: 0, signal: null, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), ...overrides };
}

function successfulSpawn({ mutateStage, mutateResponse } = {}) {
  const stages = [];
  const spawn = (command, args, options) => {
    assert.equal(options.shell, false);
    let stage;
    let result;
    if (command === DOCKER_PATH && args[0] === "--version") {
      stage = "docker-version"; result = response(`${DOCKER_VERSION}\n`);
    } else if (command === DOCKER_PATH && args[0] === "inspect") {
      const target = TARGETS.find(({ container }) => container === args[1]);
      stage = `preflight-inspect-${target.key}`; result = response(inspectPayload(target));
    } else if (command === DOCKER_PATH && args[0] === "exec") {
      const target = TARGETS.find(({ container }) => container === args[2]);
      const postload = String(options.input).includes("approval_rows");
      stage = `${postload ? "postload" : "preflight"}-database-${target.key}`;
      result = response(postload ? postloadPayload(target) : emptyDatabasePayload(target));
    } else if (command === NODE_PATH) {
      stage = "loader"; result = response(`${loaderPayload()}\n`);
    } else throw new Error("unexpected-fake-child");
    stages.push(stage);
    if (stage === mutateStage) result = mutateResponse(result, { command, args, options });
    return result;
  };
  return { spawn, stages };
}

function withClaimedRoot(callback) {
  const parent = mkdtempSync("/tmp/b2c197-recovery-v4-");
  const evidenceRoot = resolve(parent, "attempt04");
  try {
    atomicClaimEvidenceRootV4(evidenceRoot);
    return callback(evidenceRoot);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

test("v2 candidate is reused unchanged and contains only absolute Docker", () => {
  const candidate = readFileSync(CANDIDATE_PATH);
  assert.equal(sha256(candidate), CANDIDATE_SHA256);
  assert.doesNotMatch(candidate.toString("utf8"), /spawnSync\("docker"/u);
  assert.equal(candidate.toString("utf8").match(/spawnSync\("\/usr\/bin\/docker"/gu)?.length, 1);
});

test("strict grammar rejects header drift, unknown, missing, and duplicate keys", () => {
  const schema = { header: "schema-v1", keys: ["a", "b"] };
  assert.deepEqual([...parseStrictGrammarV4("schema-v1\na\t1\nb\t2\n", schema)], [["a", "1"], ["b", "2"]]);
  assert.throws(() => parseStrictGrammarV4("schema-v2\na\t1\nb\t2\n", schema), /header-drift/u);
  assert.throws(() => parseStrictGrammarV4("schema-v1\na\t1\nb\t2\nc\t3\n", schema), /unknown-key:c/u);
  assert.throws(() => parseStrictGrammarV4("schema-v1\na\t1\n", schema), /missing-key:b/u);
  assert.throws(() => parseStrictGrammarV4("schema-v1\na\t1\na\t2\nb\t3\n", schema), /duplicate-key:a/u);
});

test("missing, wrong, conditional, or conflicting database GO is rejected", () => {
  assert.throws(() => verifyAuthorizationEnvelopeV4({ ...validEnvelope(), databaseGoBytes: Buffer.from("") }),
    /header-drift/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({ databaseGo: { decision: "RECOVERABLE-CONDITIONAL" } })),
    /database-go-drift:decision/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({ databaseGo: { open_p1: "1" } })),
    /database-go-drift:open_p1/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({ qaGo: { database_go_raw_sha256: "0".repeat(64) } })),
    /qa-go-drift:database_go_raw_sha256/u);
});

test("formal_go is required, must be false, and unknown aliases fail closed", () => {
  const valid = validEnvelope();
  const missingText = valid.databaseGoBytes.toString("utf8").replace(/^formal_go\t.*\n/mu, "");
  assert.throws(() => verifyAuthorizationEnvelopeV4({ ...valid,
    databaseGoBytes: Buffer.from(missingText) }), /missing-key:formal_go/u);
  const missingQaText = valid.qaGoBytes.toString("utf8").replace(/^formal_go\t.*\n/mu, "");
  assert.throws(() => verifyAuthorizationEnvelopeV4({ ...valid,
    qaGoBytes: Buffer.from(missingQaText) }), /missing-key:formal_go/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({ databaseGo: { formal_go: "true" } })),
    /database-go-drift:formal_go/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({ qaGo: { formal_go: "true" } })),
    /qa-go-drift:formal_go/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({
    qaGo: { formal_go_alias: "false" },
  })), /unknown-key:formal_go_alias/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({
    databaseGo: { formal_go_alias: "false" },
  })), /unknown-key:formal_go_alias/u);
});

test("authority and both GO files must agree on runner SHA and required declarations", () => {
  assert.doesNotThrow(() => verifyAuthorizationEnvelopeV4(validEnvelope()));
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({ authority: { runner_raw_sha256: "c".repeat(64) } })),
    /authority-drift:runner_raw_sha256/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({ databaseGo: { runner_raw_sha256: "c".repeat(64) } })),
    /database-go-drift:runner_raw_sha256/u);
  assert.throws(() => verifyAuthorizationEnvelopeV4(validEnvelope({ qaGo: { runner_raw_sha256: "c".repeat(64) } })),
    /qa-go-drift:runner_raw_sha256/u);
  const malformed = authorityBytes();
  const text = malformed.toString("utf8").replace(/^runner_raw_sha256\t.*\n/mu, "");
  const databaseGo = databaseGoBytes(Buffer.from(text));
  const qaGo = qaGoBytes(Buffer.from(text), databaseGo);
  assert.throws(() => verifyAuthorizationEnvelopeV4({ authorityBytes: Buffer.from(text),
    databaseGoBytes: databaseGo, qaGoBytes: qaGo, runnerSha }), /missing-key:runner_raw_sha256/u);
});

test("container and empty-database preflight validators fail closed on every critical drift class", () => {
  assert.doesNotThrow(() => validateContainerInspectionV4(inspectPayload(TARGETS[0]), TARGETS[0]));
  for (const mutation of [{ id: "wrong" }, { status: "stopped" }, { publish_all_ports: true },
    { ports: { "5432/tcp": [{ HostPort: "5432" }] } }, { mounts: [] }]) {
    assert.throws(() => validateContainerInspectionV4(inspectPayload(TARGETS[0], mutation), TARGETS[0]),
      /container-identity-drift/u);
  }
  assert.doesNotThrow(() => validateEmptyDatabasePreflightV4(emptyDatabasePayload(TARGETS[0]), TARGETS[0]));
  for (const mutation of [{ public_user_relations: 1 }, { primary_history: "history" },
    { approval_table: "approval" }, { other_clients: 1 }, { other_open_transactions: 1 }]) {
    assert.throws(() => validateEmptyDatabasePreflightV4(emptyDatabasePayload(TARGETS[0], mutation), TARGETS[0]),
      /database-preflight-drift/u);
  }
});

test("loader output requires exactly one complete JSON object and exact run and targets", () => {
  assert.equal(parseLoaderSuccessV4(loaderPayload()).status, "SUCCESS");
  for (const value of ["", "{} {}", "not-json", loaderPayload({ status: "SUCCESS" }),
    loaderPayload({ run_id: "wrong" }), loaderPayload({ extra: true }),
    loaderPayload({ targets: { upgrade: { container: "wrong", database: TARGETS[0].database },
      fresh: { container: TARGETS[1].container, database: TARGETS[1].database } } })]) {
    assert.throws(() => parseLoaderSuccessV4(value), /loader-json/u);
  }
});

test("postload validator requires exact 195 history and absence/clean invariants", () => {
  assert.doesNotThrow(() => validatePostLoadDatabaseV4(postloadPayload(TARGETS[0]), TARGETS[0]));
  for (const mutation of [{ primary: [] }, { optional_191_192: 1 }, { prefix_197: 1 },
    { failed_or_running: 1 }, { approval_rows: 1 }, { build_residue: true }, { predicate: "wrong" }]) {
    assert.throws(() => validatePostLoadDatabaseV4(postloadPayload(TARGETS[0], mutation), TARGETS[0]),
      /postload-drift/u);
  }
});

test("successful claimed attempt preserves exact child order and needs both postchecks", () => withClaimedRoot((evidenceRoot) => {
  const fake = successfulSpawn();
  assert.deepEqual(executeClaimedAttemptV4({ candidateBytes: readFileSync(CANDIDATE_PATH),
    evidenceRoot, spawn: fake.spawn }), { status: "SUCCESS", attempts: 1 });
  assert.deepEqual(fake.stages, ["docker-version", "preflight-inspect-e", "preflight-database-e",
    "preflight-inspect-f", "preflight-database-f", "loader", "postload-database-e",
    "postload-database-f"]);
  const terminal = JSON.parse(readFileSync(resolve(evidenceRoot, `success-${ATTEMPT_ID}.json`)));
  assert.equal(terminal.status, "SUCCESS");
  assert.equal(terminal.loader_result.attempt_id, ATTEMPT_ID);
  assert.equal(terminal.cleanup_attempted, false);
  assert.equal(terminal.attempt_reusable, false);
  assert.equal(terminal.evidence_entries.length, 16);
  for (const entry of terminal.evidence_entries) {
    assert.equal(statSync(resolve(evidenceRoot, entry.filename)).mode & 0o777, 0o444);
  }
}));

test("preflight drift claims FAILED terminal before loader and cannot be reused", () => withClaimedRoot((evidenceRoot) => {
  const fake = successfulSpawn({ mutateStage: "preflight-database-e",
    mutateResponse: () => response(emptyDatabasePayload(TARGETS[0], { other_clients: 1 })) });
  assert.throws(() => executeClaimedAttemptV4({ candidateBytes: readFileSync(CANDIDATE_PATH),
    evidenceRoot, spawn: fake.spawn }), /database-preflight-drift/u);
  assert.doesNotMatch(fake.stages.join(","), /loader/u);
  const terminal = JSON.parse(readFileSync(resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`)));
  assert.equal(terminal.loader_process_attempts, 0);
  assert.equal(terminal.attempt_reusable, false);
  assert.equal(terminal.cleanup_attempted, false);
  assert.throws(() => atomicClaimEvidenceRootV4(evidenceRoot), /EEXIST/u);
}));

test("nonzero, signal, spawn error, malformed success, and postload drift each stop after one loader", () => {
  const cases = [
    ["nonzero", () => response("", { status: 2, stderr: Buffer.from("password=hunter2") })],
    ["signal", () => response("", { status: null, signal: "SIGTERM" })],
    ["spawn", () => { throw new Error("secret=hidden"); }],
    ["malformed", () => response("{} {}")],
  ];
  for (const [, mutateResponse] of cases) withClaimedRoot((evidenceRoot) => {
    const fake = successfulSpawn({ mutateStage: "loader", mutateResponse });
    assert.throws(() => executeClaimedAttemptV4({ candidateBytes: readFileSync(CANDIDATE_PATH),
      evidenceRoot, spawn: fake.spawn }));
    assert.equal(fake.stages.filter((stage) => stage === "loader").length, 1);
    assert.doesNotMatch(fake.stages.join(","), /postload/u);
    const terminal = readFileSync(resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`), "utf8");
    assert.doesNotMatch(terminal, /hunter2|hidden/u);
    assert.equal(JSON.parse(terminal).cleanup_attempted, false);
  });
  withClaimedRoot((evidenceRoot) => {
    const fake = successfulSpawn({ mutateStage: "postload-database-f",
      mutateResponse: () => response(postloadPayload(TARGETS[1], { prefix_197: 1 })) });
    assert.throws(() => executeClaimedAttemptV4({ candidateBytes: readFileSync(CANDIDATE_PATH),
      evidenceRoot, spawn: fake.spawn }), /postload-drift/u);
    assert.equal(fake.stages.filter((stage) => stage === "loader").length, 1);
    assert.equal(JSON.parse(readFileSync(resolve(evidenceRoot,
      `failure-${ATTEMPT_ID}.json`))).cleanup_attempted, false);
  });
});

test("attempt04 root claim is exclusive and second invocation is refused", () => {
  const parent = mkdtempSync("/tmp/b2c197-recovery-v4-claim-");
  const evidenceRoot = resolve(parent, "attempt04");
  try {
    atomicClaimEvidenceRootV4(evidenceRoot);
    assert.throws(() => atomicClaimEvidenceRootV4(evidenceRoot), /EEXIST/u);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("v4 authority and GO paths are distinct from prior versions and not silently aliased", () => {
  assert.match(AUTHORITY_PATH, /authority-v4/u);
  assert.match(DATABASE_GO_PATH, /database-go-v4/u);
  assert.match(QA_GO_PATH, /qa-go-v4/u);
});
