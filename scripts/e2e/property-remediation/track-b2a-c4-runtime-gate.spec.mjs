/* global process */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanupExactLifecycle,
  outcomeAuthority,
  publishOutcome
} from "./track-b2a-c4-runtime-lifecycle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const runner = readFileSync(resolve(here, "track-b2a-c4-runtime-gate.mjs"), "utf8");
const lifecycle = readFileSync(resolve(here, "track-b2a-c4-runtime-lifecycle.mjs"), "utf8");
const pgSpecSource = readFileSync(resolve(here,
  "../../../apps/api/src/modules/property-tasks/property-task.runtime.pg.spec.ts"), "utf8");

function loadRunnerFunctionBefore(name, endMarker, bindings = {}) {
  const start = runner.indexOf(`function ${name}(`);
  const end = runner.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `unable to extract ${name}`);
  const names = Object.keys(bindings);
  const factory = new Function(...names, `return (${runner.slice(start, end).trim()});`);
  return factory(...names.map((key) => bindings[key]));
}

function loadRunnerFunction(name, nextName, bindings = {}) {
  return loadRunnerFunctionBefore(name, `\nfunction ${nextName}(`, bindings);
}

test("C4 runner freezes signed inputs around all local and PostgreSQL work", () => {
  const capture = runner.indexOf('inputFreeze = captureInputs("before-create")');
  const unique = runner.indexOf(": assertUniqueRunId()");
  const local = runner.indexOf("localGates = runLocalGates()");
  const create = runner.lastIndexOf("startPostgres()");
  const bootstrap = runner.lastIndexOf("bootstrap()");
  const pg = runner.lastIndexOf("runPgSpec(url, localGates.pg_contract)");
  const database = runner.lastIndexOf("const database = databaseEvidence()");
  const cleanup = runner.lastIndexOf("const cleaned = safeCleanup()");
  const finalFreeze = runner.lastIndexOf(
    'assertInputsFrozen("after-database-evidence-and-cleanup")');
  const successPublication = runner.lastIndexOf("const written = writeOutcome(evidence)");
  assert.ok(capture > 0 && capture < unique && unique < local && local < create
    && create < bootstrap && bootstrap < pg && pg < database && database < cleanup
    && cleanup < finalFreeze && finalFreeze < successPublication);
  assert.match(runner, /c4-input-freeze-v2\.txt/u);
  assert.match(runner, /c4-input-gate-evidence-v2\.txt/u);
  assert.match(runner,
    /resolve\(researchRoot, "b-property-foundation-runtime-v2\.txt"\)/u);
  assert.doesNotMatch(runner,
    /resolve\(foundationResearchRoot, "b-property-foundation-runtime-v2\.txt"\)/u);
  assert.match(runner, /property-mutation-receipt\.adapter\.ts/u);
  assert.match(runner, /property-mutation-receipt\.adapter\.spec\.ts/u);
  assert.match(runner, /property-task\.orchestrator\.ts/u);
  assert.match(runner, /property-task\.orchestrator\.spec\.ts/u);
  assert.match(runner, /property-remediation-b2a-c4-runtime-input-freeze-v2/u);
  assert.doesNotMatch(runner,
    /c4-input-gate-evidence-v1\.txt|runtime-input-freeze-v1/u);
  assert.match(runner, /track-b2a-c4-input-gate\.mjs/u);
  assert.match(runner, /C4 signed input drift/u);
});

test("C4 preflight executes the formal gate without research writes or reservation", () => {
  assert.match(runner, /PROPERTY_B2A_C4_PREFLIGHT_ONLY === "yes"/u);
  assert.match(runner, /!preflightOnly && !process\.env\.PROPERTY_B2A_C4_ARTIFACT_PATH/u);
  assert.match(runner, /preflight-only mode forbids research publication/u);
  assert.match(runner, /status: "skipped-preflight-only", reservation_created: false/u);
  assert.match(runner, /research_write_permitted: false/u);
  assert.match(runner, /suppressed-preflight-no-research-write/u);
  assert.match(runner, /preflight_only: true, specs: evidence\.specs, database: evidence\.database/u);
  const formalSelection = runner.slice(runner.indexOf("runIdPreflight = preflightOnly"),
    runner.indexOf('currentStage = "local-gates"'));
  assert.match(formalSelection, /: assertUniqueRunId\(\)/u,
    "formal mode must retain immutable reservation authority");
  assert.doesNotMatch(formalSelection.split(": assertUniqueRunId()")[0],
    /assertUniqueRunId\(\)|reserveRunId\(/u,
    "preflight branch must not inspect or reserve runId authority");
  const preflightSuccess = runner.slice(runner.indexOf("if (preflightOnly) {"),
    runner.indexOf("} else {", runner.indexOf("if (preflightOnly) {")));
  assert.doesNotMatch(preflightSuccess, /writeOutcome|publishOutcome|reserveRunId/u);
});

test("C4 preflight signals and failures clean up but never publish", () => {
  const signal = runner.slice(runner.indexOf('for (const signal of ["SIGINT"'),
    runner.indexOf("try {\n  currentStage", runner.indexOf('for (const signal of ["SIGINT"')));
  assert.ok(signal.indexOf("safeCleanup()") < signal.indexOf("if (!preflightOnly)"));
  assert.match(signal, /captureInputDrift\("signal-after-cleanup"\)/u);
  assert.match(signal, /status: "failed", candidate_admissible: false/u);
  assert.match(signal, /if \(!preflightOnly\) \{[\s\S]*writeOutcome\(failed\)/u);
  const failure = runner.slice(runner.indexOf("if (primaryError) {"),
    runner.lastIndexOf("} else {"));
  assert.match(failure, /candidate_admissible: false/u);
  assert.match(failure, /if \(!preflightOnly\) \{[\s\S]*writeOutcome\(failed\)/u);
});

test("C4 runner directly signs every v2 trust layer and rejects post-gate drift", () => {
  for (const claim of [
    "c4-input-freeze-v1.txt",
    "c4-runtime-formal-candidate-v11-20260801i.json",
    "c4-runtime-formal-candidate-v11-20260801i.manifest.txt",
    "c4-runtime-runid-56b1fd4b07d1c0be69ecb7dd114e702df5a6b81caaa5b5651ae82b95a77dca70.reservation.json",
    "b2a-c3-final-gate-signoff.md",
    "b2a-c2-candidate-gate-artifact-v12d.json",
    "b-property-foundation-contract-v2-attestation.txt",
    "appmodule-contract-v2-reattestation.txt",
    "b0-runtime-contract-freeze.md"
  ]) assert.match(runner, new RegExp(claim.replaceAll(".", "\\."), "u"));
  assert.match(runner, /recursiveFiles\(approvalRoot, \(path\) => path\.endsWith\("\.ts"\)\)/u);
  const rejectApprovalDrift = loadRunnerFunction("assertInputsFrozen", "captureInputDrift", {
    inputFreeze: { raw_sha256: "signed-before-local-gates" },
    captureInputs: () => ({ raw_sha256: "approval-adapter-mutated-after-local-gates" })
  });
  assert.throws(() => rejectApprovalDrift("after-local-gates"), /C4 signed input drift/u);
  const rejectV1Drift = loadRunnerFunction("assertInputsFrozen", "captureInputDrift", {
    inputFreeze: { raw_sha256: "signed-v1" },
    captureInputs: () => ({ raw_sha256: "v1-rolled-back" })
  });
  assert.throws(() => rejectV1Drift("after-local-gates"), /C4 signed input drift/u);
});

test("C4 database-evidence drift is rejected after cleanup and marked inadmissible", () => {
  assert.match(runner, /input-freeze:after-database-evidence-and-cleanup/u);
  assert.match(runner, /input_drift: inputDrift/u);
  assert.match(runner, /status: "failed", candidate_admissible: false/u);
  const database = runner.lastIndexOf("const database = databaseEvidence()");
  const cleanup = runner.lastIndexOf("const cleaned = safeCleanup()");
  const finalFreeze = runner.lastIndexOf(
    'assertInputsFrozen("after-database-evidence-and-cleanup")');
  const publication = runner.lastIndexOf("const written = writeOutcome(evidence)");
  assert.ok(database < cleanup && cleanup < finalFreeze && finalFreeze < publication);
});

test("C4 runId reservation and evidence publication are immutable and bounded", () => {
  assert.match(runner, /c4-runtime-runid-\$\{sha256\(runId\)\}\.reservation\.json/u);
  assert.match(runner, /metadata\.size > 8 \* 1024 \* 1024/u);
  assert.match(runner, /metadata\.isSymbolicLink\(\) \|\| !metadata\.isFile\(\)/u);
  assert.match(runner, /duplicate C4 runId already recorded/u);
  assert.match(lifecycle, /writeFileSync\(reservationPath, bytes, \{ flag: "wx"/u);
  assert.match(lifecycle, /writeFileSync\(manifestPath, manifestBytes, \{ flag: "wx"/u);
  assert.match(lifecycle, /writeFileSync\(artifactPath, bytes, \{ flag: "wx"/u);
  assert.ok(lifecycle.indexOf("writeFileSync(manifestPath, manifestBytes")
    < lifecycle.indexOf("writeFileSync(artifactPath, bytes"));
  assert.match(lifecycle, /publication_contract\\tartifact-and-manifest-both-required/u);
});

test("C4 runner pins exact PG16 labels, image digest and anonymous-volume cleanup", () => {
  assert.match(runner, /OFFICIAL_POSTGRES_IMAGE/u);
  assert.match(runner, /fixtureLabel = "pr192-b2a-c4-runtime-gate"/u);
  assert.match(runner, /"com\.jinhu\.fixture\.run-id": runId/u);
  assert.match(runner, /image_digest: observed\.Image/u);
  assert.match(runner, /anonymous_volume_name: volumeName/u);
  assert.match(runner, /cleanupExactLifecycle\(\{ creationAttempted, containerName, containerId, volumeName/u);
  assert.match(runner, /validateContainer: \(observed\) => assertExactEphemeralPostgresContainer/u);
  assert.match(runner, /removeContainer: \(id\) => docker\(\["rm", "-f", "-v", id\]\)/u);
  assert.match(runner, /removeVolume: \(name\) => docker\(\["volume", "rm", name\]\)/u);
});

test("C4 final readiness rejects temporary postmaster and requires two stable final probes", () => {
  const marker = "PostgreSQL init process complete; ready for start up.";
  const advance = loadRunnerFunction("advanceFinalPostgresReadiness", "redactCommandStream", {
    FINAL_POSTGRES_INIT_MARKER: marker
  });
  let stable = advance(0, { logs: "database system is ready to accept connections",
    running: true, pgIsReadyStatus: 0, selectStatus: 0, selectOutput: "1\n" });
  assert.equal(stable, 0, "temporary ready must not release bootstrap");
  stable = advance(stable, { logs: `${marker}\nreceived fast shutdown request`,
    running: true, pgIsReadyStatus: 2, selectStatus: null, selectOutput: "" });
  assert.equal(stable, 0, "administrator shutdown must reset readiness");
  stable = advance(stable, { logs: `${marker}\ndatabase system is ready to accept connections`,
    running: true, pgIsReadyStatus: 0, selectStatus: 0, selectOutput: "1\n" });
  assert.equal(stable, 1);
  stable = advance(stable, { logs: `${marker}\ndatabase system is ready to accept connections`,
    running: true, pgIsReadyStatus: 0, selectStatus: 0, selectOutput: "1\n" });
  assert.equal(stable, 2);
  assert.match(runner, /stableProbes >= REQUIRED_STABLE_POSTGRES_PROBES/u);
  assert.match(runner, /REQUIRED_STABLE_POSTGRES_PROBES = 2/u);
  assert.ok(runner.indexOf('docker(["logs", "--timestamps"')
    < runner.indexOf('docker(["exec", containerId, "pg_isready"'));
});

test("C4 TAP parser trusts one final root summary instead of a nested suite plan", () => {
  const parseTap = loadRunnerFunction("parseTap", "runLocalCommand");
  const nestedSuiteTap = `TAP version 13
# Subtest: PostgreSQL runtime suite
    1..11
    # tests 999
    # pass 999
    # fail 0
    # skipped 0
ok 1 - PostgreSQL runtime suite
1..1
# tests 11
# suites 1
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
`;
  assert.deepEqual(parseTap(nestedSuiteTap, "nested suite"), {
    tests: 11, passed: 11, failed: 0, skipped: 0
  });
  assert.throws(() => parseTap(nestedSuiteTap.replace("\n# pass 11\n", "\n# pass 10\n")
    .replace("\n# fail 0\n", "\n# fail 1\n"), "failed suite"), /zero-skip TAP/u);
  assert.throws(() => parseTap(nestedSuiteTap.replace("\n# pass 11\n", "\n# pass 10\n")
    .replace("\n# skipped 0\n", "\n# skipped 1\n"), "skipped suite"), /zero-skip TAP/u);
  assert.throws(() => parseTap(nestedSuiteTap.replace("\n# pass 11\n", "\n# pass 10\n"),
    "contradictory suite"), /contradictory root TAP summary/u);
  assert.throws(() => parseTap(`${nestedSuiteTap}# tests 11\n`, "duplicate suite"),
    /requires one root TAP summary field:tests/u);
  assert.throws(() => parseTap(nestedSuiteTap.replace("\n# tests 11\n", "\n# tests eleven\n"),
    "non-numeric suite"), /malformed root TAP summary field:tests/u);
  assert.throws(() => parseTap(`TAP version 13
    # tests 11
    # pass 11
    # fail 0
    # skipped 0
1..1
`, "nested forgery"), /requires one root TAP summary field:tests/u);
  assert.throws(() => parseTap(`${nestedSuiteTap}ok 2 - forged after summary\n`,
    "late activity"), /non-summary TAP content after its summary/u);
  assert.throws(() => parseTap(`not ok 1 - concealed failure\n${nestedSuiteTap}`,
    "forged green summary"), /failing TAP test point/u);
  assert.throws(() => parseTap(nestedSuiteTap.replace("    1..11\n",
    "    ok 1 - nested skip # SKIP unavailable\n    1..11\n"),
  "nested skip"), /skipped or todo TAP test point/u);
  assert.throws(() => parseTap(nestedSuiteTap.replace("    1..11\n",
    "    ok 1 - nested todo # TODO later\n    1..11\n"),
  "nested todo"), /skipped or todo TAP test point/u);
  assert.throws(() => parseTap(nestedSuiteTap.replace("# todo 0", "# todo 1"),
    "todo summary"), /zero-todo TAP/u);
  assert.throws(() => parseTap(`${nestedSuiteTap}    Bail out! hidden\n`,
    "late bailout"), /TAP bailout/u);
  for (const [label, suffix] of [
    ["indented point", "    ok 2 - late nested point\n"],
    ["late plan", "    1..1\n"],
    ["late subtest", "    # Subtest: forged\n"],
    ["late TAP version", "    TAP version 13\n"]
  ]) {
    assert.throws(() => parseTap(`${nestedSuiteTap}${suffix}`, label),
      /non-summary TAP content after its summary/u);
  }
});

test("C4 PG failure evidence preserves both bounded streams without credentials", () => {
  const redact = loadRunnerFunction("redactCommandStream", "safeCommandStreamEvidence", {
    postgresPassword: "run-secret-password"
  });
  const safe = loadRunnerFunction("safeCommandStreamEvidence", "inspect", {
    Buffer,
    COMMAND_STREAM_MAX_BYTES: 16 * 1024,
    sha256: (value) => createHash("sha256").update(value).digest("hex"),
    redactCommandStream: redact
  });
  const stdout = `${"x".repeat(20_000)}\nconstraint task_assignment_check failed\n`
    + "postgresql://gate:run-secret-password@127.0.0.1:5432/db password=second-secret";
  const stderr = "token:third-secret administrator command";
  const stdoutEvidence = safe(stdout);
  const stderrEvidence = safe(stderr);
  assert.equal(stdoutEvidence.truncated, true);
  assert.equal(stdoutEvidence.stored_bytes, 16 * 1024);
  assert.equal(stdoutEvidence.raw_sha256,
    createHash("sha256").update(stdout).digest("hex"));
  assert.match(stdoutEvidence.redacted_tail, /constraint task_assignment_check failed/u);
  assert.doesNotMatch(stdoutEvidence.redacted_tail,
    /(run-secret-password|second-secret|postgresql:\/\/gate:)/u);
  assert.match(stderrEvidence.redacted_tail, /token=\[redacted\]/u);
  assert.doesNotMatch(stderrEvidence.redacted_tail, /third-secret/u);
  const summary = JSON.stringify({ stdout: stdoutEvidence, stderr: safe("") });
  assert.match(summary, /constraint task_assignment_check failed/u);
  assert.match(summary, /"stderr"/u);
  assert.match(runner, /stdout: safeCommandStreamEvidence\(result\.stdout\)/u);
  assert.match(runner, /stderr: safeCommandStreamEvidence\(result\.stderr\)/u);
  const runPgSpecSource = runner.slice(runner.indexOf("function runPgSpec("),
    runner.indexOf("\nfunction databaseEvidence("));
  assert.doesNotMatch(runPgSpecSource,
    /result\.error\?\.message \?\? result\.stderr \?\? result\.stdout/u);
});

test("C4 PostgreSQL gate freezes the exact 93-test composition", () => {
  const assertExact = loadRunnerFunction("assertExactPgTapCount", "runPgSpec", {
    C4_PG_BASE_TEST_COUNT: 10,
    C4_PG_EXACT_TEST_COUNT: 93
  });
  const contract = { cross_operation_matrix_count: 73,
    independent_proofs: Array.from({ length: 10 }, (_, index) => `proof-${index}`) };
  assert.doesNotThrow(() => assertExact({ tests: 93 }, contract));
  assert.throws(() => assertExact({ tests: 84 }, contract), /must be exact:84!=93/u);
  assert.throws(() => assertExact({ tests: 94 }, contract), /must be exact:94!=93/u);
  assert.throws(() => assertExact({ tests: 93 }, { ...contract,
    cross_operation_matrix_count: 72 }), /frozen test composition drifted:92!=93/u);
  assert.match(runner, /const C4_PG_BASE_TEST_COUNT = 10/u);
  assert.match(runner, /const C4_PG_EXACT_TEST_COUNT = 93/u);
  assert.doesNotMatch(runner.slice(runner.indexOf("function runPgSpec("),
    runner.indexOf("\nfunction databaseEvidence(")), /minimumTests|tap\.tests\s*</u);
});

test("C4 startup failure preserves bounded diagnostics before exact cleanup", () => {
  assert.match(runner, /container exited before final readiness/u);
  assert.match(runner, /PostgreSQL final readiness timeout/u);
  assert.match(runner, /failed_stage: currentStage/u);
  assert.match(runner, /failure_diagnostics: failureDiagnostics/u);
  assert.match(runner, /DIAGNOSTIC_LOG_TAIL_LINES = 120/u);
  assert.match(runner, /DIAGNOSTIC_LOG_MAX_BYTES = 64 \* 1024/u);
  assert.match(runner, /raw_sha256: sha256\(bytes\)/u);
  assert.match(runner, /oom_killed: observed\.State\?\.OOMKilled/u);
  assert.match(runner, /safeCaptureFailureDiagnostics\(\)[\s\S]*safeCleanup\(\)/u);
  assert.ok(runner.indexOf("failureDiagnostics = safeCaptureFailureDiagnostics()",
    runner.indexOf("} finally {")) < runner.indexOf("const cleaned = safeCleanup()",
    runner.indexOf("} finally {")));
  assert.match(runner, /diagnostics-threw:/u);

  const observed = { RestartCount: 0, State: { Status: "exited", Running: false,
    Paused: false, Restarting: false, OOMKilled: false, Dead: false, ExitCode: 1,
    Error: "", StartedAt: "start", FinishedAt: "finish" } };
  const capture = loadRunnerFunction("captureFailureDiagnostics",
    "safeCaptureFailureDiagnostics", {
      currentStage: "postgres:final-readiness:7",
      creationAttempted: true,
      inspect: () => observed,
      containerName: "c4",
      assertExactEphemeralPostgresContainer: () => ({ containerId: "cid" }),
      databaseName: "db",
      fixtureLabel: "fixture",
      runId: "b2ac4_fake_1234",
      OFFICIAL_POSTGRES_IMAGE: "postgres:16-alpine",
      containerId: "cid",
      docker: () => ({ status: 0, stdout: "timestamp final log", stderr: "" }),
      DIAGNOSTIC_LOG_TAIL_LINES: 120,
      boundedDiagnosticText: (value) => ({ raw_sha256: createHash("sha256")
        .update(value).digest("hex"), tail: value })
    });
  const diagnostic = capture();
  assert.equal(diagnostic.status, "captured");
  assert.equal(diagnostic.current_stage, "postgres:final-readiness:7");
  assert.equal(diagnostic.container.exact_identity, true);
  assert.equal(diagnostic.container.state.running, false);
  assert.equal(diagnostic.logs.stdout.tail, "timestamp final log");

  let container = observed;
  let volume = { exact: true };
  const cleaned = cleanupExactLifecycle({ creationAttempted: true, containerName: "c4",
    containerId: "cid", volumeName: "vid", inspectContainer: () => container,
    inspectVolume: () => volume, validateContainer: () => ({ containerId: "cid",
      volumeName: "vid" }), removeContainer: () => { container = null; },
    removeVolume: () => { volume = null; } });
  assert.equal(cleaned.status, "passed");
  assert.equal(cleaned.container_absent, true);
  assert.equal(cleaned.anonymous_volume_absent, true);
});

test("C4 runner freezes the signed 73-case exact matrix and rejects deceptive manifests", () => {
  for (const number of [185, 186, 187, 188, 189, 190, 193, 194, 195]) {
    assert.match(runner, new RegExp(`"000${number}_`));
  }
  assert.match(runner, /property-task\.runtime\.pg\.spec\.ts/u);
  assert.match(runner, /c4-full-concurrency-matrix-freeze-v1\.md/u);
  assert.match(runner, /c4-full-concurrency-matrix-freeze-v1-signoff\.md/u);
  assert.match(runner, /c4-existing-only-failed-state-addendum-v1\.md/u);
  assert.match(runner, /c4-existing-only-failed-state-addendum-v1-signoff\.md/u);
  assert.match(runner, /c4-existing-only-failed-state-addendum-v2\.md/u);
  assert.match(runner, /c4-existing-only-failed-state-addendum-v2-signoff\.md/u);
  assert.match(runner, /eccc6433b7341a47b86fc5998a2e7e414b9dbd06ad6ca943f20ed43dd6ae0e51/u);
  assert.match(runner, /c9fd87b6bef48cbdb96df44851296fa890777b31850293ba56b97d24e8f8abe3/u);
  assert.match(runner, /0609ee349506b71d62c4f14a865859bb386c847c7a2caf123f79a21c7b6d8213/u);
  assert.match(runner, /60d2dc7d8f0207eceb51a6926f466202f0093b30d7caa08e0629b3da018ee324/u);
  assert.match(runner, /c5b47e80e51d9eaeb40075c2fc98bae039997b12265c6350ccd688303d94c077/u);
  assert.match(runner, /04770205f1be4ccb0f7d722f300f0942b59f4372a1df9bef24f0836526285770/u);
  assert.match(runner, /43b7d067c87eeabf909190cd0f73448518a4661e4e89eec8765c2051aaa967f5/u);
  assert.doesNotMatch(runner, /2a450c85d499f3dcd4c2f76f4d5d07f4caaca9a6bf33318cf74f419d1ae237df/u);
  assert.doesNotMatch(runner, /b7e00ca21ffb3662f4f23475262118b02a5e3958a5d7ef3ecf144fff974b74d9/u);

  const commandVariants = [
    { key: "claim-open", initialStatus: "open" },
    { key: "start-claimed", initialStatus: "claimed" },
    { key: "block-in-progress", initialStatus: "in_progress" },
    { key: "unblock-blocked", initialStatus: "blocked" },
    { key: "release-claimed", initialStatus: "claimed" },
    { key: "release-in-progress", initialStatus: "in_progress" },
    { key: "release-blocked", initialStatus: "blocked" }
  ];
  const terminalStatuses = ["open", "claimed", "in_progress", "blocked"];
  const terminalOutcomes = ["closed", "cancelled"];
  const buildExpected = loadRunnerFunction(
    "buildExpectedC4CrossOperationMatrix", "extractC4CrossOperationMatrixManifest", {
    C4_COMMAND_MATRIX_VARIANTS: commandVariants,
    C4_TERMINAL_MATRIX_STATUSES: terminalStatuses,
    C4_TERMINAL_MATRIX_OUTCOMES: terminalOutcomes
  });
  const expected = buildExpected();
  assert.equal(expected.length, 73);
  assert.equal(expected.filter((item) => item.family === "shared-fence").length, 28);
  assert.equal(expected.filter((item) => item.family === "rebuild-fence").length, 45);
  assert.equal(expected.filter((item) => item.coordination === "pg-lock-wait").length, 43);
  assert.equal(expected.filter((item) => item.coordination === "post-commit-latch").length, 30);
  assert.ok(expected.some((item) => item.key
    === "shared-fence:release-blocked:terminal-blocked-cancelled:terminal-first"
    && item.terminalKey === "terminal-blocked-cancelled"));
  assert.ok(expected.some((item) => item.key
    === "rebuild-fence:terminal-in-progress-cancelled:action-first-current-N-plus-1"
    && item.holderIsolation === "READ COMMITTED"
    && item.waiterIsolation === "SERIALIZABLE"
    && item.coordination === "post-commit-latch"));

  const manifestLiteral =
    "const C4_CROSS_OPERATION_MATRIX_MANIFEST_JSON = String.raw`";
  const extractManifest = loadRunnerFunction(
    "extractC4CrossOperationMatrixManifest", "assertExactC4CrossOperationMatrix", {
    C4_MATRIX_MANIFEST_LITERAL: manifestLiteral
  });
  const assertExact = loadRunnerFunction(
    "assertExactC4CrossOperationMatrix", "inspectPgSpecContract", {
    buildExpectedC4CrossOperationMatrix: buildExpected
  });
  const sourceFor = (matrix) => `${manifestLiteral}${JSON.stringify(matrix)}\`;`;
  assert.deepEqual(assertExact(extractManifest(sourceFor(expected))), expected);

  const missing = expected.slice(1);
  assert.throws(() => assertExact(extractManifest(sourceFor(missing))), /exact-set mismatch/u);
  const duplicate = [...expected, expected[0]];
  assert.throws(() => assertExact(extractManifest(sourceFor(duplicate))), /duplicate keys/u);
  const forged = expected.map((item, index) => index === 0
    ? { ...item, expectedOutcome: "allowed-result-set" } : item);
  assert.throws(() => assertExact(extractManifest(sourceFor(forged))), /exact-set mismatch/u);
  const extraField = expected.map((item, index) => index === 0
    ? { ...item, representativeEquivalent: true } : item);
  assert.throws(() => assertExact(extractManifest(sourceFor(extraField))), /untrusted fields/u);
  assert.throws(() => extractManifest(`${sourceFor(expected)}\n${sourceFor(expected)}`),
    /requires one executable matrix/u);

  assert.deepEqual(assertExact(extractManifest(pgSpecSource)), expected);

  const independentProofs = [
    "independent:claim-claim-one-winner",
    "independent:rebuild-same-key-completed-replay",
    "independent:terminal-closed-completed-replay",
    "independent:terminal-cancelled-completed-replay",
    "independent:terminal-pre-receipt-negative-matrix",
    "independent:terminal-existing-only-state-matrix",
    "independent:projection-late-failure-rollback",
    "independent:receipt-complete-late-failure-rollback",
    "independent:head-absent-concurrent-winner-reattest",
    "independent:derived-owning-boundary"
  ];
  const root = resolve(here, "../../..");
  const matrixFreeze = resolve(root,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/"
      + "c4-full-concurrency-matrix-freeze-v1.md");
  const matrixFreezeSignoff = resolve(root,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/"
      + "c4-full-concurrency-matrix-freeze-v1-signoff.md");
  const failedStateAddendum = resolve(root,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/"
      + "c4-existing-only-failed-state-addendum-v1.md");
  const failedStateAddendumSignoff = resolve(root,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/"
      + "c4-existing-only-failed-state-addendum-v1-signoff.md");
  const failedStateAddendumV2 = resolve(root,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/"
      + "c4-existing-only-failed-state-addendum-v2.md");
  const failedStateAddendumV2Signoff = resolve(root,
    ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/"
      + "c4-existing-only-failed-state-addendum-v2-signoff.md");
  const extractExactPgTest = loadRunnerFunctionBefore(
    "extractExactPgTest", "\n\nconst C4_COMMAND_MATRIX_VARIANTS"
  );
  const inspectPgSpec = loadRunnerFunction(
    "inspectPgSpecContract", "inspectProductionIsolationContract", {
      sha256: (value) => createHash("sha256").update(value).digest("hex"),
      readFileSync,
      matrixFreeze,
      matrixFreezeSignoff,
      failedStateAddendum,
      failedStateAddendumSignoff,
      failedStateAddendumV2,
      failedStateAddendumV2Signoff,
      C4_MATRIX_FREEZE_SHA256:
        "04770205f1be4ccb0f7d722f300f0942b59f4372a1df9bef24f0836526285770",
      C4_MATRIX_FREEZE_SIGNOFF_SHA256:
        "43b7d067c87eeabf909190cd0f73448518a4661e4e89eec8765c2051aaa967f5",
      C4_FAILED_STATE_ADDENDUM_SHA256:
        "eccc6433b7341a47b86fc5998a2e7e414b9dbd06ad6ca943f20ed43dd6ae0e51",
      C4_FAILED_STATE_ADDENDUM_SIGNOFF_SHA256:
        "c9fd87b6bef48cbdb96df44851296fa890777b31850293ba56b97d24e8f8abe3",
      C4_FAILED_STATE_ADDENDUM_V2_SHA256:
        "0609ee349506b71d62c4f14a865859bb386c847c7a2caf123f79a21c7b6d8213",
      C4_FAILED_STATE_ADDENDUM_V2_SIGNOFF_SHA256:
        "60d2dc7d8f0207eceb51a6926f466202f0093b30d7caa08e0629b3da018ee324",
      C4_FAILED_STATE_PG_SPEC_SHA256:
        "c5b47e80e51d9eaeb40075c2fc98bae039997b12265c6350ccd688303d94c077",
      extractExactPgTest,
      assertExactC4CrossOperationMatrix: assertExact,
      extractC4CrossOperationMatrixManifest: extractManifest,
      C4_MATRIX_INDEPENDENT_PROOFS: independentProofs,
      root
    }
  );
  const hasIsolationMetadata = pgSpecSource.includes(
    "function assertMatrixIsolationMetadata("
  );
  const missingProof = independentProofs.slice(1).find((proof) =>
    !pgSpecSource.includes(`C4 matrix proof ${proof}`)
  );
  if (!hasIsolationMetadata) {
    assert.throws(() => inspectPgSpec(pgSpecSource),
      /matrix execution structure missing:.*assertMatrixIsolationMetadata/u);
  } else if (missingProof) {
    assert.throws(() => inspectPgSpec(pgSpecSource),
      new RegExp(`exact test title:C4 matrix proof ${missingProof}`));
  } else {
    const contract = inspectPgSpec(pgSpecSource);
    assert.equal(contract.cross_operation_matrix_count, 73);
    assert.equal(contract.true_concurrent_lock_schedule_count, 43);
    assert.equal(contract.ordered_post_commit_schedule_count, 30);
    assert.deepEqual(contract.independent_proofs, independentProofs);
    assert.equal(contract.full_c4_cross_operation_matrix_status, "passed");
  }

  const inspectProduction = loadRunnerFunction(
    "inspectProductionIsolationContract", "assertPgSpecContract"
  );
  const productionSource = readFileSync(resolve(here,
    "../../../apps/api/src/modules/property-tasks/property-task.orchestrator.ts"), "utf8");
  assert.deepEqual(inspectProduction(productionSource), {
    command: "READ COMMITTED",
    source_terminal: "READ COMMITTED",
    rebuild: "SERIALIZABLE",
    read_committed_locked_current_projection: true,
    rebuild_assignment_before_projection: true
  });
  assert.throws(() => inspectProduction(productionSource.replace(
    'this.dataSource.transaction("READ COMMITTED"',
    'this.dataSource.transaction("SERIALIZABLE"')),
  /isolation drift:command:READ COMMITTED/u);
  assert.throws(() => inspectProduction(productionSource.replace(
    'this.dataSource.transaction("SERIALIZABLE"',
    'this.dataSource.transaction("READ COMMITTED"')),
  /isolation drift:rebuild:SERIALIZABLE/u);
  assert.doesNotMatch(runner, /representative_cross_operation_schedules/u);
  assert.match(runner, /sleep_based_coordination: false/u);
  assert.match(runner, /full_c4_cross_operation_matrix_status: "passed"/u);
  assert.match(runner, /cross_operation_matrix_complete: true/u);
  assert.match(runner, /post_commit_latch_does_not_claim_pg_lock_wait: true/u);
});

test("C4 runner has PostgreSQL 16 EXPLAIN and signed budget assertions", () => {
  assert.match(runner, /EXPLAIN \(FORMAT JSON\)/u);
  assert.ok(runner.includes("/Seq Scan/u"));
  assert.match(runner, /Index Scan\|Bitmap Index Scan/u);
  assert.match(runner, /d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45/u);
  assert.match(runner, /jsonb_array_length\(p_rows\)>200/u);
  assert.match(runner, /server_version/u);
  assert.ok(runner.includes("!/^16\\./u.test"));
});

test("failure and signal evidence is always non-admissible and cleanup precedes publication", () => {
  assert.match(runner, /status: "failed", candidate_admissible: false/u);
  assert.match(runner, /const cleaned = safeCleanup\(\);[\s\S]*writeOutcome\(failed\)/u);
  assert.match(runner, /finally \{[\s\S]*const cleaned = safeCleanup\(\)/u);
  assert.match(runner, /if \(primaryError\) \{[\s\S]*writeOutcome\(failed\)/u);
  assert.match(runner, /for \(const signal of \["SIGINT", "SIGTERM", "SIGHUP"\]\)/u);
  assert.match(runner, /candidate_scope: "c4-runtime-candidate-only-production-enablement-remains-blocked"/u);
  assert.match(runner, /B3_web_consumer_status: "pending"/u);
  assert.match(runner, /production_enablement: false/u);
});

test("malicious interruption cannot overwrite an existing primary failure", () => {
  const preserve = loadRunnerFunctionBefore("preservePrimaryErrorOnSignal",
    "\n\nlet primaryError");
  const primary = Object.freeze(new Error("bootstrap:migration:checksum-failure"));
  const result = preserve(primary, "SIGTERM\nforged-primary");
  assert.equal(result.primaryError, primary);
  assert.equal(result.primaryError.message, "bootstrap:migration:checksum-failure");
  assert.equal(result.primaryErrorPreserved, true);
  assert.match(result.interruptionError.message, /^interrupted:SIGTERM/u);
  assert.notEqual(result.interruptionError, primary);
  const noPrimary = preserve(null, "SIGINT");
  assert.equal(noPrimary.primaryError, noPrimary.interruptionError);
  assert.equal(noPrimary.primaryErrorPreserved, false);
  assert.match(runner, /interruptions: interruptionEvidence/u);
});

test("attempt evidence cannot claim runId authority before reservation", () => {
  const directory = mkdtempSync("/tmp/c4-attempt-");
  try {
    const artifactPath = resolve(directory, "c4-runtime-loser.json");
    const manifestPath = resolve(directory, "c4-runtime-loser.manifest.txt");
    const authority = outcomeAuthority({ reservation: null, runId: "b2ac4_duplicate_123",
      attemptId: `attempt_${randomUUID()}` });
    publishOutcome({ artifactPath, manifestPath, artifactLabel: "c4-runtime-loser.json",
      outcome: { ...authority, status: "failed", candidate_admissible: false } });
    const json = JSON.parse(readFileSync(artifactPath, "utf8"));
    const manifest = readFileSync(manifestPath, "utf8");
    assert.equal("run_id" in json, false);
    assert.equal(json.attempted_run_id, "b2ac4_duplicate_123");
    assert.doesNotMatch(manifest, /^run_id\t/mu);
    assert.match(manifest, /^attempted_run_id\tb2ac4_duplicate_123$/mu);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("two fake processes racing a C4 reservation produce one authority", async () => {
  const directory = mkdtempSync("/tmp/c4-reservation-");
  try {
    const reservation = resolve(directory, "reservation.json");
    const helper = resolve(here, "track-b2a-c4-runtime-lifecycle.mjs");
    const script = `import{outcomeAuthority,publishOutcome,reserveRunId}from${JSON.stringify(`file://${helper}`)};`
      + `const[r,s,d]=process.argv.slice(1);let held=null;try{held=reserveRunId({reservationPath:r,runId:'b2ac4_race_1234',artifact:'c4-runtime-'+s+'.json',manifest:'c4-runtime-'+s+'.manifest.txt',reservedAt:'2026-08-01T00:00:00.000Z'});}catch{held=null;}const a=outcomeAuthority({reservation:held,runId:'b2ac4_race_1234',attemptId:'attempt_'+s});publishOutcome({artifactPath:d+'/c4-runtime-'+s+'.json',manifestPath:d+'/c4-runtime-'+s+'.manifest.txt',artifactLabel:'c4-runtime-'+s+'.json',outcome:{...a,status:'failed',candidate_admissible:false}});`;
    const run = (suffix) => new Promise((resolveRun) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", script,
        reservation, suffix, directory], { stdio: "ignore" });
      child.on("close", resolveRun);
    });
    assert.deepEqual(await Promise.all([run("a"), run("b")]), [0, 0]);
    const outcomes = ["a", "b"].map((suffix) => JSON.parse(readFileSync(
      resolve(directory, `c4-runtime-${suffix}.json`), "utf8")));
    assert.equal(outcomes.filter((outcome) => typeof outcome.run_id === "string").length, 1);
    assert.equal(outcomes.filter((outcome) => !("run_id" in outcome)
      && outcome.candidate_admissible === false).length, 1);
    for (const suffix of ["a", "b"]) {
      const manifest = readFileSync(resolve(directory, `c4-runtime-${suffix}.manifest.txt`), "utf8");
      const expected = manifest.match(/^artifact\t[^\t]+\t\d+\t([0-9a-f]{64})$/mu)?.[1];
      assert.equal(expected, createHash("sha256").update(readFileSync(
        resolve(directory, `c4-runtime-${suffix}.json`))).digest("hex"));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fake cleanup deletes only an exact reacquired container and volume", () => {
  const removed = [];
  let container = { exact: true };
  let volume = { exact: true };
  const exact = cleanupExactLifecycle({ creationAttempted: true, containerName: "c4",
    containerId: null, volumeName: null, inspectContainer: () => container,
    inspectVolume: () => volume, validateContainer: () => ({ containerId: "cid", volumeName: "vid" }),
    removeContainer: (id) => { removed.push(`container:${id}`); container = null; },
    removeVolume: (id) => { removed.push(`volume:${id}`); volume = null; } });
  assert.equal(exact.status, "passed");
  assert.deepEqual(removed, ["container:cid", "volume:vid"]);

  const refused = [];
  const mismatch = cleanupExactLifecycle({ creationAttempted: true, containerName: "c4",
    containerId: null, volumeName: null, inspectContainer: () => ({ wrong: true }),
    inspectVolume: () => null, validateContainer: () => { throw new Error("label-mismatch"); },
    removeContainer: (id) => refused.push(id), removeVolume: (id) => refused.push(id) });
  assert.equal(mismatch.status, "failed");
  assert.deepEqual(refused, []);

  const notAttempted = cleanupExactLifecycle({ creationAttempted: false });
  assert.deepEqual(notAttempted, { status: "passed", attempted: false,
    container_absent: true, anonymous_volume_absent: true, errors: [], exact_targets: [] });
});
