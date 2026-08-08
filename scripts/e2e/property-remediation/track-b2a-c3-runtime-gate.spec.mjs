/* global process */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanupExactLifecycle, outcomeAuthority, publishOutcome
} from "./track-b2a-c3-runtime-lifecycle.mjs";

const runner = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
  "track-b2a-c3-runtime-gate.mjs"), "utf8");
const lifecycle = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
  "track-b2a-c3-runtime-lifecycle.mjs"), "utf8");

test("failure and signal outcomes are immutable non-admissible artifacts after cleanup", () => {
  assert.match(runner, /status:\s*"failed",\s*candidate_admissible:\s*false/u);
  assert.match(runner, /const cleaned = safeCleanup\(\);[\s\S]*writeOutcome\(failed\)/u);
  assert.match(runner, /finally \{[\s\S]*const cleaned = safeCleanup\(\)/u);
  assert.match(runner, /if \(primaryError\) \{[\s\S]*writeOutcome\(failed\)/u);
  assert.match(lifecycle, /writeFileSync\(artifactPath, bytes, \{ flag: "wx"/u);
  assert.match(lifecycle, /writeFileSync\(manifestPath, manifestBytes, \{ flag: "wx"/u);
  assert.ok(lifecycle.indexOf("writeFileSync(manifestPath, manifestBytes")
    < lifecycle.indexOf("writeFileSync(artifactPath, bytes"));
  assert.match(lifecycle, /publication_contract\\tartifact-and-manifest-both-required/u);
  assert.match(runner, /function safeCleanup\(\)[\s\S]*cleanup threw/u);
});

test("duplicate runId preflight is bounded and occurs before commands or Docker", () => {
  const unique = runner.indexOf("runIdPreflight = assertUniqueRunId()");
  const local = runner.indexOf("localGates = runLocalGates()");
  const create = runner.lastIndexOf("startPostgres()");
  assert.ok(unique > 0 && unique < local && local < create);
  assert.match(runner, /metadata\.size > 8 \* 1024 \* 1024/u);
  assert.match(runner, /metadata\.isSymbolicLink\(\) \|\| !metadata\.isFile\(\)/u);
  assert.match(runner, /duplicate C3 runId already recorded/u);
  assert.match(lifecycle, /writeFileSync\(reservationPath, bytes, \{ flag: "wx"/u);
  assert.match(runner, /C3 runId authority is not a regular file/u);
  assert.match(runner, /C3 runId authority exceeds bounded size/u);
  assert.match(runner, /C3 runId authority cannot be parsed/u);
  assert.match(runner, /C3 runId authority has no run_id/u);
  assert.match(lifecycle, /if \(!creationAttempted\) return \{ status: "passed", attempted: false/u);
});

test("early create failures reacquire only an exact labelled PG16 target before deletion", () => {
  const attempted = runner.indexOf("creationAttempted = true");
  const dockerRun = runner.indexOf("docker(buildEphemeralPostgresRunArgs");
  assert.ok(attempted > 0 && attempted < dockerRun);
  assert.match(runner, /cleanupExactLifecycle\(\{ creationAttempted, containerName, containerId, volumeName/u);
  assert.match(runner, /validateContainer: \(observed\) => assertExactEphemeralPostgresContainer/u);
  assert.match(runner, /expectedImage: OFFICIAL_POSTGRES_IMAGE/u);
  assert.match(lifecycle, /const exact = validateContainer\(observed\)/u);
  assert.match(lifecycle, /removeContainer\(containerId\)/u);
});

test("candidate scope explicitly defers foundation and AppModule v2 re-attestation", () => {
  assert.match(runner,
    /runtime-candidate-only-requires-separate-foundation-appmodule-v2-reattestation/u);
  assert.doesNotMatch(runner, /candidate_scope:\s*"c3-complete/u);
});

test("attempt publication has no run_id authority before reservation", () => {
  const directory = mkdtempSync("/tmp/c3-attempt-");
  try {
    const artifactPath = resolve(directory, "b2a-c3-loser.json");
    const manifestPath = resolve(directory, "b2a-c3-loser.manifest.txt");
    const authority = outcomeAuthority({ reservation: null, runId: "b2ac3_duplicate_123",
      attemptId: `attempt_${randomUUID()}` });
    publishOutcome({ artifactPath, manifestPath, artifactLabel: "b2a-c3-loser.json",
      outcome: { ...authority, status: "failed", candidate_admissible: false } });
    const json = JSON.parse(readFileSync(artifactPath, "utf8"));
    const manifest = readFileSync(manifestPath, "utf8");
    assert.equal("run_id" in json, false);
    assert.equal(json.attempted_run_id, "b2ac3_duplicate_123");
    assert.doesNotMatch(manifest, /^run_id\t/mu);
    assert.match(manifest, /^attempted_run_id\tb2ac3_duplicate_123$/mu);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("two processes racing wx reservation produce one authority and one attempt", async () => {
  const directory = mkdtempSync("/tmp/c3-reservation-");
  try {
    const reservation = resolve(directory, "reservation.json");
    const helper = resolve(dirname(fileURLToPath(import.meta.url)),
      "track-b2a-c3-runtime-lifecycle.mjs");
    const script = `import {outcomeAuthority,publishOutcome,reserveRunId} from ${JSON.stringify(`file://${helper}`)};`
      + `const [reservationPath,suffix,directory]=process.argv.slice(1);let held=null;`
      + `try{held=reserveRunId({reservationPath,runId:'b2ac3_race_1234',artifact:'b2a-c3-'+suffix+'.json',manifest:'b2a-c3-'+suffix+'.manifest.txt',reservedAt:'2026-08-01T00:00:00.000Z'});}`
      + `catch{held=null;}const authority=outcomeAuthority({reservation:held,runId:'b2ac3_race_1234',attemptId:'attempt_'+suffix});`
      + `publishOutcome({artifactPath:directory+'/b2a-c3-'+suffix+'.json',manifestPath:directory+'/b2a-c3-'+suffix+'.manifest.txt',artifactLabel:'b2a-c3-'+suffix+'.json',outcome:{...authority,status:'failed',candidate_admissible:false}});`;
    const run = (suffix) => new Promise((resolveRun) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", script, reservation,
        suffix, directory], { stdio: "ignore" });
      child.on("close", (status) => resolveRun(status));
    });
    const statuses = await Promise.all([run("a"), run("b")]);
    assert.deepEqual(statuses, [0, 0]);
    const reservationValue = JSON.parse(readFileSync(reservation, "utf8"));
    assert.equal(reservationValue.run_id, "b2ac3_race_1234");
    const outcomes = ["a", "b"].map((name) =>
      JSON.parse(readFileSync(resolve(directory, `b2a-c3-${name}.json`), "utf8")));
    const manifests = ["a", "b"].map((name) =>
      readFileSync(resolve(directory, `b2a-c3-${name}.manifest.txt`), "utf8"));
    assert.equal(outcomes.filter((outcome) => typeof outcome.run_id === "string").length, 1);
    assert.equal(manifests.filter((manifest) => /^run_id\t/mu.test(manifest)).length, 1);
    const loserIndex = outcomes.findIndex((outcome) => !("run_id" in outcome));
    assert.notEqual(loserIndex, -1);
    assert.equal(outcomes[loserIndex].attempted_run_id, "b2ac3_race_1234");
    assert.match(outcomes[loserIndex].attempt_id, /^attempt_[ab]$/u);
    for (const [index, manifest] of manifests.entries()) {
      assert.match(manifest, /^publication_contract\tartifact-and-manifest-both-required$/mu);
      const artifactHash = manifest.match(/^artifact\t[^\t]+\t\d+\t([0-9a-f]{64})$/mu)?.[1];
      const artifactBytes = readFileSync(resolve(directory, `b2a-c3-${index === 0 ? "a" : "b"}.json`));
      assert.equal(artifactHash, createHash("sha256").update(artifactBytes).digest("hex"));
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("fake Docker cleanup deletes only exact identity and fails closed when unproven", () => {
  const exactObserved = { name: "exact" };
  const removed = [];
  let exactContainer = exactObserved;
  const exact = cleanupExactLifecycle({ creationAttempted: true, containerName: "c3", containerId: null,
    volumeName: null, inspectContainer: () => exactContainer,
    inspectVolume: () => null, validateContainer: () => ({ containerId: "cid", volumeName: "vid" }),
    removeContainer: (id) => { removed.push(`container:${id}`); exactContainer = null; },
    removeVolume: (id) => removed.push(`volume:${id}`) });
  assert.equal(exact.status, "passed");
  assert.deepEqual(removed, ["container:cid"]);

  const refused = [];
  const mismatch = cleanupExactLifecycle({ creationAttempted: true, containerName: "c3",
    containerId: null, volumeName: null, inspectContainer: () => exactObserved,
    inspectVolume: () => null, validateContainer: () => { throw new Error("label-mismatch"); },
    removeContainer: (id) => refused.push(id), removeVolume: (id) => refused.push(id) });
  assert.equal(mismatch.status, "failed");
  assert.deepEqual(refused, []);

  const invisible = cleanupExactLifecycle({ creationAttempted: true, containerName: "c3",
    containerId: null, volumeName: null, inspectContainer: () => null,
    inspectVolume: () => null, validateContainer: () => { throw new Error("unexpected"); },
    removeContainer: (id) => refused.push(id), removeVolume: (id) => refused.push(id) });
  assert.equal(invisible.status, "failed");
  assert.equal(invisible.anonymous_volume_absent, false);
  assert.match(invisible.errors.join("|"), /identity-unproven/u);
});
