import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import test, { afterEach } from "node:test";
import {
  EvidenceWriteError, PreliminaryEvidenceRecorderV3, RecordedSubprocessError,
  V3_RUN_ID, executeWithEvidenceV3, redactEvidenceText, runWithFailureBoundary,
} from "../track-b2c-000197-preliminary-executor-v3.mjs";

const roots = [];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const success = (stdout = "ok\n") => ({ status: 0, signal: null, error: null,
  stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) });
const tempEvidence = () => {
  const base = mkdtempSync(resolve("/tmp", "b2c197-v3-"));
  roots.push(base);
  return { base, evidence: resolve(base, "evidence") };
};
const recorder = (options = {}) => {
  const paths = tempEvidence();
  return { paths, value: new PreliminaryEvidenceRecorderV3({
    evidenceRoot: paths.evidence, now: () => "2026-08-01T21:00:00.000Z", ...options,
  }) };
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const filenames = (root) => readdirSync(root).sort();

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

test("writes a wx/0444 intent before spawning and an immutable result before returning", () => {
  const { paths, value } = recorder({ spawn: () => {
    const intent = resolve(paths.evidence, "001-compile-intent.json");
    assert.equal(statSync(intent).mode & 0o777, 0o444);
    assert.equal(json(intent).stage, "compile");
    return success("compiled\n");
  } });
  const result = value.runChild({ stage: "compile", command: "node", args: ["--check", "fixture.ts"],
    cwd: paths.base, env: { PATH: "/safe/bin" }, envAllowlist: [{ name: "PATH", persist: "value" }] });
  assert.equal(result.status, 0);
  assert.deepEqual(filenames(paths.evidence), ["001-compile-intent.json", "001-compile-result.json"]);
  const recorded = json(resolve(paths.evidence, "001-compile-result.json"));
  assert.equal(recorded.stdout.bytes, 9);
  assert.equal(recorded.stdout.raw_sha256, sha256("compiled\n"));
  assert.equal(statSync(resolve(paths.evidence, "001-compile-result.json")).mode & 0o777, 0o444);
});

test("captures compile, connect, before, test and after children as ordered envelopes", () => {
  const { paths, value } = recorder({ spawn: () => success() });
  for (const stage of ["compile", "connect", "before", "test", "after"]) {
    value.runChild({ stage, command: "probe", cwd: paths.base });
  }
  assert.deepEqual(filenames(paths.evidence), [
    "001-compile-intent.json", "001-compile-result.json",
    "002-connect-intent.json", "002-connect-result.json",
    "003-before-intent.json", "003-before-result.json",
    "004-test-intent.json", "004-test-result.json",
    "005-after-intent.json", "005-after-result.json",
  ]);
});

test("persists nonzero exit stdout/stderr and a failure artifact plus manifest before rethrow", () => {
  const { paths, value } = recorder({ spawn: () => ({ status: 7, signal: null, error: null,
    stdout: Buffer.from("tap failure\n"), stderr: Buffer.from("compiler failed\n") }) });
  assert.throws(() => runWithFailureBoundary(value, "approval-child", () => value.runChild({
    stage: "approval-child", command: "node", cwd: paths.base,
  })), RecordedSubprocessError);
  const files = filenames(paths.evidence);
  assert.ok(files.includes(`failure-${V3_RUN_ID}.json`));
  assert.ok(files.includes(`failure-${V3_RUN_ID}.manifest.json`));
  const result = json(resolve(paths.evidence, "001-approval-child-result.json"));
  assert.equal(result.exit_code, 7);
  assert.equal(result.stdout.redacted_utf8, "tap failure\n");
  assert.equal(result.stderr.redacted_utf8, "compiler failed\n");
});

test("persists an exact signal result before throwing", () => {
  const { paths, value } = recorder({ spawn: () => ({ status: null, signal: "SIGTERM", error: null,
    stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) });
  assert.throws(() => value.runChild({ stage: "signal", command: "worker", cwd: paths.base }),
    RecordedSubprocessError);
  assert.equal(json(resolve(paths.evidence, "001-signal-result.json")).signal, "SIGTERM");
});

test("turns a thrown spawn error into an immutable result before throwing", () => {
  const spawnError = Object.assign(new Error("ENOENT spawning tool"), { code: "ENOENT" });
  const { paths, value } = recorder({ spawn: () => { throw spawnError; } });
  assert.throws(() => value.runChild({ stage: "spawn-error", command: "missing", cwd: paths.base }),
    RecordedSubprocessError);
  const result = json(resolve(paths.evidence, "001-spawn-error-result.json"));
  assert.deepEqual(result.spawn_error, { name: "Error", message: "ENOENT spawning tool", code: "ENOENT" });
});

test("fails closed before spawn when intent evidence cannot be written", () => {
  let spawned = false;
  const { paths, value } = recorder({ spawn: () => { spawned = true; return success(); },
    writeFile: () => { throw new Error("disk denied"); } });
  assert.throws(() => value.runChild({ stage: "intent-write", command: "never", cwd: paths.base }),
    EvidenceWriteError);
  assert.equal(spawned, false);
});

test("fails closed and writes terminal failure when post-child evidence writing fails once", () => {
  let writes = 0;
  const { paths, value } = recorder({ spawn: () => success("child-ran\n"),
    writeFile: (path, data, options) => {
      writes += 1;
      if (writes === 2) throw new Error("result disk fault");
      return writeFileSync(path, data, options);
    } });
  assert.throws(() => runWithFailureBoundary(value, "result-write", () => value.runChild({
    stage: "result-write", command: "worker", cwd: paths.base,
  })), EvidenceWriteError);
  assert.ok(filenames(paths.evidence).includes(`failure-${V3_RUN_ID}.json`));
});

test("redacts database URLs, passwords, tokens and nonpersistable environment values", () => {
  const databaseUrl = "postgresql://admin:super-secret@db.internal:5432/jinhu";
  const { paths, value } = recorder({ spawn: () => success(
    `connected ${databaseUrl} password=super-secret token=abc123\n`) });
  value.runChild({ stage: "redaction", command: "client", args: [databaseUrl], cwd: paths.base,
    env: { PATH: "/safe/bin", PROPERTY_APPROVAL_PORT_PG_URL: databaseUrl }, envAllowlist: [
      { name: "PATH", persist: "value" }, { name: "PROPERTY_APPROVAL_PORT_PG_URL", persist: "redacted" },
    ] });
  const combined = filenames(paths.evidence).map((name) =>
    readFileSync(resolve(paths.evidence, name), "utf8")).join("\n");
  assert.doesNotMatch(combined, /super-secret|abc123|postgresql:\/\//u);
  assert.match(combined, /<redacted-database-url>|<redacted-secret>/u);
  assert.equal(redactEvidenceText("password=x token=y"), "password=<redacted> token=<redacted>");
});

test("persists raw TAP bytes and SHA before recording exact parsed counts", () => {
  const tap = "TAP version 13\n1..7\n# tests 7\n# suites 1\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  const counts = { tests: 7, suites: 1, pass: 7, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  const { paths, value } = recorder({ spawn: () => success(tap) });
  const result = value.runChild({ stage: "approval-tap", command: "node", cwd: paths.base,
    tapParser: (raw) => { assert.equal(raw, tap); return counts; } });
  assert.deepEqual(result.tap, counts);
  const evidence = json(resolve(paths.evidence, "001-approval-tap-tap.json"));
  assert.equal(evidence.raw_tap.bytes, Buffer.byteLength(tap));
  assert.equal(evidence.raw_tap.raw_sha256, sha256(tap));
  assert.deepEqual(evidence.parse, { status: "passed", counts });
});

test("persists TAP parse failure and terminal evidence before surfacing the parser error", () => {
  const { paths, value } = recorder({ spawn: () => success("compile-only\n") });
  assert.throws(() => runWithFailureBoundary(value, "tap-parse", () => value.runChild({
    stage: "tap-parse", command: "node", cwd: paths.base,
    tapParser: () => { throw new Error("tap exact7 missing"); },
  })), /tap exact7 missing/);
  assert.equal(json(resolve(paths.evidence, "001-tap-parse-tap.json")).parse.status, "failed");
  assert.ok(filenames(paths.evidence).includes(`failure-${V3_RUN_ID}.manifest.json`));
});

test("success artifact and manifest are immutable and independently reproducible", () => {
  const paths = tempEvidence();
  const { terminal } = executeWithEvidenceV3({ evidenceRoot: paths.evidence,
    recorderOptions: { spawn: () => success(), now: () => "2026-08-01T21:00:00.000Z" },
    operation: (value) => value.runChild({ stage: "probe", command: "probe", cwd: paths.base }),
    successPayload: { scope: "unit-evidence-only" } });
  const artifactBytes = readFileSync(terminal.artifact.path);
  const manifest = json(terminal.manifest.path);
  assert.equal(sha256(artifactBytes), terminal.artifact.raw_sha256);
  assert.equal(manifest.artifact.raw_sha256, terminal.artifact.raw_sha256);
  assert.equal(statSync(terminal.artifact.path).mode & 0o777, 0o444);
  assert.equal(statSync(terminal.manifest.path).mode & 0o777, 0o444);
});
