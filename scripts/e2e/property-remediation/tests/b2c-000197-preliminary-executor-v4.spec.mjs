import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test, { afterEach } from "node:test";
import {
  PhaseExecutionErrorV4, PreliminaryEvidenceRecorderV4, discoverSecretsV4,
  parseTapSummaryV4, redactEvidenceTextV4, runPhasedGateV4,
} from "../track-b2c-000197-preliminary-executor-v4.mjs";

const roots = [];
const temporary = () => { const base = mkdtempSync("/tmp/b2c197-v4-"); roots.push(base);
  return { base, evidence: resolve(base, "evidence") }; };
const success = (stdout = "ok\n") => ({ status: 0, signal: null, error: null,
  stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) });
const allEvidence = (root) => readdirSync(root).sort().map((name) => {
  const path = resolve(root, name); assert.equal(statSync(path).mode & 0o777, 0o444);
  return readFileSync(path, "utf8");
}).join("\n");

afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

test("discovers argv and environment secrets before intent persistence", () => {
  const paths = temporary();
  const argvSecret = "argv-exact-9f31"; const envSecret = "env-exact-8a22";
  const recorder = new PreliminaryEvidenceRecorderV4({ evidenceRoot: paths.evidence, spawn: () => success() });
  recorder.runChild({ stage: "pre-spawn-secret", command: "probe",
    args: [`{"POSTGRES_PASSWORD":"${argvSecret}"}`], cwd: paths.base,
    env: { PROPERTY_APPROVAL_PORT_PG_URL: `postgresql://user:${envSecret}@db:5432/app` },
    envAllowlist: [{ name: "PROPERTY_APPROVAL_PORT_PG_URL", persist: "redacted" }] });
  const persisted = allEvidence(paths.evidence);
  assert.doesNotMatch(persisted, new RegExp(`${argvSecret}|${envSecret}`, "u"));
  assert.match(persisted, /<redacted>|<redacted-secret>|<redacted-database-url>/u);
});

test("discovers docker inspect secrets in memory before result persistence", () => {
  const paths = temporary();
  const inspectSecret = "inspect-exact-c731"; const urlSecret = "url-exact-b512";
  const recorder = new PreliminaryEvidenceRecorderV4({ evidenceRoot: paths.evidence, spawn: () => ({
    status: 0, signal: null, error: null,
    stdout: Buffer.from(`POSTGRES_PASSWORD=${inspectSecret}\npostgresql://admin:${urlSecret}@127.0.0.1:5432/db\n`),
    stderr: Buffer.from(`{"password":"${inspectSecret}"}\n`),
  }) });
  recorder.runChild({ stage: "docker-inspect", command: "docker", args: ["inspect", "dedicated"], cwd: paths.base,
    parser: () => ({ inspect_shape: "accepted" }) });
  const persisted = allEvidence(paths.evidence);
  assert.doesNotMatch(persisted, new RegExp(`${inspectSecret}|${urlSecret}|postgresql://`, "u"));
  assert.match(persisted, /POSTGRES_PASSWORD=<redacted>/u);
});

test("secret discovery covers process objects, URL userinfo and JSON", () => {
  const found = discoverSecretsV4({ env: { POSTGRES_PASSWORD: "one" },
    argv: ["postgresql://alice:two@db/x", "{\"token\":\"three\"}"] });
  assert.ok(found.includes("one")); assert.ok(found.includes("alice"));
  assert.ok(found.includes("two")); assert.ok(found.includes("three"));
  const redacted = redactEvidenceTextV4("POSTGRES_PASSWORD=one postgresql://alice:two@db/x", found);
  for (const secret of ["one", "alice", "two"]) assert.ok(!redacted.includes(secret));
});

test("phase failure is classified exactly and cleanup plus after always spawn before throw", () => {
  const paths = temporary(); const spawned = [];
  const recorder = new PreliminaryEvidenceRecorderV4({ evidenceRoot: paths.evidence,
    spawn: (_command, args) => { spawned.push(args[0]); return args[0] === "named-tests"
      ? { ...success("not ok\n"), status: 7 } : success(); } });
  let thrown;
  try {
    runPhasedGateV4(recorder, { phases: ["compile", "connect", "setup-before", "named-tests"]
      .map((stage) => ({ stage, command: "probe", args: [stage], cwd: paths.base })),
    cleanupPhases: ["cleanup", "after"].map((stage) => ({ stage, command: "probe", args: [stage], cwd: paths.base })) });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof PhaseExecutionErrorV4); assert.equal(thrown.stage, "named-tests");
  assert.deepEqual(spawned, ["compile", "connect", "setup-before", "named-tests", "cleanup", "after"]);
  const files = readdirSync(paths.evidence).sort();
  assert.ok(files.includes("005-cleanup-result.json")); assert.ok(files.includes("006-after-result.json"));
});

test("cleanup failure evidence is retained without replacing the primary phase", () => {
  const paths = temporary();
  const recorder = new PreliminaryEvidenceRecorderV4({ evidenceRoot: paths.evidence,
    spawn: (_command, args) => ["named-tests", "cleanup"].includes(args[0])
      ? { ...success(), status: 2, stderr: Buffer.from(`${args[0]} failed\n`) } : success() });
  assert.throws(() => runPhasedGateV4(recorder, {
    phases: [{ stage: "named-tests", command: "probe", args: ["named-tests"], cwd: paths.base }],
    cleanupPhases: [{ stage: "cleanup", command: "probe", args: ["cleanup"], cwd: paths.base }],
  }), (error) => error.stage === "named-tests" && error.cleanupFailures?.[0]?.stage === "cleanup");
  assert.ok(readdirSync(paths.evidence).includes("002-cleanup-result.json"));
});

test("real spawned fixture unit output parses exact internal five without outer node test", () => {
  const paths = temporary(); const recorder = new PreliminaryEvidenceRecorderV4({ evidenceRoot: paths.evidence });
  const result = recorder.runChild({ stage: "fixture-direct-five", command: process.execPath,
    args: ["--require", "ts-node/register", "src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts"],
    cwd: resolve(process.cwd(), "apps/api"), env: { PATH: process.env.PATH },
    envAllowlist: [{ name: "PATH", persist: "value" }],
    parser: (stdout) => parseTapSummaryV4(stdout, { expectedTests: 5 }) });
  assert.equal(result.parsed.tests, 5); assert.equal(result.parsed.pass, 5);
});

test("real spawned output parses the future exact-seven named contract", () => {
  const paths = temporary(); const names = ["one", "two", "three", "four", "five", "six", "seven"];
  const tap = `TAP version 13\n${names.map((name) => `# Subtest: ${name}\nok 1 - ${name}`).join("\n")}\n1..7\n# tests 7\n# suites 0\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
  const recorder = new PreliminaryEvidenceRecorderV4({ evidenceRoot: paths.evidence });
  const result = recorder.runChild({ stage: "future-direct-seven", command: process.execPath,
    args: ["-e", `process.stdout.write(${JSON.stringify(tap)})`], cwd: paths.base,
    env: { PATH: process.env.PATH }, envAllowlist: [{ name: "PATH", persist: "value" }],
    parser: (stdout) => parseTapSummaryV4(stdout, { expectedTests: 7, expectedNames: names }) });
  assert.deepEqual(result.parsed.names, names);
});

test("compile-only and skipped TAP fail closed after immutable parse evidence", () => {
  for (const tap of ["compiled\n", "# tests 5\n# suites 1\n# pass 4\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n"]) {
    const paths = temporary();
    const recorder = new PreliminaryEvidenceRecorderV4({ evidenceRoot: paths.evidence, spawn: () => success(tap) });
    assert.throws(() => recorder.runChild({ stage: "invalid-tap", command: "probe", cwd: paths.base,
      parser: (stdout) => parseTapSummaryV4(stdout, { expectedTests: 5 }) }), PhaseExecutionErrorV4);
    assert.ok(readdirSync(paths.evidence).includes("001-invalid-tap-parse.json"));
  }
});
