import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ATTEMPT_ID, CONFLICT_KEYS, FORMAL_RUN_ID, LAUNCH_ENVIRONMENT, NODE_PATH,
  ORCHESTRATOR_PATH, FormalLaunchEvidenceRecorder, atomicClaimLaunchAttempt,
  buildLaunchEnvironment, executeClaimedLaunch, parseStrictLaunchGrammar,
  redactLaunchEvidence, staticLaunchEnvelope, verifyExactLaunchFiles, verifyLaunchQa,
} from "../track-b2c-000197-v11-v5-formal-launcher.mjs";

const temporaryRoot = () => mkdtempSync("/tmp/b2c197-v11-v5-launch-");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const qaBindings = Object.freeze({
  launcher_raw_sha256: "a".repeat(64), launcher_authority_raw_sha256: "b".repeat(64),
  launcher_handoff_raw_sha256: "c".repeat(64), launcher_manifest_raw_sha256: "d".repeat(64),
  launcher_test_record_raw_sha256: "e".repeat(64),
});
const qaText = (patch = {}) => {
  const fields = {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID,
    launch_contract_handoff_raw_sha256: "39b899a181e9d420220428733566b79a4200700a7a42e204ad89613fba5bd0ae",
    candidate_manifest_raw_sha256: "e6d79fc1581ba580932b4689095117ffd2b482d33f5809c71964102f7b5af017",
    candidate_handoff_raw_sha256: "81c23cb59cd602e762d763da80beab699505a54c89c8175ef8d39c45e1460c60",
    database_go_raw_sha256: "77f1d3dc8fb42aae2a48385caa22acb385671e6fe02ad941b7bdaf7c116790a7",
    qa_go_raw_sha256: "5ab20a43d84e32f6436686972af602b21abb5a4dc1f73d1fa81c670145de144f",
    drain_go_raw_sha256: "03cd70e5690b1ecb7acef85b546f3dc5583b2b79fd3ec781cb26982748e206b2",
    node_path: NODE_PATH,
    node_raw_sha256: "3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327",
    orchestrator_path: ORCHESTRATOR_PATH,
    orchestrator_raw_sha256: "88e430267c061d77143aee5f4e6677d848e924ece677ff2820655c6f5f3b7e5d",
    ...qaBindings, reviewer_authority: "independent-formal-launch-qa-security-reviewer",
    formal_go: "true", execution_authorized: "true", decision: "GO",
    open_p0: "0", open_p1: "0", open_p2: "0", ...patch,
  };
  return ["b2c-000197-v11-v5-formal-launch-independent-qa-go-v1",
    ...Object.entries(fields).map(([key, value]) => `${key}\t${value}`), ""].join("\n");
};

test("default envelope is blocked and cannot authorize formal execution", () => {
  const envelope = staticLaunchEnvelope();
  assert.equal(envelope.execution_authorized, false);
  assert.equal(envelope.formal_execution_started, false);
  assert.match(envelope.status, /blocked-awaiting-independent-formal-launch-qa-go/u);
});

test("child launch environment contains exact eight authorization keys and four conflicts are absent", () => {
  const environment = buildLaunchEnvironment({ PATH: "/ignored" });
  const authorization = Object.fromEntries(Object.entries(environment)
    .filter(([key]) => key.startsWith("B2C_000197_")));
  assert.deepEqual(authorization, LAUNCH_ENVIRONMENT);
  assert.equal(Object.keys(authorization).length, 8);
  for (const key of CONFLICT_KEYS) assert.equal(Object.hasOwn(environment, key), false);
});

test("all four conflicting modes fail closed", () => {
  for (const key of CONFLICT_KEYS) {
    assert.throws(() => buildLaunchEnvironment({ [key]: "" }), new RegExp(`launch-conflict:${key}`));
  }
});

test("missing and wrong frozen candidate or GO inputs fail closed", () => {
  const root = temporaryRoot(); const good = resolve(root, "good.grammar");
  writeFileSync(good, "exact\n");
  const exactSha = createHash("sha256").update("exact\n").digest("hex");
  assert.equal(verifyExactLaunchFiles({ candidate: { path: good, rawSha256: exactSha } }), true);
  assert.throws(() => verifyExactLaunchFiles({ candidate: {
    path: resolve(root, "missing.grammar"), rawSha256: exactSha,
  } }), /input-drift:candidate/u);
  assert.throws(() => verifyExactLaunchFiles({ databaseGo: {
    path: good, rawSha256: "0".repeat(64),
  } }), /input-drift:databaseGo/u);
});

test("launch QA exact grammar accepts only complete exact GO", () => {
  assert.equal(verifyLaunchQa(qaText(), qaBindings).decision, "GO");
  for (const patch of [{ formal_go: "false" }, { execution_authorized: "false" },
    { decision: "NO_GO" }, { open_p1: "1" }, { drain_go_raw_sha256: "wrong" }]) {
    assert.throws(() => verifyLaunchQa(qaText(patch), qaBindings));
  }
  const missing = qaText().split("\n").filter((line) => !line.startsWith("open_p2\t")).join("\n");
  assert.throws(() => verifyLaunchQa(missing, qaBindings), /field-count/u);
  assert.throws(() => parseStrictLaunchGrammar(`${qaText()}unknown\tx\n`,
    "b2c-000197-v11-v5-formal-launch-independent-qa-go-v1"), /unknown/u);
});

test("atomic launch claim is independent, exclusive and nonrecursive", () => {
  const parent = temporaryRoot(); const evidenceRoot = resolve(parent, "launch-attempt01");
  assert.equal(atomicClaimLaunchAttempt(evidenceRoot), evidenceRoot);
  assert.equal(statSync(evidenceRoot).isDirectory(), true);
  assert.throws(() => atomicClaimLaunchAttempt(evidenceRoot));
  assert.throws(() => atomicClaimLaunchAttempt(resolve(parent, "missing-parent", "attempt")));
});

test("fake success uses absolute Node and orchestrator, shell false, one spawn and 0444 terminal", () => {
  const evidenceRoot = resolve(temporaryRoot(), "launch-attempt01"); mkdirSync(evidenceRoot);
  const calls = [];
  const result = executeClaimedLaunch({ evidenceRoot, environment: {},
    now: () => "2026-08-02T04:00:00Z",
    spawn: (command, argv, options) => {
      calls.push({ command, argv, options });
      return { status: 0, signal: null, stdout: Buffer.from("ok\n"), stderr: Buffer.alloc(0) };
    } });
  assert.equal(result.spawnAttempts, 1); assert.equal(calls.length, 1);
  assert.equal(calls[0].command, NODE_PATH); assert.deepEqual(calls[0].argv, [ORCHESTRATOR_PATH]);
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(Object.fromEntries(Object.entries(calls[0].options.env)
    .filter(([key]) => key.startsWith("B2C_000197_"))), LAUNCH_ENVIRONMENT);
  const files = readdirSync(evidenceRoot).sort();
  assert.equal(files.length, 4);
  for (const file of files) assert.equal(statSync(resolve(evidenceRoot, file)).mode & 0o777, 0o444);
  const terminal = readJson(resolve(evidenceRoot, `success-${ATTEMPT_ID}.json`));
  assert.equal(terminal.status, "SUCCESS"); assert.equal(terminal.spawn_attempts, 1);
  assert.equal(terminal.retry_attempted, false); assert.equal(terminal.cleanup_attempted, false);
});

test("fake failure writes one immutable failure terminal with no retry or cleanup", () => {
  const evidenceRoot = resolve(temporaryRoot(), "launch-attempt01"); mkdirSync(evidenceRoot);
  let calls = 0;
  assert.throws(() => executeClaimedLaunch({ evidenceRoot, environment: {},
    spawn: () => { calls += 1; return { status: 9, signal: null,
      stdout: Buffer.alloc(0), stderr: Buffer.from("password=hunter2\n") }; } }), /child-failed/u);
  assert.equal(calls, 1);
  const terminal = readJson(resolve(evidenceRoot, `failure-${ATTEMPT_ID}.json`));
  assert.equal(terminal.status, "FAILED"); assert.equal(terminal.spawn_attempts, 1);
  assert.equal(terminal.retry_attempted, false); assert.equal(terminal.cleanup_attempted, false);
  const result = readJson(resolve(evidenceRoot, "002-formal-launch-result.json"));
  assert.doesNotMatch(JSON.stringify(result), /hunter2/u); assert.match(result.stderr.redacted_utf8, /<redacted>/u);
  for (const file of readdirSync(evidenceRoot)) {
    assert.equal(statSync(resolve(evidenceRoot, file)).mode & 0o777, 0o444);
  }
});

test("evidence rejects unredacted secrets and launch argv contains no credentials", () => {
  assert.equal(redactLaunchEvidence("postgresql://u:p@db/x"), "<redacted-database-url>");
  const evidenceRoot = resolve(temporaryRoot(), "launch-attempt01"); mkdirSync(evidenceRoot);
  const recorder = new FormalLaunchEvidenceRecorder(evidenceRoot);
  assert.throws(() => recorder.write("bad.json", { value: "token=raw-secret" }), /secret-leak/u);
  const cleanEvidenceRoot = resolve(temporaryRoot(), "launch-attempt02"); mkdirSync(cleanEvidenceRoot);
  executeClaimedLaunch({ evidenceRoot: cleanEvidenceRoot, environment: {},
    spawn: (command, argv) => {
      assert.equal(command, NODE_PATH); assert.deepEqual(argv, [ORCHESTRATOR_PATH]);
      assert.doesNotMatch(`${command} ${argv.join(" ")}`, /password|secret|token|postgresql:/iu);
      return { status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
  });
});
