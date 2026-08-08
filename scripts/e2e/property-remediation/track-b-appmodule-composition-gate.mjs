/* global clearTimeout, process, setTimeout */
import { spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_POSTGRES_IMAGE,
  assertExactEphemeralPostgresContainer,
  buildEphemeralPostgresRunArgs,
  resolveCreatedContainerId,
  runDocker,
  validateRunId
} from "./bootstrap/ephemeral-postgres.mjs";
import { cleanupExactLifecycle } from "./track-b2a-c4-runtime-lifecycle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const apiRoot = resolve(root, "apps/api");
const apiSrcRoot = resolve(apiRoot, "src");
const researchRoot = resolve(root,
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research");
const runnerPath = fileURLToPath(import.meta.url);
const pgSpec = resolve(apiRoot, "src/app.module.composition.pg.spec.ts");
const staticSpec = resolve(root,
  "scripts/e2e/property-remediation/track-b-appmodule-composition-gate.spec.mjs");
const ephemeralPostgresHelper = resolve(root,
  "scripts/e2e/property-remediation/bootstrap/ephemeral-postgres.mjs");
const lifecycleHelper = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c4-runtime-lifecycle.mjs");
const runId = validateRunId(process.env.PROPERTY_APPMODULE_COMPOSITION_RUN_ID ?? "");
const runIdDigest = sha256(runId);
const artifactPath = resolve(researchRoot, `appmodule-composition-${runId}.json`);
const manifestPath = resolve(researchRoot, `appmodule-composition-${runId}.manifest.txt`);
const reservationPath = resolve(researchRoot,
  `appmodule-composition-runid-${runIdDigest}.reservation.json`);
const containerName = `pr192_b_appmodule_${runId}_db`;
const fixtureLabel = "pr192-b-appmodule-composition-gate";
const databaseName = "pr192_b_appmodule_composition";
const postgresUser = "pr192_appmodule";
const postgresPassword = `${runId}_local_only`;
const expectedTests = 4;
const expectedLocalTests = 12;
const childTimeoutMs = 20_000;
const finalPostgresInitMarker =
  "PostgreSQL init process complete; ready for start up.";
const startedAt = new Date().toISOString();
const startedAtMs = Date.now();

const authorityInputs = [
  resolve(root, "apps/api/src/app.module.ts"),
  pgSpec,
  runnerPath,
  staticSpec,
  resolve(root, "apps/api/src/modules/property-tasks/property-task.module.ts"),
  resolve(root, "apps/api/src/modules/property-approvals/property-approval.module.ts"),
  resolve(researchRoot, "c4-runtime-formal-final-signoff-v13l.md"),
  resolve(researchRoot, "b-property-task-runtime-v1.grammar"),
  resolve(researchRoot, "b-property-task-projection-callsite-v1.grammar"),
  resolve(researchRoot, "b-property-task-runtime-v1-handoff.md"),
  resolve(researchRoot, "b-property-task-runtime-v1-handoff-signoff.md")
];
const workspaceInputs = [
  resolve(root, "apps/api/package.json"),
  resolve(root, "apps/api/tsconfig.json"),
  resolve(root, "pnpm-lock.yaml"),
  resolve(root, "pnpm-workspace.yaml")
];
const executionAuthorityInputs = [
  ephemeralPostgresHelper,
  lifecycleHelper
];

let creationAttempted = false;
let containerId = null;
let volumeName = null;
let hostPort = null;
let cleanupEvidence = null;
let testChild = null;
let interruptedBy = null;
let currentStage = "preflight";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function relativePath(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function recursiveRegularTypeScriptFiles(directory) {
  const directoryMetadata = lstatSync(directory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new Error(`AppModule execution closure directory is not real:${relativePath(directory)}`);
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      throw new Error(`AppModule execution closure forbids symlink:${relativePath(path)}`);
    }
    if (metadata.isDirectory()) return recursiveRegularTypeScriptFiles(path);
    if (!metadata.isFile()) {
      throw new Error(`AppModule execution closure requires regular entries:${relativePath(path)}`);
    }
    return path.endsWith(".ts") ? [path] : [];
  }).sort();
}

function assertRegularSignedInput(path) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink()) throw new Error(`signed input forbids symlink:${path}`);
  if (!metadata.isFile()) throw new Error(`signed input requires regular file:${path}`);
  return path;
}

function buildSignedInputs() {
  const apiExecutionClosure = recursiveRegularTypeScriptFiles(apiSrcRoot);
  return [...new Set([
    ...authorityInputs,
    ...apiExecutionClosure,
    ...workspaceInputs,
    ...executionAuthorityInputs
  ])].sort().map(assertRegularSignedInput);
}

function serializableError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack_sha256: error instanceof Error && error.stack ? sha256(error.stack) : null
  };
}

function assertResearchTargets() {
  if (lstatSync(researchRoot).isSymbolicLink() || realpathSync(researchRoot) !== researchRoot) {
    throw new Error("AppModule composition research root must be a real directory");
  }
  for (const path of [artifactPath, manifestPath, reservationPath]) {
    if (dirname(path) !== researchRoot) {
      throw new Error("AppModule composition evidence must be a direct research child");
    }
  }
  if (existsSync(reservationPath)) {
    throw new Error(`AppModule composition runId is permanently reserved:${runId}`);
  }
  if (existsSync(artifactPath) || existsSync(manifestPath)) {
    throw new Error(`AppModule composition evidence target already exists:${runId}`);
  }
}

function reserveUniqueRunId() {
  const reservation = {
    schema_version: "property-appmodule-composition-runid-reservation-v1",
    run_id: runId,
    run_id_sha256: runIdDigest,
    artifact: relativePath(artifactPath),
    detached_manifest: relativePath(manifestPath),
    reserved_at: startedAt
  };
  const bytes = `${JSON.stringify(reservation, null, 2)}\n`;
  writeFileSync(reservationPath, bytes, { flag: "wx", mode: 0o600 });
  return {
    ...reservation,
    path: relativePath(reservationPath),
    bytes: Buffer.byteLength(bytes),
    raw_sha256: sha256(bytes),
    immutable_and_preserved: true
  };
}

function captureInputs(stage) {
  const files = buildSignedInputs().map((path) => {
    const bytes = readFileSync(path);
    return {
      path: relativePath(path),
      bytes: bytes.length,
      raw_sha256: sha256(bytes)
    };
  });
  const grammar = `property-appmodule-composition-input-freeze-v1\n${files.map((file) =>
    `${file.path}\t${file.bytes}\t${file.raw_sha256}\n`).join("")}`;
  return { stage, files, grammar, raw_sha256: sha256(grammar) };
}

function assertInputsFrozen(inputFreeze, stage) {
  const observed = captureInputs(stage);
  if (observed.raw_sha256 !== inputFreeze.raw_sha256) {
    throw new Error(
      `AppModule composition signed input drift:${inputFreeze.raw_sha256}:${observed.raw_sha256}`
    );
  }
  return observed;
}

const docker = (args, options = {}) => runDocker(args, {
  cwd: root,
  ...options
});

function inspect(type, target) {
  const args = type === "volume"
    ? ["volume", "inspect", target]
    : ["inspect", "--type", "container", target];
  const result = docker(args, { allowFailure: true });
  if (result.status !== 0) {
    if (/no such (object|container|volume)/iu.test(`${result.stdout}\n${result.stderr}`)) {
      return null;
    }
    throw new Error(`docker ${type} inspect failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout)[0] ?? null;
}

function cleanup() {
  if (cleanupEvidence) return cleanupEvidence;
  cleanupEvidence = cleanupExactLifecycle({
    creationAttempted,
    containerName,
    containerId,
    volumeName,
    inspectContainer: (name) => inspect("container", name),
    inspectVolume: (name) => inspect("volume", name),
    validateContainer: (observed) => assertExactEphemeralPostgresContainer(observed, {
      containerName,
      databaseName,
      fixtureLabel,
      runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE,
      requireLoopbackPort: false,
      requireRunning: false
    }),
    removeContainer: (id) => docker(["rm", "-f", "-v", id]),
    removeVolume: (name) => docker(["volume", "rm", name])
  });
  return cleanupEvidence;
}

function safeCleanup() {
  try {
    return cleanup();
  } catch (error) {
    return {
      status: "failed",
      attempted: creationAttempted,
      container_absent: false,
      anonymous_volume_absent: false,
      errors: [`cleanup threw:${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function assertNotInterrupted() {
  if (interruptedBy) {
    throw new Error(`AppModule composition interrupted:${interruptedBy}`);
  }
}

function startPostgres() {
  assertNotInterrupted();
  if (inspect("container", containerName)) {
    throw new Error(`exclusive AppModule fixture already exists:${containerName}`);
  }
  creationAttempted = true;
  const created = docker(buildEphemeralPostgresRunArgs({
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    postgresUser,
    postgresPassword
  }));
  const observed = inspect("container", containerName);
  const exact = assertExactEphemeralPostgresContainer(observed, {
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE,
    requireLoopbackPort: true
  });
  containerId = resolveCreatedContainerId(created.stdout, observed, {
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE,
    requireLoopbackPort: true
  });
  volumeName = exact.volumeName;
  hostPort = exact.hostPort;

  let stableProbes = 0;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    assertNotInterrupted();
    const current = inspect("container", containerName);
    const currentExact = assertExactEphemeralPostgresContainer(current, {
      containerName,
      databaseName,
      fixtureLabel,
      runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE,
      requireLoopbackPort: true
    });
    if (currentExact.containerId !== containerId) {
      throw new Error("AppModule PostgreSQL container identity drift");
    }
    const logs = docker(["logs", "--tail", "80", containerId], {
      allowFailure: true
    });
    const ready = docker(["exec", containerId, "pg_isready", "-U", postgresUser,
      "-d", databaseName], { allowFailure: true });
    const select = ready.status === 0
      ? docker(["exec", "-i", containerId, "psql", "-X", "-qAt", "-v",
        "ON_ERROR_STOP=1", "-U", postgresUser, "-d", databaseName], {
        input: "SELECT 1;\n",
        allowFailure: true
      })
      : { status: null, stdout: "" };
    const stable = logs.status === 0 && logs.stdout.includes(finalPostgresInitMarker)
      && ready.status === 0 && select.status === 0 && select.stdout.trim() === "1";
    stableProbes = stable ? stableProbes + 1 : 0;
    if (stableProbes >= 2) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("AppModule PostgreSQL final readiness timeout");
}

function parseTap(output, expected, label) {
  const lines = output.replaceAll("\r\n", "\n").split("\n");
  if (lines.some((line) => /^\s*not ok\b/u.test(line)
    || /^\s*Bail out!/iu.test(line)
    || /^\s*ok\b.*#\s*(?:SKIP|TODO)\b/iu.test(line))) {
    throw new Error(`${label} TAP contains failure, bailout, skip, or todo`);
  }
  const summary = Object.fromEntries(["tests", "pass", "fail", "skipped"].map((field) => {
    const matches = lines.map((line) => line.match(
      new RegExp(`^# ${field} (0|[1-9]\\d*)$`, "u")
    )).filter(Boolean);
    if (matches.length !== 1) {
      throw new Error(`${label} TAP requires one ${field} summary`);
    }
    return [field, Number(matches[0][1])];
  }));
  if (summary.tests !== expected || summary.pass !== expected
    || summary.fail !== 0 || summary.skipped !== 0) {
    throw new Error(`${label} TAP mismatch:${JSON.stringify(summary)}`);
  }
  return summary;
}

function runLocalGate() {
  const gateStartedAt = Date.now();
  const result = spawnSync(process.execPath,
    [staticSpec], {
      cwd: root,
      encoding: "utf8",
      timeout: childTimeoutMs,
      maxBuffer: 8 * 1024 * 1024
    });
  if (result.error) {
    throw new Error(`AppModule local gate failed:${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`AppModule local gate failed:${JSON.stringify({
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr
    })}`);
  }
  return {
    command: "node track-b-appmodule-composition-gate.spec.mjs",
    duration_ms: Date.now() - gateStartedAt,
    timeout_ms: childTimeoutMs,
    tap: parseTap(result.stdout, expectedLocalTests, "AppModule local gate")
  };
}

function runCompositionSpec() {
  return new Promise((resolvePromise, rejectPromise) => {
    const testStartedAt = Date.now();
    const environment = {
      ...process.env,
      NODE_ENV: "test",
      POSTGRES_HOST: "127.0.0.1",
      POSTGRES_PORT: hostPort,
      POSTGRES_DB: databaseName,
      POSTGRES_USER: postgresUser,
      POSTGRES_PASSWORD: postgresPassword,
      JWT_SECRET: `${runId}_jwt_secret_local_composition_only`,
      PROPERTY_APPMODULE_COMPOSITION_PG_REQUIRED: "1",
      IDEMPOTENCY_CLEANUP_ENABLED: "false",
      SAFETY_INSPECT_SCHEDULER_ENABLED: "false",
      VIDEO_ALERT_SCHEDULER_ENABLED: "false",
      MQTT_BROKER_URL: ""
    };
    testChild = spawn(process.execPath,
      ["--require", "ts-node/register", pgSpec], {
        cwd: apiRoot,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"]
      });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      testChild?.kill("SIGKILL");
    }, childTimeoutMs);
    testChild.stdout.setEncoding("utf8");
    testChild.stderr.setEncoding("utf8");
    testChild.stdout.on("data", (chunk) => { stdout += chunk; });
    testChild.stderr.on("data", (chunk) => { stderr += chunk; });
    testChild.once("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    testChild.once("close", (status, signal) => {
      clearTimeout(timeout);
      testChild = null;
      if (timedOut) {
        rejectPromise(new Error(`AppModule composition hard timeout:${childTimeoutMs}ms`));
        return;
      }
      if (interruptedBy) {
        rejectPromise(new Error(`AppModule composition interrupted:${interruptedBy}`));
        return;
      }
      if (status !== 0) {
        rejectPromise(new Error(`AppModule composition spec failed:${JSON.stringify({
          status,
          signal,
          stdout,
          stderr
        })}`));
        return;
      }
      try {
        resolvePromise({
          command: "node --require ts-node/register app.module.composition.pg.spec.ts",
          duration_ms: Date.now() - testStartedAt,
          timeout_ms: childTimeoutMs,
          tap: parseTap(stdout, expectedTests, "AppModule composition")
        });
      } catch (error) {
        rejectPromise(error);
      }
    });
  });
}

function publishOutcome(outcome) {
  const artifactBytes = `${JSON.stringify(outcome, null, 2)}\n`;
  const artifactSha = sha256(artifactBytes);
  const manifestBytes = [
    "property-appmodule-composition-formal-v1",
    `run_id\t${runId}`,
    `status\t${outcome.status}`,
    `candidate_admissible\t${outcome.candidate_admissible}`,
    "publication_contract\tartifact-and-detached-manifest-both-required",
    `reservation\t${relativePath(reservationPath)}\t${outcome.run_id_reservation.raw_sha256}`,
    `input_freeze_before\t${outcome.input_freeze_before?.raw_sha256 ?? "unavailable"}`,
    `input_freeze_after_local\t${outcome.input_freeze_after_local?.raw_sha256 ?? "unavailable"}`,
    `input_freeze_after_test\t${outcome.input_freeze_after_test?.raw_sha256 ?? "unavailable"}`,
    `input_freeze_after_cleanup\t${outcome.input_freeze_after_cleanup?.raw_sha256 ?? "unavailable"}`,
    `artifact\t${relativePath(artifactPath)}\t${Buffer.byteLength(artifactBytes)}\t${artifactSha}`,
    ""
  ].join("\n");
  writeFileSync(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
  writeFileSync(artifactPath, artifactBytes, { flag: "wx", mode: 0o600 });
  return {
    artifact: relativePath(artifactPath),
    artifact_raw_sha256: artifactSha,
    detached_manifest: relativePath(manifestPath),
    detached_manifest_raw_sha256: sha256(manifestBytes)
  };
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    interruptedBy = signal;
    testChild?.kill("SIGTERM");
  });
}

assertResearchTargets();
let reservationEvidence = null;
let inputFreezeBefore = null;
let inputFreezeAfterLocal = null;
let inputFreezeAfterTest = null;
let inputFreezeAfterCleanup = null;
let localGate = null;
let pgGate = null;
let primaryError = null;
let originalFailureStage = null;

try {
  currentStage = "run-id-reservation";
  reservationEvidence = reserveUniqueRunId();
  currentStage = "input-freeze-before";
  inputFreezeBefore = captureInputs("before-execution");
  currentStage = "local-gate";
  localGate = runLocalGate();
  currentStage = "input-freeze-after-local";
  inputFreezeAfterLocal = assertInputsFrozen(inputFreezeBefore, "after-local");
  currentStage = "postgres-start";
  startPostgres();
  currentStage = "postgres-composition-test";
  pgGate = await runCompositionSpec();
  currentStage = "input-freeze-after-test";
  inputFreezeAfterTest = assertInputsFrozen(inputFreezeBefore, "after-test");
} catch (error) {
  primaryError = error;
  originalFailureStage = currentStage;
} finally {
  currentStage = "cleanup";
  const cleaned = safeCleanup();
  if (cleaned.status !== "passed" && !primaryError) {
    primaryError = new Error("AppModule composition exact cleanup failed");
    originalFailureStage = "cleanup";
  }
  if (interruptedBy && !primaryError) {
    primaryError = new Error(`AppModule composition interrupted:${interruptedBy}`);
    originalFailureStage = "cleanup";
  }
  currentStage = "input-freeze-after-cleanup";
  try {
    inputFreezeAfterCleanup = inputFreezeBefore
      ? assertInputsFrozen(inputFreezeBefore, "after-cleanup")
      : null;
  } catch (error) {
    if (!primaryError) {
      primaryError = error;
      originalFailureStage = "input-freeze-after-cleanup";
    }
  }
}

const finishedAt = new Date().toISOString();
const commonOutcome = {
  schema_version: "property-appmodule-composition-formal-v1",
  run_id: runId,
  run_id_reservation: reservationEvidence,
  candidate_scope: "appmodule-single-file-property-task-composition",
  started_at: startedAt,
  finished_at: finishedAt,
  duration_ms: Date.now() - startedAtMs,
  child_timeout_ms: childTimeoutMs,
  background_callback_fence: {
    hard_timeout_below_30_seconds: childTimeoutMs < 30_000,
    iot_realtime_earliest_callback_ms: 30_000,
    iot_rule_status_earliest_callback_ms: 60_000,
    environment_disabled: [
      "IDEMPOTENCY_CLEANUP_ENABLED",
      "SAFETY_INSPECT_SCHEDULER_ENABLED",
      "VIDEO_ALERT_SCHEDULER_ENABLED",
      "MQTT_BROKER_URL"
    ]
  },
  authority_inputs: authorityInputs.map(relativePath),
  execution_authority_inputs: executionAuthorityInputs.map(relativePath),
  api_execution_closure: inputFreezeBefore?.files
    .map((file) => file.path).filter((path) => path.startsWith("apps/api/src/")) ?? [],
  execution_closure: inputFreezeBefore?.files.map((file) => file.path)
    .filter((path) => path.startsWith("apps/api/src/")
      || executionAuthorityInputs.map(relativePath).includes(path)) ?? [],
  signed_inputs: inputFreezeBefore?.files.map((file) => file.path) ?? [],
  input_freeze_before: inputFreezeBefore,
  input_freeze_after_local: inputFreezeAfterLocal,
  input_freeze_after_test: inputFreezeAfterTest,
  input_freeze_after_cleanup: inputFreezeAfterCleanup,
  local_gate: localGate,
  postgres_gate: pgGate,
  cleanup: cleanupEvidence
};

const outcome = primaryError
  ? {
    ...commonOutcome,
    status: "failed",
    candidate_admissible: false,
    failed_stage: originalFailureStage ?? currentStage,
    error: serializableError(primaryError)
  }
  : {
    ...commonOutcome,
    status: "passed",
    candidate_admissible: true,
    open_p0_p1: []
  };

let publication = null;
try {
  publication = publishOutcome(outcome);
} catch (error) {
  primaryError = primaryError ?? error;
  process.stderr.write(`${JSON.stringify({
    status: "failed",
    candidate_admissible: false,
    run_id: runId,
    publication: { status: "failed", error: serializableError(error) },
    cleanup: cleanupEvidence
  })}\n`);
  process.exitCode = 1;
}

if (publication) {
  const summary = {
    status: outcome.status,
    candidate_admissible: outcome.candidate_admissible,
    run_id: runId,
    duration_ms: outcome.duration_ms,
    publication,
    cleanup: cleanupEvidence
  };
  if (primaryError) {
    process.stderr.write(`${JSON.stringify(summary)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  }
}
