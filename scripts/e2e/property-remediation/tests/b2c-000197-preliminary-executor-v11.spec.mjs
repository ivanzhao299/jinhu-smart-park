import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test, { afterEach } from "node:test";
import {
  PhaseExecutionErrorV11, PreliminaryEvidenceRecorderV11, executeWithEvidenceV11,
  parseTapSummaryV11, runPhasedGateV11,
} from "../track-b2c-000197-preliminary-executor-v11.mjs";
import { validateFaultBoundaryV11 } from "../track-b2c-000197-preliminary-orchestrator-v11.mjs";

const roots = [];
const temporary = () => { const base = mkdtempSync("/tmp/b2c197-v11-"); roots.push(base);
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
  const result = executeWithEvidenceV11({ evidenceRoot: paths.evidence, operation: () => ({ ok: true }),
    successPayload: { nested: { token: exact[0], env: { PASSWORD: exact[1] },
      argv: [`postgresql://user:${exact[2]}@db/app`] } } });
  assert.equal(statSync(result.terminal.artifact.path).mode & 0o777, 0o444);
  const persisted = evidenceText(paths.evidence);
  for (const secret of exact) assert.ok(!persisted.includes(secret));
  assert.doesNotMatch(persisted, /postgresql:\/\//u);
});

test("failure terminal recursively discovers error and payload secrets before write", () => {
  const paths = temporary(); const exact = "failure-secret-84";
  assert.throws(() => executeWithEvidenceV11({ evidenceRoot: paths.evidence,
    operation: () => { const error = new Error(`failed token=${exact}`); error.stage = "terminal-failure"; throw error; } }),
  /failure-secret/u);
  const persisted = evidenceText(paths.evidence);
  assert.ok(!persisted.includes(exact)); assert.ok(readdirSync(paths.evidence).some((name) => name.startsWith("failure-")));
});

test("failure terminal records exact safe child SQLSTATE and marker summary without raw stderr", () => {
  const paths = temporary(); const secret = "postgresql://user:terminal-secret@db/app";
  assert.throws(() => executeWithEvidenceV11({ evidenceRoot: paths.evidence, operation: () => {
    const error = new Error(`fault rejected ${secret}`); error.stage = "fault-e-before-create";
    error.childSummary = { stage: error.stage, target: "e", boundary: "before-create", sqlstate: "P0001",
      expected_marker: "v11-injected-before-create", observed_markers: ["v11-injected-before-create"],
      exit_code: 3, signal: null, sqlstate_valid: true, marker_valid: true, child_valid: true,
      snapshot_checked: true, snapshot_exact: true, stderr: `ERROR ${secret}` };
    throw error;
  } }), /fault rejected/u);
  const terminalName = readdirSync(paths.evidence).find((name) => name.startsWith("failure-") && !name.includes("manifest"));
  const terminal = JSON.parse(readFileSync(resolve(paths.evidence, terminalName), "utf8"));
  assert.deepEqual(terminal.child_failure_summary, { stage: "fault-e-before-create", target: "e",
    boundary: "before-create", sqlstate: "P0001", expected_marker: "v11-injected-before-create",
    observed_markers: ["v11-injected-before-create"], exit_code: 3, signal: null,
    sqlstate_valid: true, marker_valid: true, child_valid: true,
    snapshot_checked: true, snapshot_exact: true });
  assert.equal("stderr" in terminal.child_failure_summary, false);
  assert.ok(!evidenceText(paths.evidence).includes("terminal-secret"));
});

test("benign terminal payload and argv remain readable while negative secret controls stay absent", () => {
  const paths = temporary();
  executeWithEvidenceV11({ evidenceRoot: paths.evidence, operation: () => 1,
    successPayload: { scope: "safe-static-scope", count: 24,
      args: ["--test-reporter=tap", "src/modules/property-approvals/property-approval.port.pg.spec.ts"] } });
  const persisted = evidenceText(paths.evidence);
  assert.match(persisted, /safe-static-scope/u); assert.match(persisted, /"count": 24/u);
  assert.match(persisted, /--test-reporter=tap/u); assert.match(persisted, /property-approval\.port\.pg\.spec\.ts/u);
});

test("inspect output and argv secrets are discovered before result and intent writes", () => {
  const paths = temporary(); const a = "argv-secret-11"; const b = "inspect-secret-22";
  const recorder = new PreliminaryEvidenceRecorderV11({ evidenceRoot: paths.evidence,
    spawn: () => success(`POSTGRES_PASSWORD=${b}\n`) });
  recorder.runChild({ stage: "inspect", command: "docker", args: ["inspect", `token=${a}`], cwd: paths.base,
    parser: () => ({ password: b }) });
  const persisted = evidenceText(paths.evidence);
  assert.ok(!persisted.includes(a)); assert.ok(!persisted.includes(b));
});

test("phase failure keeps exact primary and records cleanup and after first", () => {
  const paths = temporary(); const spawned = [];
  const recorder = new PreliminaryEvidenceRecorderV11({ evidenceRoot: paths.evidence,
    spawn: (_command, args) => { spawned.push(args[0]); return args[0] === "tests" ? { ...success(), status: 3 } : success(); } });
  assert.throws(() => runPhasedGateV11(recorder, {
    phases: ["compile", "connect", "setup", "tests"].map((stage) => ({ stage, command: "probe", args: [stage], cwd: paths.base })),
    cleanupPhases: ["cleanup", "after"].map((stage) => ({ stage, command: "probe", args: [stage], cwd: paths.base })),
  }), (error) => error instanceof PhaseExecutionErrorV11 && error.stage === "tests");
  assert.deepEqual(spawned, ["compile", "connect", "setup", "tests", "cleanup", "after"]);
  assert.ok(readdirSync(paths.evidence).includes("006-after-result.json"));
});

const tap = (names) => ["TAP version 13", ...names.flatMap((name, index) =>
  [`# Subtest: ${name}`, `ok ${index + 1} - ${name}`]), `1..${names.length}`, `# tests ${names.length}`,
  "# suites 0", `# pass ${names.length}`, "# fail 0", "# cancelled 0", "# skipped 0", "# todo 0", ""].join("\n");

test("direct fixture five intent uses explicit TAP reporter and parses exact child output", () => {
  const paths = temporary(); const recorder = new PreliminaryEvidenceRecorderV11({ evidenceRoot: paths.evidence,
    spawn: () => success(tap(Array.from({ length: 5 }, (_, index) => `fixture-${index + 1}`))) });
  const result = recorder.runChild({ stage: "fixture-five", command: process.execPath,
    args: ["--test", "--test-reporter=tap", "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts"],
    cwd: resolve(process.cwd(), "apps/api"), env: { PATH: process.env.PATH },
    envAllowlist: [{ name: "PATH", persist: "value" }],
    parser: (stdout) => parseTapSummaryV11(stdout, { expectedTests: 5 }) });
  assert.equal(result.parsed.tests, 5); assert.equal(result.parsed.suites, 0);
});

test("direct exact-eight intent uses explicit TAP reporter", () => {
  const paths = temporary(); const names = Array.from({ length: 8 }, (_, index) => `case-${index + 1}`);
  const spec = resolve(paths.base, "exact-eight.spec.cjs");
  const recorder = new PreliminaryEvidenceRecorderV11({ evidenceRoot: paths.evidence,
    spawn: () => success(tap(names)) });
  const result = recorder.runChild({ stage: "exact-eight", command: process.execPath,
    args: ["--test", "--test-reporter=tap", spec], cwd: paths.base, env: { PATH: process.env.PATH },
    envAllowlist: [{ name: "PATH", persist: "value" }],
    parser: (stdout) => parseTapSummaryV11(stdout, { expectedTests: 8, expectedNames: names }) });
  assert.deepEqual(result.parsed.names, names);
  const intent = JSON.parse(readFileSync(resolve(paths.evidence, "001-exact-eight-intent.json"), "utf8"));
  const childResult = JSON.parse(readFileSync(resolve(paths.evidence, "001-exact-eight-result.json"), "utf8"));
  const parsed = JSON.parse(readFileSync(resolve(paths.evidence, "001-exact-eight-parse.json"), "utf8"));
  assert.deepEqual(intent.argv.slice(0, 2), ["--test", "--test-reporter=tap"]);
  assert.doesNotMatch(childResult.stdout.redacted_utf8, /--test-reporter=tap/u);
  assert.doesNotMatch(childResult.stderr.redacted_utf8, /--test-reporter=tap/u);
  assert.equal(parsed.parse.status, "passed");
});

test("suite count, skipped output and missing names fail closed after parse evidence", () => {
  const base = "# tests 8\n# suites 0\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  for (const invalid of [base.replace("# suites 0", "# suites 1"), base.replace("# skipped 0", "# skipped 1"), base]) {
    const paths = temporary(); const recorder = new PreliminaryEvidenceRecorderV11({ evidenceRoot: paths.evidence,
      spawn: () => success(invalid) });
    assert.throws(() => recorder.runChild({ stage: "invalid", command: "probe", cwd: paths.base,
      parser: (stdout) => parseTapSummaryV11(stdout, { expectedTests: 8, expectedNames: ["required"] }) }),
    PhaseExecutionErrorV11);
    assert.ok(readdirSync(paths.evidence).includes("001-invalid-parse.json"));
  }
});

test("integrated fault failures persist truthful child and after-snapshot state without secrets", () => {
  const baseline = { history_primary: null, history_mirror: null, approval_rows: 0, indexdef: "old",
    predicate: "old", build_residue: false }; const marker = "v11-injected-before-create";
  const cases = [
    { name: "wrong-sqlstate", stderr: `ERROR:  42883: ${marker}\n`, after: baseline,
      sqlstateValid: false, markerValid: true, childValid: false, checked: true, exact: true },
    { name: "missing-marker", stderr: "ERROR:  P0001: assertion\n", after: baseline,
      sqlstateValid: true, markerValid: false, childValid: false, checked: true, exact: true },
    { name: "wrong-marker", stderr: "ERROR:  P0001: v11-injected-after-create\n", after: baseline,
      sqlstateValid: true, markerValid: false, childValid: false, checked: true, exact: true },
    { name: "duplicate-marker", stderr: `ERROR:  P0001: ${marker} v11-injected-after-create\n`, after: baseline,
      sqlstateValid: true, markerValid: false, childValid: false, checked: true, exact: true },
    { name: "snapshot-drift", stderr: `ERROR:  P0001: ${marker}\npassword=child-secret`,
      after: { ...baseline, build_residue: true }, sqlstateValid: true, markerValid: true,
      childValid: true, checked: true, exact: false },
    { name: "snapshot-read-failure", stderr: `ERROR:  P0001: ${marker}\n`, readFailure: true,
      sqlstateValid: true, markerValid: true, childValid: true, checked: false, exact: null },
  ];
  for (const entry of cases) {
    const paths = temporary(); let readCount = 0; let assertCount = 0; let laterCount = 0;
    assert.throws(() => executeWithEvidenceV11({ evidenceRoot: paths.evidence, operation: () => {
      validateFaultBoundaryV11({ result: { status: 3, signal: null, error: null,
        stdout: Buffer.alloc(0), stderr: Buffer.from(entry.stderr) },
        expectedMarker: marker, before: baseline, readAfter: () => {
          readCount += 1;
          if (entry.readFailure) throw new Error("snapshot read password=read-secret postgresql://reader:db-secret@db/app");
          return entry.after;
        },
        assertAfter: () => { assertCount += 1; }, target: { key: "e" },
        boundary: "before-create", stage: "fault-e-before-create" });
      laterCount += 1;
    } }));
    const file = readdirSync(paths.evidence).find((entry) => entry.startsWith("failure-") && !entry.includes("manifest"));
    const terminal = JSON.parse(readFileSync(resolve(paths.evidence, file), "utf8"));
    assert.equal(readCount, 1, entry.name);
    assert.equal(assertCount, entry.readFailure ? 0 : 1, entry.name);
    assert.equal(laterCount, 0, entry.name);
    assert.equal(terminal.failure_stage, "fault-e-before-create", entry.name);
    assert.equal(terminal.child_failure_summary.stage, "fault-e-before-create", entry.name);
    assert.equal(terminal.child_failure_summary.target, "e", entry.name);
    assert.equal(terminal.child_failure_summary.boundary, "before-create", entry.name);
    assert.equal(terminal.child_failure_summary.sqlstate_valid, entry.sqlstateValid, entry.name);
    assert.equal(terminal.child_failure_summary.marker_valid, entry.markerValid, entry.name);
    assert.equal(terminal.child_failure_summary.child_valid, entry.childValid, entry.name);
    assert.equal(terminal.child_failure_summary.snapshot_checked, entry.checked, entry.name);
    assert.equal(terminal.child_failure_summary.snapshot_exact, entry.exact, entry.name);
    assert.equal(terminal.child_failure_summary.exit_code, 3, entry.name);
    const persisted = evidenceText(paths.evidence);
    for (const secret of ["child-secret", "read-secret", "db-secret"]) assert.ok(!persisted.includes(secret), entry.name);
    assert.ok(!persisted.includes("postgresql://reader:db-secret@db/app"), entry.name);
    assert.ok(!JSON.stringify(terminal).includes(entry.stderr), entry.name);
    if (entry.readFailure) {
      assert.match(terminal.cause.message, /snapshot read/u);
      assert.match(terminal.cause.message, /<redacted-secret>/u);
      assert.match(terminal.cause.message, /<redacted-database-url>/u);
      assert.ok(terminal.cause.message.length <= 500, entry.name);
    } else assert.equal(terminal.cause, null);
  }
});
