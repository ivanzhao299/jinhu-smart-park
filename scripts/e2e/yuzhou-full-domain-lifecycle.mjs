#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  LifecycleError,
  cleanup,
  compareIsolation,
  currentState,
  DOMAIN_ORDER,
  provision,
  ROLLBACK_ORDER,
  runForward,
  runRollback,
  STATES,
  validateConfig
} from "../hr-cutover/full-domain-lifecycle.mjs";
import { computeMappingContractHash } from "../hr-cutover/verify-full-domain-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const lifecyclePath = resolve(root, "scripts/hr-cutover/full-domain-lifecycle.mjs");
const lifecycleSource = readFileSync(lifecyclePath, "utf8");
const t4LoaderSource = readFileSync(resolve(root, "scripts/sql/load-yuzhou-t4-payroll-history.sql"), "utf8");
const contract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/full-domain-contract-v1.json"), "utf8"));
const codeSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const mappingContractHash = computeMappingContractHash(contract);
const sandbox = mkdtempSync(join(tmpdir(), "jinhu-hr-cutover-slice2-"));

function privateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function configFor(rehearsal, suffix, ports) {
  const project = `jinhu_hr_migration_lab_full_${suffix}`;
  const targetRoot = join(sandbox, project, "runtime");
  const credentialRoot = join(sandbox, project, "credentials");
  mkdirSync(credentialRoot, { recursive: true, mode: 0o700 });
  chmodSync(credentialRoot, 0o700);
  const etlEnv = join(credentialRoot, "etl.env");
  const t4File = join(credentialRoot, "t4-evidence.json");
  const postgresEnv = join(credentialRoot, "postgres.env");
  const materializationKey = join(credentialRoot, "materialization.key");
  writeFileSync(etlEnv, "fixture-only\n", { mode: 0o600 });
  privateJson(t4File, { status: "COMPLETED", evidenceKind: "fixture" });
  writeFileSync(postgresEnv, "fixture-only\n", { mode: 0o600 });
  writeFileSync(materializationKey, `${"ab".repeat(32)}\n`, { mode: 0o600 });
  const adapterEnv = Object.fromEntries(DOMAIN_ORDER.map((domain) => [domain, { extract: {}, load: {}, rollback: {} }]));
  return {
    formatVersion: 1,
    runId: `yzfull-20260826T120000Z-${codeSha.slice(0, 8)}-r${rehearsal}`,
    rehearsal,
    backend: "fixture",
    triple: { codeSha, sourceSnapshotHash: "3".repeat(64), mappingContractHash },
    source: { databaseAlias: `YuzhouHR_Lab_${suffix}`, readOnly: true, etlEnvFile: etlEnv, t4EvidenceFile: t4File },
    t4Evidence: { status: "COMPLETED", sha256: createHash("sha256").update(readFileSync(t4File)).digest("hex") },
    target: {
      database: project,
      composeProject: project,
      volume: `${project}_postgres_data`,
      postgresContainer: `${project}-postgres-1`,
      postgresPort: ports[0],
      apiPort: ports[1],
      webPort: ports[2],
      role: `${project}_operator`,
      accountNamespace: `yzfull_${rehearsal.toLowerCase()}_${project.slice(-12)}`,
      root: targetRoot,
      stagingRoot: join(targetRoot, "staging"),
      evidenceRoot: join(targetRoot, "evidence"),
      fileRoot: join(targetRoot, "files"),
      credentialArtifact: postgresEnv,
      materializationKeyArtifact: materializationKey,
      auditBundle: join(credentialRoot, "cleanup-audit.json")
    },
    adapterEnv
  };
}

const clone = (value) => structuredClone(value);
const expectCode = (code, operation) => assert.throws(operation, (error) => error instanceof LifecycleError && error.code === code, `expected ${code}`);

try {
  assert.match(lifecycleSource, /docker", \["compose", "-p", t\.composeProject/u, "lab PostgreSQL must be created through its pinned Compose project");
  assert.match(lifecycleSource, /scripts\/db-migrate\.sh/u, "lab provisioning must use the official migration runner");
  assert.match(lifecycleSource, /COMPOSE_PROJECT_NAME: t\.composeProject/u, "release scripts must resolve the same isolated Compose project");
  assert.match(lifecycleSource, /scripts\/db-seed-prod\.sh/u, "lab provisioning must apply production-safe seed data");
  assert.match(lifecycleSource, /scripts\/check-init-baseline\.sh/u, "lab provisioning must verify the initialized target baseline");
  assert.match(lifecycleSource, /PostgreSQL init process complete; ready for start up\./u, "lab provisioning must wait past the temporary init server");
  assert.match(lifecycleSource, /consecutiveReady >= 3/u, "lab provisioning must require stable PostgreSQL readiness");
  assert.match(lifecycleSource, /failures\.length === 1 && failures\[0\] === "\[FAIL\] no bootstrap admin found"/u, "only the pre-UAT missing-admin baseline gap may be staged");
  assert.match(lifecycleSource, /ports\.some\(portBusy\)/u, "cleanup must wait for exact loopback port release before residual verification");
  assert.match(lifecycleSource, /type: "network", planned: `\$\{t\.composeProject\}_default`/u, "Compose network must be a first-class planned resource");
  assert.match(lifecycleSource, /\["network", "inspect", entry\.planned\]/u, "network residual verification must inspect the exact planned identity");
  assert.match(lifecycleSource, /\["network", "rm", entry\.planned\]/u, "cleanup must remove the exact registered Compose network");
  assert.doesNotMatch(lifecycleSource, /command\("docker", \["run"/u, "lab provisioning must not bypass the governed Compose identity");
  const configA = configFor("A", "slice2_fixture_a", [45131, 45132, 45133]);
  const configB = configFor("B", "slice2_fixture_b", [45231, 45232, 45233]);
  const configAPath = join(sandbox, "config-a.json");
  const configBPath = join(sandbox, "config-b.json");
  privateJson(configAPath, configA);
  privateJson(configBPath, configB);
  const packageStyleStatus = spawnSync("sh", [resolve(root, "scripts/hr-cutover/full-domain-lifecycle.sh"), "status", "--", "--config", configAPath], { cwd: root, encoding: "utf8" });
  assert.equal(packageStyleStatus.status, 0, packageStyleStatus.stderr);
  assert.equal(JSON.parse(packageStyleStatus.stdout).state, null);

  assert.deepEqual(STATES, ["planned", "provisioned", "extracting", "review_hold", "loading", "verifying", "uat_ready", "rollback_ready", "cleaned"]);
  assert.deepEqual(DOMAIN_ORDER, ["T0", "T1", "T2", "T3", "T4", "T5"]);
  assert.deepEqual(ROLLBACK_ORDER, [...DOMAIN_ORDER].reverse());
  assert.equal(compareIsolation(configA, configB).ok, true);
  for (const domain of DOMAIN_ORDER) {
    const definition = contract.domains[domain];
    for (const field of ["extract", "transform", "load", "rollback"]) {
      assert(contract.triple.mappingContractComponents.includes(definition[field]), `mapping bundle omits ${domain}.${field}`);
    }
  }
  assert(contract.triple.mappingContractComponents.includes("scripts/hr-cutover/domain-adapter.mjs"));
  assert(contract.triple.mappingContractComponents.includes("scripts/sql/load-yuzhou-t4-payroll-history.sql"), "T4 SQL must be pinned by the mapping hash");
  assert.doesNotMatch(t4LoaderSource, /digest\(t\|\|x\.id::text/u, "T4 canonical identity must not derive from random target UUIDs");
  assert.match(t4LoaderSource, /source_content_group_hash\|\|':'\|\|i\.legacy_column_name/u, "T4 snapshot-item identity must derive from stable source content");

  const reused = clone(configB); reused.target.apiPort = configA.target.apiPort;
  expectCode("REHEARSAL_RESOURCE_REUSE", () => compareIsolation(configA, reused));
  const wrongTriple = clone(configB); wrongTriple.triple.sourceSnapshotHash = "4".repeat(64);
  expectCode("TRIPLE_MISMATCH", () => compareIsolation(configA, wrongTriple));
  const wrongMapping = clone(configA); wrongMapping.triple.mappingContractHash = "0".repeat(64);
  expectCode("TRIPLE_MISMATCH", () => validateConfig(wrongMapping));
  const unsafe = clone(configA); unsafe.target.database = "jinhu_production";
  expectCode("UNSAFE_TARGET_IDENTITY", () => validateConfig(unsafe));
  const wrongProject = clone(configA); wrongProject.target.composeProject = "jinhu_hr_migration_lab_full_wrong_project";
  expectCode("UNSAFE_TARGET_IDENTITY", () => validateConfig(wrongProject));
  const wrongHost = clone(configA); wrongHost.postgresHost = "db.example.invalid";
  expectCode("CONFIG_INVALID", () => validateConfig(wrongHost));
  const partial = clone(configA); delete partial.adapterEnv.T5;
  expectCode("CONFIG_INVALID", () => validateConfig(partial));
  const secret = clone(configA); secret.adapterEnv.T0.extract.YUZHOU_API_TOKEN = "redacted";
  expectCode("SECRET_PATTERN_DETECTED", () => validateConfig(secret));
  const unknownEnv = clone(configA); unknownEnv.adapterEnv.T0.extract.YUZHOU_UNREVIEWED_FLAG = "yes";
  expectCode("ADAPTER_ENV_DENIED", () => validateConfig(unknownEnv));
  const t4Missing = clone(configA); t4Missing.t4Evidence.status = "NOT_STARTED";
  expectCode("T4_EXTRACTION_NOT_STARTED", () => validateConfig(t4Missing));
  assert(!existsSync(configA.target.root), "T4 gate must fail before the first runtime write");
  const t4Tampered = clone(configA); t4Tampered.t4Evidence.sha256 = "9".repeat(64);
  expectCode("T4_EVIDENCE_HASH_MISMATCH", () => validateConfig(t4Tampered));
  const realT4Gate = configFor("A", "slice2_real_t4_gate", [45031, 45032, 45033]);
  realT4Gate.backend = "lab";
  const actualT4Evidence = readFileSync(resolve(root, ".trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json"));
  writeFileSync(realT4Gate.source.t4EvidenceFile, actualT4Evidence, { mode: 0o600 });
  chmodSync(realT4Gate.source.t4EvidenceFile, 0o600);
  realT4Gate.triple.sourceSnapshotHash = JSON.parse(actualT4Evidence).sourceBackupSha256;
  realT4Gate.t4Evidence.sha256 = createHash("sha256").update(actualT4Evidence).digest("hex");
  const dirty = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).stdout.trim() !== "";
  if (dirty) expectCode("CODE_WORKTREE_DIRTY", () => validateConfig(realT4Gate));
  else assert.doesNotThrow(() => validateConfig(realT4Gate));
  const candidateDrift = JSON.parse(actualT4Evidence);
  candidateDrift.productionCandidate.candidateRows = 8343;
  privateJson(realT4Gate.source.t4EvidenceFile, candidateDrift);
  realT4Gate.t4Evidence.sha256 = createHash("sha256").update(readFileSync(realT4Gate.source.t4EvidenceFile)).digest("hex");
  expectCode("T4_EVIDENCE_INVALID", () => validateConfig(realT4Gate));
  assert(!existsSync(realT4Gate.target.root), "invalid real T4 evidence must block before any resource write");
  chmodSync(configA.source.etlEnvFile, 0o644);
  expectCode("UNSAFE_FILE_PERMISSION", () => validateConfig(configA));
  chmodSync(configA.source.etlEnvFile, 0o600);

  assert.equal(provision(configA).state, "provisioned");
  expectCode("RUN_ALREADY_EXISTS", () => provision(configA));
  expectCode("FIXTURE_CANNOT_ENTER_UAT_READY", () => runForward(configA, configAPath));
  assert.equal(currentState(configA), "verifying");
  const cleaned = cleanup(configA, { recovery: true });
  assert.equal(cleaned.state, "verifying");
  assert.equal(cleaned.residualCount, 0);
  assert(cleaned.resourceLedger.every((entry) => entry.removed && entry.residualCount === 0));
  assert.equal(currentState(configA), "verifying");

  const auditA = JSON.parse(readFileSync(configA.target.auditBundle, "utf8"));
  assert.equal(auditA.resourceLedger.filter((entry) => entry.type === "credential_artifact").length, 2, "PostgreSQL and materialization credentials must both be registered");
  assert(auditA.resourceLedger.filter((entry) => entry.type === "credential_artifact").every((entry) => entry.removed && entry.residualCount === 0));
  const journal = auditA.journal;
  assert.deepEqual(journal.filter((row) => row.kind === "state").map((row) => row.state), STATES.slice(0, 6));
  assert.deepEqual(journal.filter((row) => row.kind === "child" && row.phase === "extract").map((row) => row.domain), DOMAIN_ORDER);
  assert.deepEqual(journal.filter((row) => row.kind === "child" && row.phase === "load").map((row) => row.domain), DOMAIN_ORDER);
  assert.equal(journal.find((row) => row.kind === "verification")?.qualifiesForUatReady, false);
  assert(!readFileSync(configA.target.auditBundle, "utf8").match(/password|token|postgres(?:ql)?:\/\//i));

  const interrupted = configFor("A", "slice2_signal_a", [45331, 45332, 45333]);
  assert.equal(provision(interrupted).state, "provisioned");
  const recovered = cleanup(interrupted, { recovery: true });
  assert.equal(recovered.residualCount, 0);
  assert.equal(recovered.state, "provisioned");

  const residual = configFor("B", "slice2_residual_b", [45431, 45432, 45433]);
  assert.equal(provision(residual).state, "provisioned");
  writeFileSync(join(residual.target.root, "fixture-resources", "unregistered"), "x", { mode: 0o600 });
  expectCode("RESOURCE_RESIDUAL_NONZERO", () => cleanup(residual, { recovery: true }));
  assert(existsSync(join(residual.target.root, "fixture-resources", "unregistered")), "cleanup must preserve unregistered resources");
  rmSync(join(residual.target.root, "fixture-resources", "unregistered"));
  assert.equal(cleanup(residual, { recovery: true }).residualCount, 0);

  const failedChild = configFor("B", "slice2_child_failure_b", [45531, 45532, 45533]);
  failedChild.adapterEnv.T2.load.YUZHOU_FIXTURE_FAIL = "T2.load";
  const failedChildPath = join(sandbox, "config-child-failure.json");
  privateJson(failedChildPath, failedChild);
  assert.equal(provision(failedChild).state, "provisioned");
  expectCode("CHILD_FAILED", () => runForward(failedChild, failedChildPath));
  const failedJournal = readFileSync(join(failedChild.target.evidenceRoot, "lifecycle-journal.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(failedJournal.filter((row) => row.kind === "child" && row.phase === "load").map((row) => row.domain), ["T0", "T1"]);
  assert.equal(cleanup(failedChild, { recovery: true }).residualCount, 0);

  const concurrent = configFor("B", "slice2_concurrent_b", [45731, 45732, 45733]);
  concurrent.adapterEnv.T0.extract.YUZHOU_FIXTURE_DELAY_MS = "1000";
  const concurrentPath = join(sandbox, "config-concurrent.json");
  privateJson(concurrentPath, concurrent);
  assert.equal(provision(concurrent).state, "provisioned");
  const firstRun = spawn(process.execPath, [lifecyclePath, "run", "--config", concurrentPath], { cwd: root, stdio: "ignore" });
  const firstRunClosed = new Promise((resolveClose) => firstRun.once("close", resolveClose));
  await new Promise((resolveStarted) => {
    const path = join(concurrent.target.evidenceRoot, "lifecycle-journal.jsonl");
    const poll = setInterval(() => {
      if (readFileSync(path, "utf8").includes('"state":"extracting"')) { clearInterval(poll); resolveStarted(); }
    }, 20);
  });
  const competingRun = spawnSync(process.execPath, [lifecyclePath, "run", "--config", concurrentPath], { cwd: root, encoding: "utf8" });
  assert.notEqual(competingRun.status, 0, "concurrent run must be rejected");
  assert.match(competingRun.stderr, /RUN_CONCURRENT/);
  assert.notEqual(await firstRunClosed, 0);
  assert.equal(currentState(concurrent), "verifying");
  const concurrentAudit = JSON.parse(readFileSync(concurrent.target.auditBundle, "utf8"));
  assert(concurrentAudit.resourceLedger.every((entry) => entry.removed && entry.residualCount === 0));

  const signalled = configFor("A", "slice2_real_signal_a", [45631, 45632, 45633]);
  signalled.adapterEnv.T0.extract.YUZHOU_FIXTURE_DELAY_MS = "5000";
  const signalledPath = join(sandbox, "config-signalled.json");
  privateJson(signalledPath, signalled);
  assert.equal(provision(signalled).state, "provisioned");
  const signalResult = await new Promise((resolveSignal) => {
    const child = spawn(process.execPath, [lifecyclePath, "run", "--config", signalledPath], { cwd: root, stdio: "ignore" });
    const journalPath = join(signalled.target.evidenceRoot, "lifecycle-journal.jsonl");
    const startedAt = Date.now();
    const poll = setInterval(() => {
      const extracting = existsSync(journalPath) && readFileSync(journalPath, "utf8").includes('"state":"extracting"');
      if (extracting || Date.now() - startedAt > 3000) {
        clearInterval(poll);
        child.kill("SIGTERM");
      }
    }, 50);
    child.once("close", (code, signal) => resolveSignal({ code, signal }));
  });
  assert(signalResult.code !== 0 || signalResult.signal, "signalled run must not succeed");
  assert(!existsSync(join(signalled.target.root, "fixture-resources")), "signal trap must remove fixture resources");
  const signalFinal = JSON.parse(readFileSync(signalled.target.auditBundle, "utf8"));
  assert(signalFinal.resourceLedger.every((entry) => entry.removed && entry.residualCount === 0));

  const source = readFileSync(lifecyclePath, "utf8");
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) assert(source.includes(`process.once(\"${signal}\"`), `${signal} trap missing`);
  assert(
    source.indexOf('if (args.command === "resume") installSignalCleanup(config);') < source.lastIndexOf("acquireOperationLock(config, configPath, args.command"),
    "resume signal recovery must be installed before the operation lock can be created"
  );
  for (const gate of ['["context", "inspect"', '["inspect", t.postgresContainer]', '["volume", "inspect", t.volume]']) assert(source.includes(gate), `lab pre-write resource gate missing: ${gate}`);
  assert(!source.includes("production import"));
  console.log("Yuzhou full-domain Slice 2 lifecycle contract passed (fixture provision/verification-stop/recovery/residual and negative gates).");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
