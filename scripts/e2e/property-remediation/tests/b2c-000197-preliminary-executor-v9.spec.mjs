import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test, { afterEach } from "node:test";
import {
  PhaseExecutionErrorV9, PreliminaryEvidenceRecorderV9, executeWithEvidenceV9,
  parseTapSummaryV9, runPhasedGateV9,
} from "../track-b2c-000197-preliminary-executor-v9.mjs";

const roots = [];
const temporary = () => { const base = mkdtempSync("/tmp/b2c197-v9-"); roots.push(base);
  return { base, evidence: resolve(base, "evidence") }; };
const success = (stdout = "ok\n") => ({ status: 0, signal: null, error: null,
  stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) });
const evidenceText = (root) => readdirSync(root).sort().map((name) => {
  const path = resolve(root, name); assert.equal(statSync(path).mode & 0o777, 0o444);
  return readFileSync(path, "utf8");
}).join("\n");
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

test("success terminal recursively discovers terminal-only secrets before immutable write", () => {
  const paths = temporary(); const exact = ["terminal-token-51", "terminal-password-72", "terminal-userinfo-93"];
  const result = executeWithEvidenceV9({ evidenceRoot: paths.evidence, operation: () => ({ ok: true }),
    successPayload: { nested: { token: exact[0], env: { PASSWORD: exact[1] },
      argv: [`postgresql://user:${exact[2]}@db/app`] } } });
  assert.equal(statSync(result.terminal.artifact.path).mode & 0o777, 0o444);
  const persisted = evidenceText(paths.evidence);
  for (const secret of exact) assert.ok(!persisted.includes(secret));
  assert.doesNotMatch(persisted, /postgresql:\/\//u);
});

test("failure terminal recursively discovers error and payload secrets before write", () => {
  const paths = temporary(); const exact = "failure-secret-84";
  assert.throws(() => executeWithEvidenceV9({ evidenceRoot: paths.evidence,
    operation: () => { const error = new Error(`failed token=${exact}`); error.stage = "terminal-failure"; throw error; } }),
  /failure-secret/u);
  const persisted = evidenceText(paths.evidence);
  assert.ok(!persisted.includes(exact)); assert.ok(readdirSync(paths.evidence).some((name) => name.startsWith("failure-")));
});

test("benign terminal payload and argv remain readable while negative secret controls stay absent", () => {
  const paths = temporary();
  executeWithEvidenceV9({ evidenceRoot: paths.evidence, operation: () => 1,
    successPayload: { scope: "safe-static-scope", count: 24,
      args: ["--test-reporter=tap", "src/modules/property-approvals/property-approval.port.pg.spec.ts"] } });
  const persisted = evidenceText(paths.evidence);
  assert.match(persisted, /safe-static-scope/u); assert.match(persisted, /"count": 24/u);
  assert.match(persisted, /--test-reporter=tap/u); assert.match(persisted, /property-approval\.port\.pg\.spec\.ts/u);
});

test("inspect output and argv secrets are discovered before result and intent writes", () => {
  const paths = temporary(); const a = "argv-secret-11"; const b = "inspect-secret-22";
  const recorder = new PreliminaryEvidenceRecorderV9({ evidenceRoot: paths.evidence,
    spawn: () => success(`POSTGRES_PASSWORD=${b}\n`) });
  recorder.runChild({ stage: "inspect", command: "docker", args: ["inspect", `token=${a}`], cwd: paths.base,
    parser: () => ({ password: b }) });
  const persisted = evidenceText(paths.evidence);
  assert.ok(!persisted.includes(a)); assert.ok(!persisted.includes(b));
});

test("phase failure keeps exact primary and records cleanup and after first", () => {
  const paths = temporary(); const spawned = [];
  const recorder = new PreliminaryEvidenceRecorderV9({ evidenceRoot: paths.evidence,
    spawn: (_command, args) => { spawned.push(args[0]); return args[0] === "tests" ? { ...success(), status: 3 } : success(); } });
  assert.throws(() => runPhasedGateV9(recorder, {
    phases: ["compile", "connect", "setup", "tests"].map((stage) => ({ stage, command: "probe", args: [stage], cwd: paths.base })),
    cleanupPhases: ["cleanup", "after"].map((stage) => ({ stage, command: "probe", args: [stage], cwd: paths.base })),
  }), (error) => error instanceof PhaseExecutionErrorV9 && error.stage === "tests");
  assert.deepEqual(spawned, ["compile", "connect", "setup", "tests", "cleanup", "after"]);
  assert.ok(readdirSync(paths.evidence).includes("006-after-result.json"));
});

test("direct fixture five uses explicit TAP reporter and parses real spawn output", () => {
  const paths = temporary(); const recorder = new PreliminaryEvidenceRecorderV9({ evidenceRoot: paths.evidence });
  const result = recorder.runChild({ stage: "fixture-five", command: process.execPath,
    args: ["--test-reporter=tap", "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts"],
    cwd: resolve(process.cwd(), "apps/api"), env: { PATH: process.env.PATH },
    envAllowlist: [{ name: "PATH", persist: "value" }],
    parser: (stdout) => parseTapSummaryV9(stdout, { expectedTests: 5 }) });
  assert.equal(result.parsed.tests, 5); assert.equal(result.parsed.suites, 0);
});

test("direct exact-eight real spawn uses explicit TAP reporter", () => {
  const paths = temporary(); const names = Array.from({ length: 8 }, (_, index) => `case-${index + 1}`);
  const code = `const t=require('node:test');${names.map((name) => `t(${JSON.stringify(name)},()=>{});`).join("")}`;
  const recorder = new PreliminaryEvidenceRecorderV9({ evidenceRoot: paths.evidence });
  const result = recorder.runChild({ stage: "exact-eight", command: process.execPath,
    args: ["--test-reporter=tap", "-e", code], cwd: paths.base, env: { PATH: process.env.PATH },
    envAllowlist: [{ name: "PATH", persist: "value" }],
    parser: (stdout) => parseTapSummaryV9(stdout, { expectedTests: 8, expectedNames: names }) });
  assert.deepEqual(result.parsed.names, names);
  const intent = JSON.parse(readFileSync(resolve(paths.evidence, "001-exact-eight-intent.json"), "utf8"));
  const childResult = JSON.parse(readFileSync(resolve(paths.evidence, "001-exact-eight-result.json"), "utf8"));
  const parsed = JSON.parse(readFileSync(resolve(paths.evidence, "001-exact-eight-parse.json"), "utf8"));
  assert.equal(intent.argv[0], "--test-reporter=tap");
  assert.doesNotMatch(childResult.stdout.redacted_utf8, /--test-reporter=tap/u);
  assert.doesNotMatch(childResult.stderr.redacted_utf8, /--test-reporter=tap/u);
  assert.equal(parsed.parse.status, "passed");
});

test("suite count, skipped output and missing names fail closed after parse evidence", () => {
  const base = "# tests 8\n# suites 0\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  for (const invalid of [base.replace("# suites 0", "# suites 1"), base.replace("# skipped 0", "# skipped 1"), base]) {
    const paths = temporary(); const recorder = new PreliminaryEvidenceRecorderV9({ evidenceRoot: paths.evidence,
      spawn: () => success(invalid) });
    assert.throws(() => recorder.runChild({ stage: "invalid", command: "probe", cwd: paths.base,
      parser: (stdout) => parseTapSummaryV9(stdout, { expectedTests: 8, expectedNames: ["required"] }) }),
    PhaseExecutionErrorV9);
    assert.ok(readdirSync(paths.evidence).includes("001-invalid-parse.json"));
  }
});
