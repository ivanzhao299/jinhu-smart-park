/* global process */
import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_POSTGRES_IMAGE,
  assertExactEphemeralPostgresContainer,
  assertNoDatabaseUrlOverrides,
  buildEphemeralPostgresRunArgs,
  resolveCreatedContainerId,
  runDocker,
  validateRunId
} from "./bootstrap/ephemeral-postgres.mjs";
import {
  cleanupExactLifecycle,
  outcomeAuthority,
  publishOutcome,
  reserveRunId
} from "./track-b2a-c4-runtime-lifecycle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationRoot = resolve(root, "database/migrations");
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research");
const foundationResearchRoot = resolve(root,
  ".trellis/tasks/07-30-pr192-b-identity-control-plane/research");
const remediationResearchRoot = resolve(root,
  ".trellis/tasks/07-30-pr192-property-productization-remediation/research");
const taskRoot = resolve(root, "apps/api/src/modules/property-tasks");
const approvalRoot = resolve(root, "apps/api/src/modules/property-approvals");
const seed = resolve(root, "database/seeds/000001_s1_production_core.sql");
const inputGate = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c4-input-gate.mjs");
const inputGateSpec = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c4-input-gate.spec.mjs");
const lifecyclePath = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c4-runtime-lifecycle.mjs");
const runnerSpec = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c4-runtime-gate.spec.mjs");
const pgSpec = resolve(taskRoot, "property-task.runtime.pg.spec.ts");
const productionOrchestrator = resolve(taskRoot, "property-task.orchestrator.ts");
const matrixFreeze = resolve(researchRoot, "c4-full-concurrency-matrix-freeze-v1.md");
const matrixFreezeSignoff = resolve(researchRoot,
  "c4-full-concurrency-matrix-freeze-v1-signoff.md");
const failedStateAddendum = resolve(researchRoot,
  "c4-existing-only-failed-state-addendum-v1.md");
const failedStateAddendumSignoff = resolve(researchRoot,
  "c4-existing-only-failed-state-addendum-v1-signoff.md");
const failedStateAddendumV2 = resolve(researchRoot,
  "c4-existing-only-failed-state-addendum-v2.md");
const failedStateAddendumV2Signoff = resolve(researchRoot,
  "c4-existing-only-failed-state-addendum-v2-signoff.md");
const C4_FAILED_STATE_ADDENDUM_SHA256 =
  "eccc6433b7341a47b86fc5998a2e7e414b9dbd06ad6ca943f20ed43dd6ae0e51";
const C4_FAILED_STATE_ADDENDUM_SIGNOFF_SHA256 =
  "c9fd87b6bef48cbdb96df44851296fa890777b31850293ba56b97d24e8f8abe3";
const C4_FAILED_STATE_ADDENDUM_V2_SHA256 =
  "0609ee349506b71d62c4f14a865859bb386c847c7a2caf123f79a21c7b6d8213";
const C4_FAILED_STATE_ADDENDUM_V2_SIGNOFF_SHA256 =
  "60d2dc7d8f0207eceb51a6926f466202f0093b30d7caa08e0629b3da018ee324";
const C4_FAILED_STATE_PG_SPEC_SHA256 =
  "c5b47e80e51d9eaeb40075c2fc98bae039997b12265c6350ccd688303d94c077";
const runId = validateRunId(process.env.PROPERTY_B2A_C4_RUN_ID
  ?? `b2ac4_${randomBytes(9).toString("hex")}`);
const attemptId = `attempt_${randomBytes(12).toString("hex")}`;
const preflightOnly = process.env.PROPERTY_B2A_C4_PREFLIGHT_ONLY === "yes";
const artifactPath = preflightOnly ? null
  : resolve(root, process.env.PROPERTY_B2A_C4_ARTIFACT_PATH ?? "");
const manifestPath = artifactPath === null ? null : artifactPath.endsWith(".json")
  ? `${artifactPath.slice(0, -5)}.manifest.txt` : `${artifactPath}.manifest.txt`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const startedAt = new Date().toISOString();

if (!preflightOnly && !process.env.PROPERTY_B2A_C4_ARTIFACT_PATH) {
  throw new Error("PROPERTY_B2A_C4_ARTIFACT_PATH is required");
}
if (!preflightOnly && (dirname(artifactPath) !== researchRoot || dirname(manifestPath) !== researchRoot
  || !/^c4-runtime-[a-z0-9_-]+\.json$/u.test(artifactPath.slice(researchRoot.length + 1))
  || existsSync(artifactPath) || existsSync(manifestPath)
  || lstatSync(researchRoot).isSymbolicLink() || realpathSync(researchRoot) !== researchRoot)) {
  throw new Error("C4 runtime candidate must be a new direct c4-runtime-*.json research child");
}
assertNoDatabaseUrlOverrides(process.env);

const migrationChain = [
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000190_property_b_migration_compatibility_control.sql",
  "000193_property_b_runtime_integrity_forward_fix.sql",
  "000194_property_task_projection_contract_correction.sql",
  "000195_property_mutation_receipt_contract_v2.sql"
];
const baselineMigrations = readdirSync(migrationRoot).filter((name) => {
  const number = Number(name.match(/^(\d{6})_.*\.sql$/u)?.[1]);
  return Number.isInteger(number) && number <= 182 && number !== 175;
}).sort();

function recursiveFiles(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? recursiveFiles(path, predicate) : predicate(path) ? [path] : [];
  });
}
const signedInputs = [
  resolve(researchRoot, "c4-input-freeze-v2.txt"),
  resolve(researchRoot, "c4-input-gate-evidence-v2.txt"),
  resolve(researchRoot, "c4-input-freeze-v1.txt"),
  resolve(researchRoot, "c4-runtime-formal-candidate-v11-20260801i.json"),
  resolve(researchRoot, "c4-runtime-formal-candidate-v11-20260801i.manifest.txt"),
  resolve(researchRoot,
    "c4-runtime-runid-56b1fd4b07d1c0be69ecb7dd114e702df5a6b81caaa5b5651ae82b95a77dca70.reservation.json"),
  resolve(researchRoot, "b2a-c3-final-gate-signoff.md"),
  resolve(researchRoot, "b2a-c3-runtime-formal-candidate-20260801d.json"),
  resolve(researchRoot, "b2a-c3-runtime-formal-candidate-20260801d.manifest.txt"),
  resolve(researchRoot, "b-approval-runtime-v2.txt"),
  resolve(foundationResearchRoot, "b-property-foundation-contract-v2-attestation.txt"),
  resolve(researchRoot, "b-property-foundation-runtime-v2.txt"),
  resolve(researchRoot, "appmodule-contract-v2-reattestation.txt"),
  resolve(researchRoot, "b2a-c1-error-filter-handoff.md"),
  resolve(researchRoot, "b2a-c2-candidate-gate-artifact-v12d.json"),
  resolve(researchRoot, "b2a-c2-candidate-gate-artifact-v12d.json.manifest.json"),
  resolve(researchRoot, "b2a-c2-candidate-gate-artifact-v12d.json.projection-schema.grammar"),
  resolve(researchRoot, "b2a-c2-candidate-gate-artifact-v12d.json.functions.json"),
  resolve(researchRoot, "b2a-c2-projection-budget-addendum-candidate.md"),
  resolve(researchRoot, "b2a-c2-projection-budget-addendum-candidate-evidence.md"),
  resolve(researchRoot, "b2a-c2-projection-budget-addendum-final-signoff.md"),
  ...["b0-runtime-contract-freeze.md", "b0-product-access-freeze.md",
    "b0-identity-control-freeze.md", "b0-schema-physical-addendum.md"]
    .map((name) => resolve(remediationResearchRoot, name)),
  matrixFreeze,
  matrixFreezeSignoff,
  failedStateAddendum,
  failedStateAddendumSignoff,
  failedStateAddendumV2,
  failedStateAddendumV2Signoff,
  inputGate,
  inputGateSpec,
  lifecyclePath,
  runnerSpec,
  fileURLToPath(import.meta.url),
  resolve(root, "apps/api/src/app.module.ts"),
  resolve(root, "apps/api/src/shared/filters/api-exception.filter.ts"),
  resolve(root, "apps/api/src/shared/filters/api-exception.filter.spec.ts"),
  resolve(root, "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.ts"),
  resolve(root, "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.spec.ts"),
  resolve(root, "apps/api/src/modules/property-tasks/property-task.orchestrator.ts"),
  resolve(root, "apps/api/src/modules/property-tasks/property-task.orchestrator.spec.ts"),
  ...recursiveFiles(approvalRoot, (path) => path.endsWith(".ts")),
  ...recursiveFiles(resolve(root, "packages/shared/src/property-business"),
    (path) => path.endsWith(".ts")),
  ...recursiveFiles(taskRoot, (path) => path.endsWith(".ts")),
  ...baselineMigrations.map((name) => resolve(migrationRoot, name)),
  ...migrationChain.map((name) => resolve(migrationRoot, name)),
  seed,
  resolve(root, "apps/api/package.json"),
  resolve(root, "apps/api/tsconfig.json"),
  resolve(root, "packages/shared/package.json"),
  resolve(root, "pnpm-lock.yaml"),
  resolve(root, "pnpm-workspace.yaml")
];
let inputFreeze = null;
function captureInputs(stage) {
  const files = [...new Set(signedInputs)].sort().map((path) => {
    const bytes = readFileSync(path);
    return { path: path.slice(root.length + 1), bytes: bytes.length, raw_sha256: sha256(bytes) };
  });
  const grammar = `property-remediation-b2a-c4-runtime-input-freeze-v2\n${files.map((file) =>
    `${file.path}\t${file.bytes}\t${file.raw_sha256}\n`).join("")}`;
  return { stage, files, grammar, raw_sha256: sha256(grammar) };
}
function assertInputsFrozen(stage) {
  const observed = captureInputs(stage);
  if (observed.raw_sha256 !== inputFreeze.raw_sha256) {
    throw new Error(`C4 signed input drift: ${inputFreeze.raw_sha256} != ${observed.raw_sha256}`);
  }
  return observed;
}
function captureInputDrift(stage) {
  if (!inputFreeze) return { checked: false, detected: null, stage };
  try {
    const observed = captureInputs(stage);
    return { checked: true, detected: observed.raw_sha256 !== inputFreeze.raw_sha256,
      stage, expected_raw_sha256: inputFreeze.raw_sha256,
      observed_raw_sha256: observed.raw_sha256 };
  } catch (error) {
    return { checked: false, detected: true, stage, error: serializableError(error) };
  }
}

const containerName = `pr192_b2a_c4_${runId}_db`;
const databaseName = "pr192_b2a_c4_gate";
const postgresUser = "pr192_b2a_c4";
const postgresPassword = `${runId}_local_only`;
const fixtureLabel = "pr192-b2a-c4-runtime-gate";
const docker = (args, options = {}) => runDocker(args, { cwd: root, ...options });
let creationAttempted = false;
let containerId = null;
let volumeName = null;
let environment = null;
let cleanupEvidence = null;
let reservationEvidence = null;
let failureDiagnostics = null;
let currentStage = "preflight";

const FINAL_POSTGRES_INIT_MARKER =
  "PostgreSQL init process complete; ready for start up.";
const REQUIRED_STABLE_POSTGRES_PROBES = 2;
const DIAGNOSTIC_LOG_TAIL_LINES = 120;
const DIAGNOSTIC_LOG_MAX_BYTES = 64 * 1024;
const COMMAND_STREAM_MAX_BYTES = 16 * 1024;

function advanceFinalPostgresReadiness(stableProbes, observation) {
  const stable = observation.logs.includes(FINAL_POSTGRES_INIT_MARKER)
    && observation.running === true
    && observation.pgIsReadyStatus === 0
    && observation.selectStatus === 0
    && observation.selectOutput.trim() === "1";
  return stable ? stableProbes + 1 : 0;
}

function redactCommandStream(value) {
  return value
    .replaceAll(postgresPassword, "[redacted]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1[redacted]@")
    .replace(/\b(password|passwd|token|secret|authorization|cookie)\s*[:=]\s*[^\s,;]+/giu,
      "$1=[redacted]");
}

function safeCommandStreamEvidence(value) {
  const bytes = Buffer.from(value ?? "", "utf8");
  const stored = bytes.length > COMMAND_STREAM_MAX_BYTES
    ? bytes.subarray(bytes.length - COMMAND_STREAM_MAX_BYTES) : bytes;
  return {
    captured_bytes: bytes.length,
    stored_bytes: stored.length,
    truncated: stored.length !== bytes.length,
    raw_sha256: sha256(bytes),
    redacted_tail: redactCommandStream(stored.toString("utf8"))
  };
}

function inspect(type, target) {
  const result = docker(type === "volume" ? ["volume", "inspect", target]
    : ["inspect", "--type", type, target], { allowFailure: true });
  if (result.status !== 0) {
    if (/no such (object|container|volume)/iu.test(`${result.stdout}\n${result.stderr}`)) return null;
    throw new Error(`docker ${type} inspect failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout)[0] ?? null;
}
function startPostgres() {
  currentStage = "postgres:create";
  if (inspect("container", containerName)) throw new Error(`fixture already exists:${containerName}`);
  creationAttempted = true;
  const created = docker(buildEphemeralPostgresRunArgs({
    containerName, databaseName, fixtureLabel, runId, postgresUser, postgresPassword
  }));
  const observed = inspect("container", containerName);
  const exact = assertExactEphemeralPostgresContainer(observed, {
    containerName, databaseName, fixtureLabel, runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
  });
  containerId = resolveCreatedContainerId(created.stdout, observed, {
    containerName, databaseName, fixtureLabel, runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
  });
  volumeName = exact.volumeName;
  environment = {
    image_reference: OFFICIAL_POSTGRES_IMAGE,
    image_digest: observed.Image,
    container_id: containerId,
    container_name: containerName,
    anonymous_volume_name: volumeName,
    host_port: exact.hostPort,
    exact_fixture_labels: {
      "com.jinhu.fixture": fixtureLabel,
      "com.jinhu.fixture.run-id": runId
    }
  };
  let stableProbes = 0;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    currentStage = `postgres:final-readiness:${attempt + 1}`;
    const running = inspect("container", containerName);
    if (!running) throw new Error("ephemeral PostgreSQL container exited before final readiness");
    const runningExact = assertExactEphemeralPostgresContainer(running, {
      containerName, databaseName, fixtureLabel, runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
    });
    if (runningExact.containerId !== containerId) {
      throw new Error("ephemeral PostgreSQL container identity drift before final readiness");
    }
    const logs = docker(["logs", "--timestamps", "--tail",
      String(DIAGNOSTIC_LOG_TAIL_LINES), containerId], { allowFailure: true });
    if (logs.status !== 0) {
      throw new Error(`ephemeral PostgreSQL startup logs failed:${logs.stderr || logs.stdout}`);
    }
    const ready = docker(["exec", containerId, "pg_isready", "-U", postgresUser,
      "-d", databaseName], { allowFailure: true });
    const select = ready.status === 0
      ? docker(["exec", "-i", containerId, "psql", "-X", "-qAt", "-v",
        "ON_ERROR_STOP=1", "-U", postgresUser, "-d", databaseName],
      { input: "SELECT 1;\n", allowFailure: true })
      : { status: null, stdout: "" };
    stableProbes = advanceFinalPostgresReadiness(stableProbes, {
      logs: logs.stdout, running: running.State?.Running,
      pgIsReadyStatus: ready.status, selectStatus: select.status,
      selectOutput: select.stdout
    });
    if (stableProbes >= REQUIRED_STABLE_POSTGRES_PROBES) {
      currentStage = "postgres:ready";
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("ephemeral PostgreSQL final readiness timeout");
}
function psql(sql, { tuples = false } = {}) {
  return docker(["exec", "-i", containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1",
    ...(tuples ? ["-qAt", "-F", "\t"] : ["-q"]), "-U", postgresUser, "-d", databaseName],
  { input: `\\set VERBOSITY verbose\n${sql}` });
}
const query = (sql) => psql(sql, { tuples: true }).stdout.trimEnd();
const applyMigration = (name) => psql(readFileSync(resolve(migrationRoot, name), "utf8"));
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

function ensureHistory() {
  currentStage = "bootstrap:history-schema";
  psql(`CREATE TABLE IF NOT EXISTS public.sys_schema_migration_history (
    id bigserial PRIMARY KEY,filename varchar(255) NOT NULL UNIQUE,checksum varchar(64) NOT NULL,
    status varchar(16) NOT NULL CHECK(status IN ('running','succeeded','failed')),
    started_at timestamptz NOT NULL,finished_at timestamptz,error_message text,
    executed_by varchar(255) NOT NULL,batch_id varchar(32) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public.schema_migrations
      (LIKE public.sys_schema_migration_history INCLUDING ALL);`);
}
function recordHistory(name) {
  const checksum = sha256(readFileSync(resolve(migrationRoot, name)));
  for (const table of ["sys_schema_migration_history", "schema_migrations"]) {
    currentStage = `bootstrap:history:${name}:${table}`;
    psql(`INSERT INTO public.${table}
      (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
      VALUES (${sqlLiteral(name)},${sqlLiteral(checksum)},'succeeded',clock_timestamp(),
      clock_timestamp(),NULL,'b2a-c4-runtime-gate',${sqlLiteral(runId.slice(0, 32))});`);
  }
}
function bootstrap() {
  for (const name of baselineMigrations) {
    currentStage = `bootstrap:migration:${name}`;
    applyMigration(name);
  }
  currentStage = `bootstrap:seed:${seed.slice(root.length + 1)}`;
  psql(readFileSync(seed, "utf8"));
  currentStage = "bootstrap:migration:000183_property_business_granular_rbac.sql";
  applyMigration("000183_property_business_granular_rbac.sql");
  currentStage = "bootstrap:migration:000184_property_workbench_read_permissions.sql";
  applyMigration("000184_property_workbench_read_permissions.sql");
  currentStage = "bootstrap:fixture:asset_park";
  psql(`INSERT INTO asset_park(tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark)
    VALUES ('10000001','20000001','B2A_C4_GATE','B2a C4 runtime isolated park',
      'enabled',false,1,'C4 runtime gate');`);
  ensureHistory();
  for (const name of migrationChain) {
    currentStage = `bootstrap:migration:${name}`;
    applyMigration(name);
    recordHistory(name);
  }
}

function parseTap(output, name) {
  const lines = output.replaceAll("\r\n", "\n").split("\n");
  if (lines.some((line) => /^\s*not ok\b/u.test(line))) {
    throw new Error(`${name} contains a failing TAP test point`);
  }
  if (lines.some((line) => /^\s*Bail out!/iu.test(line))) {
    throw new Error(`${name} contains a TAP bailout`);
  }
  if (lines.some((line) =>
    /^\s*(?:ok|not ok)\b.*#\s*(?:SKIP|TODO)\b/iu.test(line))) {
    throw new Error(`${name} contains a skipped or todo TAP test point`);
  }
  const fields = ["tests", "pass", "fail", "skipped"];
  const summary = new Map();
  for (const field of fields) {
    const prefix = `# ${field}`;
    const candidates = lines.map((line, index) => ({ line, index }))
      .filter(({ line }) => line === prefix || line.startsWith(`${prefix} `));
    if (candidates.length !== 1) {
      throw new Error(`${name} requires one root TAP summary field:${field}`);
    }
    const [{ line, index }] = candidates;
    const match = line.match(new RegExp(`^# ${field} (0|[1-9]\\d*)$`, "u"));
    if (!match) throw new Error(`${name} has malformed root TAP summary field:${field}`);
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${name} has unsafe root TAP summary field:${field}`);
    }
    summary.set(field, { index, value });
  }
  const indices = fields.map((field) => summary.get(field).index);
  if (!indices.every((index, offset) => offset === 0 || indices[offset - 1] < index)) {
    throw new Error(`${name} has out-of-order root TAP summary`);
  }
  const summaryStart = indices[0];
  const tailFields = new Map();
  for (const line of lines.slice(summaryStart)) {
    if (line === "") continue;
    const count = line.match(
      /^# (tests|suites|pass|fail|cancelled|skipped|todo) (0|[1-9]\d*)$/u
    );
    const duration = line.match(/^# duration_ms (0|[1-9]\d*)(?:\.\d+)?$/u);
    if (!count && !duration) {
      throw new Error(`${name} has non-summary TAP content after its summary`);
    }
    const field = count?.[1] ?? "duration_ms";
    const value = Number(count?.[2] ?? line.slice("# duration_ms ".length));
    if (tailFields.has(field) || !Number.isSafeInteger(value) && field !== "duration_ms") {
      throw new Error(`${name} has duplicate or unsafe TAP summary tail:${field}`);
    }
    tailFields.set(field, value);
  }
  for (const field of ["cancelled", "todo"]) {
    if ((tailFields.get(field) ?? 0) !== 0) {
      throw new Error(`${name} did not expose zero-${field} TAP`);
    }
  }
  const tests = summary.get("tests").value;
  const passed = summary.get("pass").value;
  const failed = summary.get("fail").value;
  const skipped = summary.get("skipped").value;
  if (tests !== passed + failed + skipped) {
    throw new Error(`${name} has contradictory root TAP summary: `
      + JSON.stringify({ tests, passed, failed, skipped }));
  }
  if (tests < 1 || passed !== tests || failed !== 0 || skipped !== 0) {
    throw new Error(`${name} did not expose zero-skip TAP: ${JSON.stringify({ tests, passed, failed, skipped })}`);
  }
  return { tests, passed, failed, skipped };
}
function runLocalCommand(name, command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed:${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
  return { name, status: result.status };
}
function extractExactPgTest(source, title) {
  const marker = `  it(${JSON.stringify(title)}`;
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`C4 PostgreSQL contract requires one exact test title:${title}`);
  }
  const next = source.indexOf('\n  it("', start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

const C4_COMMAND_MATRIX_VARIANTS = [
  { key: "claim-open", initialStatus: "open" },
  { key: "start-claimed", initialStatus: "claimed" },
  { key: "block-in-progress", initialStatus: "in_progress" },
  { key: "unblock-blocked", initialStatus: "blocked" },
  { key: "release-claimed", initialStatus: "claimed" },
  { key: "release-in-progress", initialStatus: "in_progress" },
  { key: "release-blocked", initialStatus: "blocked" }
];
const C4_TERMINAL_MATRIX_STATUSES = ["open", "claimed", "in_progress", "blocked"];
const C4_TERMINAL_MATRIX_OUTCOMES = ["closed", "cancelled"];
const C4_MATRIX_MANIFEST_LITERAL =
  "const C4_CROSS_OPERATION_MATRIX_MANIFEST_JSON = String.raw`";
const C4_MATRIX_INDEPENDENT_PROOFS = [
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
const C4_MATRIX_FREEZE_SHA256 =
  "04770205f1be4ccb0f7d722f300f0942b59f4372a1df9bef24f0836526285770";
const C4_MATRIX_FREEZE_SIGNOFF_SHA256 =
  "43b7d067c87eeabf909190cd0f73448518a4661e4e89eec8765c2051aaa967f5";

function buildExpectedC4CrossOperationMatrix() {
  const cases = [];
  const terminalStatusKey = (status) => status.replaceAll("_", "-");
  for (const command of C4_COMMAND_MATRIX_VARIANTS) {
    for (const terminal of C4_TERMINAL_MATRIX_OUTCOMES) {
      for (const order of ["command-first", "terminal-first"]) {
        const terminalKey = `terminal-${terminalStatusKey(command.initialStatus)}-${terminal}`;
        cases.push({
          key: `shared-fence:${command.key}:${terminalKey}:${order}`,
          family: "shared-fence",
          actionKey: command.key,
          terminalKey,
          order,
          holderIsolation: "READ COMMITTED",
          waiterIsolation: "READ COMMITTED",
          expectedOutcome: "one-winner",
          coordination: "pg-lock-wait"
        });
      }
    }
  }
  const rebuildActions = [
    ...C4_COMMAND_MATRIX_VARIANTS.map(({ key }) => ({ key })),
    ...C4_TERMINAL_MATRIX_STATUSES.flatMap((status) =>
      C4_TERMINAL_MATRIX_OUTCOMES.map((terminal) => ({
        key: `terminal-${terminalStatusKey(status)}-${terminal}`
      })))
  ];
  for (const action of rebuildActions) {
    for (const schedule of [
      { order: "rebuild-first", holder: "SERIALIZABLE", waiter: "READ COMMITTED",
        outcome: "two-success", coordination: "pg-lock-wait" },
      { order: "action-first-stale-N", holder: "READ COMMITTED", waiter: "SERIALIZABLE",
        outcome: "stale-conflict", coordination: "post-commit-latch" },
      { order: "action-first-current-N-plus-1", holder: "READ COMMITTED",
        waiter: "SERIALIZABLE", outcome: "two-success", coordination: "post-commit-latch" }
    ]) {
      cases.push({
        key: `rebuild-fence:${action.key}:${schedule.order}`,
        family: "rebuild-fence",
        actionKey: action.key,
        order: schedule.order,
        holderIsolation: schedule.holder,
        waiterIsolation: schedule.waiter,
        expectedOutcome: schedule.outcome,
        coordination: schedule.coordination
      });
    }
  }
  if (cases.length !== 73) throw new Error(`C4 expected matrix cardinality drift:${cases.length}`);
  return cases;
}

function extractC4CrossOperationMatrixManifest(source) {
  const start = source.indexOf(C4_MATRIX_MANIFEST_LITERAL);
  if (start < 0 || source.indexOf(C4_MATRIX_MANIFEST_LITERAL,
    start + C4_MATRIX_MANIFEST_LITERAL.length) >= 0) {
    throw new Error("C4 PostgreSQL requires one executable matrix JSON manifest literal");
  }
  const jsonStart = start + C4_MATRIX_MANIFEST_LITERAL.length;
  const jsonEnd = source.indexOf("`;", jsonStart);
  if (jsonEnd < 0) throw new Error("C4 PostgreSQL matrix JSON manifest literal is unterminated");
  let parsed;
  try {
    parsed = JSON.parse(source.slice(jsonStart, jsonEnd));
  } catch (error) {
    throw new Error(`C4 PostgreSQL matrix JSON manifest is invalid:${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error("C4 PostgreSQL matrix manifest must be an array");
  return parsed;
}

function assertExactC4CrossOperationMatrix(observed) {
  const expected = buildExpectedC4CrossOperationMatrix();
  const allowedKeys = ["key", "family", "actionKey", "terminalKey", "order",
    "holderIsolation", "waiterIsolation", "expectedOutcome", "coordination"];
  for (const [index, item] of observed.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`C4 PostgreSQL matrix item must be an object:${index}`);
    }
    const extra = Object.keys(item).filter((key) => !allowedKeys.includes(key));
    if (extra.length > 0) {
      throw new Error(`C4 PostgreSQL matrix item has untrusted fields:${index}:${extra.join(",")}`);
    }
  }
  const observedKeys = observed.map((item) => item.key);
  if (new Set(observedKeys).size !== observedKeys.length) {
    throw new Error("C4 PostgreSQL matrix contains duplicate keys");
  }
  const normalize = (item) => Object.fromEntries(allowedKeys
    .filter((key) => Object.hasOwn(item, key)).map((key) => [key, item[key]]));
  const canonical = (items) => items.map(normalize)
    .sort((left, right) => String(left.key).localeCompare(String(right.key)));
  const expectedCanonical = canonical(expected);
  const observedCanonical = canonical(observed);
  if (JSON.stringify(observedCanonical) !== JSON.stringify(expectedCanonical)) {
    const expectedSet = new Set(expectedCanonical.map((item) => JSON.stringify(item)));
    const observedSet = new Set(observedCanonical.map((item) => JSON.stringify(item)));
    const missing = expectedCanonical.filter((item) => !observedSet.has(JSON.stringify(item)))
      .map((item) => item.key);
    const unexpected = observedCanonical.filter((item) => !expectedSet.has(JSON.stringify(item)))
      .map((item) => item.key);
    throw new Error(`C4 PostgreSQL matrix exact-set mismatch:${JSON.stringify({
      expected: expected.length, observed: observed.length, missing, unexpected
    })}`);
  }
  return expected;
}

function inspectPgSpecContract(source) {
  const freezeSha = sha256(readFileSync(matrixFreeze));
  if (freezeSha !== C4_MATRIX_FREEZE_SHA256) {
    throw new Error(`C4 concurrency matrix freeze SHA drift:${freezeSha}`);
  }
  const signoffSha = sha256(readFileSync(matrixFreezeSignoff));
  if (signoffSha !== C4_MATRIX_FREEZE_SIGNOFF_SHA256) {
    throw new Error(`C4 concurrency matrix freeze signoff SHA drift:${signoffSha}`);
  }
  const addendumSha = sha256(readFileSync(failedStateAddendum));
  if (addendumSha !== C4_FAILED_STATE_ADDENDUM_SHA256) {
    throw new Error(`C4 failed-state addendum SHA drift:${addendumSha}`);
  }
  const addendumSignoffSha = sha256(readFileSync(failedStateAddendumSignoff));
  if (addendumSignoffSha !== C4_FAILED_STATE_ADDENDUM_SIGNOFF_SHA256) {
    throw new Error(`C4 failed-state addendum signoff SHA drift:${addendumSignoffSha}`);
  }
  const addendumV2Sha = sha256(readFileSync(failedStateAddendumV2));
  if (addendumV2Sha !== C4_FAILED_STATE_ADDENDUM_V2_SHA256) {
    throw new Error(`C4 failed-state addendum v2 SHA drift:${addendumV2Sha}`);
  }
  const addendumV2SignoffSha = sha256(readFileSync(failedStateAddendumV2Signoff));
  if (addendumV2SignoffSha !== C4_FAILED_STATE_ADDENDUM_V2_SIGNOFF_SHA256) {
    throw new Error(`C4 failed-state addendum v2 signoff SHA drift:${addendumV2SignoffSha}`);
  }
  const pgSpecSha = sha256(Buffer.from(source));
  if (pgSpecSha !== C4_FAILED_STATE_PG_SPEC_SHA256) {
    throw new Error(`C4 failed-state signed PG spec SHA drift:${pgSpecSha}`);
  }
  for (const pattern of [
    /const independentCanonicalJson = \(value: unknown\): string =>/u,
    /const independentRequestHash = \(value: unknown\): string => createHash\("sha256"\)/u,
    /const expectedRequestHash = independentRequestHash\(request\)/u,
    /const incompleteEnvelopeHash = independentRequestHash\(/u,
    /test-only-simulated-port-boundary-schema-unreachable-failed-row/u,
    /VALUES\('port-v2',[\s\S]*'failed','property-task'/u,
    /UPDATE biz_property_mutation_receipt SET receipt_status='failed'/u,
    /assert\.deepEqual\(failedRows, \[\{ count: 0 \}\]\)/u
  ]) {
    if (!pattern.test(source)) {
      throw new Error(`C4 signed failed-state proof marker missing:${pattern}`);
    }
  }
  if ((source.match(/databaseCode\(error\) === "23514"/gu) ?? []).length < 2) {
    throw new Error("C4 signed failed-state proof requires two exact SQLSTATE 23514 assertions");
  }
  for (const pattern of [
    /const WAITER_LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout='5s'"/u,
    /const OBSERVER_STATEMENT_TIMEOUT_SQL = "SET LOCAL statement_timeout='2s'"/u,
    /const OBSERVER_DEADLINE_MS = 3_000/u
  ]) {
    if (!pattern.test(source)) {
      throw new Error(`C4 PostgreSQL frozen timeout constant missing:${pattern}`);
    }
  }
  const claimTitle =
    "serializes concurrent claims to one winner and one zero-mutation loser";
  const claim = extractExactPgTest(source, claimTitle);
  const claimPatterns = [
    /Promise\.all\(\[claim\(0\), claim\(1\)\]\)/u,
    /item\.kind === "winner"\)\.length, 1/u,
    /item\.kind === "loser"\)\.length, 1/u,
    /"task-already-claimed"/u,
    /assert\.equal\(audit\[0\]!\.total, 1\)/u
  ];
  for (const pattern of claimPatterns) {
    if (!pattern.test(claim)) {
      throw new Error(`C4 PostgreSQL concurrent-claim contract missing:${pattern}`);
    }
  }
  const matrix = assertExactC4CrossOperationMatrix(
    extractC4CrossOperationMatrixManifest(source)
  );
  for (const pattern of [
    /for \(const matrixCase of C4_CROSS_OPERATION_MATRIX_MANIFEST\)/u,
    /it\(`C4 matrix \$\{matrixCase\.key\}`/u,
    /await runC4CrossOperationMatrixCase\(matrixCase\)/u,
    /async function runC4CrossOperationMatrixCase\(/u,
    /async function runCommandTerminalFence\(/u,
    /async function runRebuildFirstMatrix\(/u,
    /async function runActionFirstRebuildMatrix\(/u,
    /assertMatrixIsolationMetadata\(matrixCase\)/u,
    /coordinator\.signal\("after-first-lock"\)/u,
    /coordinator\.wait\("lock-before-ready"\)/u,
    /observeLockWait\([\s\S]*observer\.manager, waiterPid, holderPid/u,
    /createPostCommitEvidence\(matrixCase\.key\)/u,
    /postCommit\.markActionCommitted\(\)/u,
    /postCommit\.beforeRebuildStart\(\)/u,
    /lockWaitClaimed: false/u,
    /assertMatrixOneWinnerZeroSideEffects\(/u,
    /assertMatrixStaleConflictZeroSideEffects\(/u,
    /assertMatrixTwoSuccessVersionsReceiptsAudits\(/u
  ]) {
    if (!pattern.test(source)) {
      throw new Error(`C4 PostgreSQL matrix execution structure missing:${pattern}`);
    }
  }
  const isolationStart = source.indexOf("  function assertMatrixIsolationMetadata(");
  const isolationEnd = source.indexOf("\n  function matrixActionCase(", isolationStart);
  if (isolationStart < 0 || isolationEnd < 0) {
    throw new Error("C4 PostgreSQL matrix isolation metadata assertion is missing");
  }
  const isolation = source.slice(isolationStart, isolationEnd);
  for (const pattern of [
    /matrixCase\.holderIsolation/u,
    /matrixCase\.waiterIsolation/u,
    /matrixCase\.coordination/u,
    /matrixCase\.order/u,
    /"READ COMMITTED"/u,
    /"SERIALIZABLE"/u,
    /"pg-lock-wait"/u,
    /"post-commit-latch"/u
  ]) {
    if (!pattern.test(isolation)) {
      throw new Error(`C4 PostgreSQL matrix isolation metadata proof missing:${pattern}`);
    }
  }
  for (const proof of C4_MATRIX_INDEPENDENT_PROOFS.slice(1)) {
    const title = `C4 matrix proof ${proof}`;
    const block = extractExactPgTest(source, title);
    if (!/assertC4IndependentProof\(/u.test(block)) {
      throw new Error(`C4 PostgreSQL independent proof is not executable:${proof}`);
    }
  }
  for (const pattern of [
    /new PropertyTaskOrchestrator\(/u,
    /new PropertyTaskService\(/u,
    /propertyTaskRuntime\.service\.detail\(scope, actor, fixture\.taskId\)/u,
    /propertyTaskRuntime\.service\.list\(scope, actor,/u,
    /new PropertyTaskListQueryDto\(\)/u,
    /\.total/u,
    /pg_advisory_xact_lock|FOR UPDATE/u,
    /source[^\n]*(?:advisory|lock)/iu,
    /assertCompleteProjectionRowsAndHashes\(/u,
    /assertRawAuthorityAndConsecutiveVersions\(/u,
    /assertExactReceiptsAndAudits\(/u
  ]) {
    if (!pattern.test(source)) {
      throw new Error(`C4 PostgreSQL production/service evidence missing:${pattern}`);
    }
  }
  for (const marker of [
    "expected-current", "expected-current-minus-2", "expected-zero", "expected-negative",
    "expected-fractional", "expected-max-safe", "expected-overflow", "different-terminal",
    "different-outcome", "source-version-old", "source-version-new", "different-occurrence",
    "different-task-key", "existing-only-absent", "existing-only-started",
    "existing-only-failed"
  ]) {
    if (!source.includes(JSON.stringify(marker))) {
      throw new Error(`C4 PostgreSQL terminal negative/state subkey missing:${marker}`);
    }
  }
  for (const pattern of [
    /assertPreReceiptAccessCounts\([\s\S]*executeOrReplay: 0[\s\S]*existingOnly: 0[\s\S]*total: 0/u,
    /assertExistingOnlyStateAccessCounts\([\s\S]*executeOrReplay: 0[\s\S]*existingOnly: 1[\s\S]*total: 1/u,
    /"property-runtime-unavailable"/u
  ]) {
    if (!pattern.test(source)) {
      throw new Error(`C4 PostgreSQL receipt-access proof missing:${pattern}`);
    }
  }
  const setupStart = source.indexOf("  before(async () => {");
  const setupEnd = source.indexOf("\n  after(async () =>", setupStart);
  const setup = source.slice(setupStart, setupEnd);
  for (const pattern of [/INSERT INTO sys_user/u, /display_name/u, /actorDisplay/u,
    /assigneeDisplay: assignment\.assigneeDisplay/u]) {
    if (!pattern.test(pattern.source.includes("assigneeDisplay") ? source : setup)) {
      throw new Error(`C4 PostgreSQL active assignee display fixture missing:${pattern}`);
    }
  }
  const resolverStart = source.indexOf("      async lockAndResolve(input) {");
  const resolverEnd = source.indexOf("\n      }\n    };", resolverStart);
  if (resolverStart < 0 || resolverEnd < 0) {
    throw new Error("C4 PostgreSQL fixture resolver lock contract is missing");
  }
  const resolver = source.slice(resolverStart, resolverEnd);
  for (const pattern of [
    /manager\.query\(WAITER_LOCK_TIMEOUT_SQL\)/u,
    /manager\.query\(ACTOR_STATEMENT_TIMEOUT_SQL\)/u,
    /SET LOCAL deadlock_timeout='1s'/u,
    /pg_advisory_xact_lock/u
  ]) {
    if (!pattern.test(resolver)) {
      throw new Error(`C4 PostgreSQL production-driver timeout/lock contract missing:${pattern}`);
    }
  }
  const matrixObserverStart = source.indexOf("  async function openMatrixObserver(");
  const matrixObserverEnd = source.indexOf("\n  type MatrixPersistenceExpected", matrixObserverStart);
  if (matrixObserverStart < 0 || matrixObserverEnd < 0
    || !/observer\.query\(OBSERVER_STATEMENT_TIMEOUT_SQL\)/u.test(
      source.slice(matrixObserverStart, matrixObserverEnd))) {
    throw new Error("C4 PostgreSQL matrix observer timeout contract is missing");
  }
  const observerStart = source.indexOf("  async function observeLockWait(");
  const observerEnd = source.indexOf("\n  async function rollbackIfActive(", observerStart);
  if (observerStart < 0 || observerEnd < 0) {
    throw new Error("C4 PostgreSQL lock observer contract is missing");
  }
  const observer = source.slice(observerStart, observerEnd);
  for (const pattern of [/FROM pg_locks waiter_lock/u,
    /JOIN pg_locks holder_lock/u,
    /holder_lock\.pid=\$2 AND holder_lock\.granted=true/u,
    /waiter_lock\.pid=\$1 AND waiter_lock\.granted=false/u,
    /FROM pg_stat_activity activity/u,
    /activity\.pid=\$1 AND activity\.wait_event_type='Lock'/u,
    /const absoluteDeadline = Date\.now\(\) \+ OBSERVER_DEADLINE_MS/u,
    /const rows = await manager\.query\(/u,
    /prematureActorFailure\(actorWatches\)/u,
    /captureLockDiagnostic\(manager, waiterPid, holderPid\)/u]) {
    if (!pattern.test(observer)) {
      throw new Error(`C4 PostgreSQL lock observation contract missing:${pattern}`);
    }
  }
  if (/withAbsoluteDeadline\s*\(\s*manager\.query/u.test(observer)) {
    throw new Error("C4 PostgreSQL lock observer must not race manager.query with a JS deadline");
  }
  return {
    concurrent_claim_single_winner_test: claimTitle,
    cross_operation_matrix_schema: "c4-cross-operation-matrix-v1",
    matrix_freeze: {
      path: matrixFreeze.slice(root.length + 1), raw_sha256: freezeSha,
      signoff_path: matrixFreezeSignoff.slice(root.length + 1),
      signoff_raw_sha256: signoffSha
    },
    cross_operation_matrix_count: matrix.length,
    cross_operation_matrix_keys: matrix.map((item) => item.key),
    true_concurrent_lock_schedule_count: matrix.filter(
      (item) => item.coordination === "pg-lock-wait").length,
    ordered_post_commit_schedule_count: matrix.filter(
      (item) => item.coordination === "post-commit-latch").length,
    independent_proofs: [...C4_MATRIX_INDEPENDENT_PROOFS],
    observer_statement_timeout: "2s",
    observer_absolute_deadline_ms: 3_000,
    waiter_lock_timeout: "5s",
    observer_query_js_deadline_race: false,
    diagnostic_failure_visibility: "actor-early-settlement-and-bounded-pg-lock-snapshot",
    active_assignee_display_fixture: "scoped-sys-user",
    cross_operation_matrix_complete: true,
    full_c4_cross_operation_matrix_status: "passed"
  };
}
function inspectProductionIsolationContract(source) {
  const extractMethod = (name, nextMarker) => {
    const start = source.indexOf(`  async ${name}(`);
    const end = source.indexOf(nextMarker, start);
    if (start < 0 || end < 0) {
      throw new Error(`C4 production orchestrator method is missing:${name}`);
    }
    return source.slice(start, end);
  };
  const command = extractMethod("command", "\n  async sourceTerminal(");
  const terminal = extractMethod("sourceTerminal", "\n  async rebuild(");
  const rebuild = extractMethod("rebuild", "\n  private async scanAuthorityCandidates(");
  for (const [name, block, isolation] of [
    ["command", command, "READ COMMITTED"],
    ["sourceTerminal", terminal, "READ COMMITTED"],
    ["rebuild", rebuild, "SERIALIZABLE"]
  ]) {
    if (!block.includes(`this.dataSource.transaction("${isolation}"`)) {
      throw new Error(`C4 production orchestrator isolation drift:${name}:${isolation}`);
    }
  }
  for (const block of [command, terminal]) {
    if (!/currentLockedProjection\([\s\S]*lockedProjection/u.test(block)) {
      throw new Error("C4 production READ COMMITTED path lacks locked-current projection proof");
    }
  }
  if (rebuild.indexOf("this.assignments.lockByTaskKeys(") < 0
    || rebuild.indexOf("this.projections.lockSourceProjection(") < 0
    || rebuild.indexOf("this.assignments.lockByTaskKeys(")
      > rebuild.indexOf("this.projections.lockSourceProjection(")) {
    throw new Error("C4 production rebuild assignment-to-projection lock order drift");
  }
  return {
    command: "READ COMMITTED",
    source_terminal: "READ COMMITTED",
    rebuild: "SERIALIZABLE",
    read_committed_locked_current_projection: true,
    rebuild_assignment_before_projection: true
  };
}
function assertPgSpecContract() {
  if (!existsSync(pgSpec)) throw new Error(`C4 PostgreSQL spec is missing:${pgSpec}`);
  const source = readFileSync(pgSpec, "utf8");
  const contract = inspectPgSpecContract(source);
  const production = inspectProductionIsolationContract(
    readFileSync(productionOrchestrator, "utf8")
  );
  return { path: pgSpec.slice(root.length + 1), raw_sha256: sha256(source),
    ...contract, production_isolation_contract: production };
}
function runLocalGates() {
  const input = spawnSync(process.execPath, [inputGate], {
    cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024
  });
  if (input.status !== 0 || JSON.parse(input.stdout).status !== "passed") {
    throw new Error(`C4 input gate failed:${input.stderr || input.stdout}`);
  }
  const staticTest = spawnSync(process.execPath, [runnerSpec], {
    cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024
  });
  if (staticTest.status !== 0) throw new Error(`C4 runner static test failed:${staticTest.stderr}`);
  const staticTap = parseTap(staticTest.stdout, "C4 runner static test");
  const pgContract = assertPgSpecContract();
  return {
    status: "passed",
    c4_input_gate: "passed",
    runner_static_lifecycle: staticTap,
    pg_contract: pgContract,
    commands: [
      runLocalCommand("shared-build", "pnpm", ["--filter", "@jinhu/shared", "build"]),
      runLocalCommand("api-typecheck", "pnpm", ["--filter", "@jinhu/api", "typecheck"]),
      runLocalCommand("api-build", "pnpm", ["--filter", "@jinhu/api", "build"]),
      runLocalCommand("target-eslint", "pnpm", ["--filter", "@jinhu/api", "exec", "eslint",
        "src/modules/property-tasks"]),
      runLocalCommand("runner-eslint", "pnpm", ["exec", "eslint",
        "scripts/e2e/property-remediation/track-b2a-c4-runtime-gate.mjs",
        "scripts/e2e/property-remediation/track-b2a-c4-runtime-lifecycle.mjs",
        "scripts/e2e/property-remediation/track-b2a-c4-runtime-gate.spec.mjs"])
    ]
  };
}
const C4_PG_BASE_TEST_COUNT = 10;
const C4_PG_EXACT_TEST_COUNT = 93;
function assertExactPgTapCount(tap, pgContract) {
  const derived = C4_PG_BASE_TEST_COUNT + pgContract.cross_operation_matrix_count
    + pgContract.independent_proofs.length;
  if (derived !== C4_PG_EXACT_TEST_COUNT) {
    throw new Error(`C4 PostgreSQL frozen test composition drifted:${derived}!=${C4_PG_EXACT_TEST_COUNT}`);
  }
  if (tap.tests !== C4_PG_EXACT_TEST_COUNT) {
    throw new Error(`C4 PostgreSQL TAP test count must be exact:${tap.tests}!=${C4_PG_EXACT_TEST_COUNT}`);
  }
}
function runPgSpec(url, pgContract) {
  const result = spawnSync(process.execPath, ["--require", "ts-node/register", pgSpec], {
    cwd: resolve(root, "apps/api"), encoding: "utf8", maxBuffer: 80 * 1024 * 1024,
    env: { ...process.env, PROPERTY_B2A_C4_PG_URL: url, PROPERTY_B2A_C4_RUN_ID: runId }
  });
  if (result.error || result.status !== 0) {
    const failure = {
      status: result.status,
      signal: result.signal ?? null,
      spawn_error: safeCommandStreamEvidence(result.error?.message ?? ""),
      stdout: safeCommandStreamEvidence(result.stdout),
      stderr: safeCommandStreamEvidence(result.stderr)
    };
    throw new Error(`C4 PostgreSQL spec failed:${JSON.stringify(failure)}`);
  }
  const tap = parseTap(result.stdout, "C4 PostgreSQL spec");
  assertExactPgTapCount(tap, pgContract);
  return { path: pgSpec.slice(root.length + 1), raw_sha256: sha256(readFileSync(pgSpec)),
    ...tap,
    cross_operation_matrix_count: pgContract.cross_operation_matrix_count,
    cross_operation_matrix_keys: pgContract.cross_operation_matrix_keys,
    true_concurrent_lock_schedule_count: pgContract.true_concurrent_lock_schedule_count,
    ordered_post_commit_schedule_count: pgContract.ordered_post_commit_schedule_count,
    independent_proofs: pgContract.independent_proofs,
    cross_operation_matrix_complete: true,
    full_c4_cross_operation_matrix_status: "passed" };
}
function databaseEvidence() {
  const value = JSON.parse(query(`SELECT json_build_object(
    'server_version',current_setting('server_version'),
    'projection_indexes',(SELECT count(*) FROM pg_indexes
      WHERE schemaname='public' AND tablename='biz_property_task_projection'),
    'head_indexes',(SELECT count(*) FROM pg_indexes
      WHERE schemaname='public' AND tablename='biz_property_task_projection_head'),
    'replace_function_count',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_property_task_projection_replace_v1'),
    'budget_digest_bound',(position('budget-addendum-digest=d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45'
      in pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='fn_property_task_projection_replace_v1'))) > 0),
    'row_limit_bound',(position('jsonb_array_length(p_rows)>200'
      in pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='fn_property_task_projection_replace_v1'))) > 0))::text;`));
  const explain = JSON.parse(query(`EXPLAIN (FORMAT JSON)
    SELECT * FROM biz_property_task_projection
    WHERE tenant_id='c4-explain' AND park_id='p1'
      AND task_id='40000000-0000-4000-8000-000000000001'::uuid;`));
  const planText = JSON.stringify(explain);
  if (!/^16\./u.test(value.server_version) || value.projection_indexes < 4 || value.head_indexes < 2
    || value.replace_function_count !== 1 || value.budget_digest_bound !== true
    || value.row_limit_bound !== true || /Seq Scan/u.test(planText)
    || !/(Index Scan|Bitmap Index Scan)/u.test(planText)) {
    throw new Error(`C4 database budget/EXPLAIN evidence failed:${JSON.stringify({ value, explain })}`);
  }
  return { ...value, explain, seq_scan_count: 0, signed_complete_source_row_limit: 200,
    lock_timeout: "5s", statement_timeout: "60s", deadlock_timeout: "1s" };
}

function assertUniqueRunId() {
  const inspected = [];
  for (const entry of readdirSync(researchRoot, { withFileTypes: true })) {
    if (!/^c4-runtime-[^.]+(?:\.json|\.manifest\.txt)$/u.test(entry.name)) continue;
    const path = resolve(researchRoot, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`C4 runId authority is not a regular file:${entry.name}`);
    }
    if (metadata.size > 8 * 1024 * 1024) {
      throw new Error(`C4 runId authority exceeds bounded size:${entry.name}`);
    }
    let observed = null;
    let attemptEvidence = false;
    try {
      const text = readFileSync(path, "utf8");
      if (entry.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        observed = typeof parsed?.run_id === "string" ? parsed.run_id : null;
        attemptEvidence = !observed && parsed?.status === "failed"
          && parsed?.candidate_admissible === false
          && typeof parsed?.attempt_id === "string" && typeof parsed?.attempted_run_id === "string";
      } else {
        observed = text.match(/^run_id\t([^\r\n]+)$/mu)?.[1] ?? null;
        attemptEvidence = !observed && /^status\tfailed$/mu.test(text)
          && /^candidate_admissible\tfalse$/mu.test(text)
          && /^attempt_id\t[^\r\n]+$/mu.test(text)
          && /^attempted_run_id\t[^\r\n]+$/mu.test(text);
      }
    } catch (error) {
      throw new Error(`C4 runId authority cannot be parsed:${entry.name}:${error.message}`);
    }
    if (!observed && !attemptEvidence) throw new Error(`C4 runId authority has no run_id:${entry.name}`);
    inspected.push({ path: entry.name, run_id: observed, attempt_evidence: attemptEvidence });
    if (observed === runId) throw new Error(`duplicate C4 runId already recorded:${entry.name}:${runId}`);
  }
  const reservationPath = resolve(researchRoot,
    `c4-runtime-runid-${sha256(runId)}.reservation.json`);
  reservationEvidence = reserveRunId({ reservationPath, runId,
    artifact: artifactPath.slice(root.length + 1), manifest: manifestPath.slice(root.length + 1),
    reservedAt: startedAt });
  reservationEvidence.path = reservationPath.slice(root.length + 1);
  return { status: "passed", inspected_file_count: inspected.length,
    bounded_regular_files_only: true, max_file_bytes: 8 * 1024 * 1024,
    reservation: reservationEvidence };
}

function boundedDiagnosticText(value) {
  const bytes = Buffer.from(value ?? "", "utf8");
  const stored = bytes.length > DIAGNOSTIC_LOG_MAX_BYTES
    ? bytes.subarray(bytes.length - DIAGNOSTIC_LOG_MAX_BYTES) : bytes;
  return {
    captured_bytes: bytes.length,
    stored_bytes: stored.length,
    truncated: stored.length !== bytes.length,
    raw_sha256: sha256(bytes),
    tail: stored.toString("utf8")
  };
}

function captureFailureDiagnostics() {
  const diagnostics = {
    status: "captured",
    current_stage: currentStage,
    captured_at: new Date().toISOString(),
    exact_container_expected: creationAttempted,
    container: null,
    logs: null,
    errors: []
  };
  if (!creationAttempted) return diagnostics;
  let observed;
  try {
    observed = inspect("container", containerName);
  } catch (error) {
    diagnostics.errors.push(`container-inspect-failed:${error.message}`);
    diagnostics.status = "partial";
    return diagnostics;
  }
  if (!observed) {
    diagnostics.container = { present: false };
    diagnostics.errors.push("exact-container-absent-before-cleanup");
    diagnostics.status = "partial";
    return diagnostics;
  }
  try {
    const exact = assertExactEphemeralPostgresContainer(observed, {
      containerName, databaseName, fixtureLabel, runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: false, requireRunning: false
    });
    if (containerId && exact.containerId !== containerId) {
      throw new Error("container-id-drift");
    }
    diagnostics.container = {
      present: true,
      exact_identity: true,
      id: exact.containerId,
      restart_count: observed.RestartCount ?? null,
      state: {
        status: observed.State?.Status ?? null,
        running: observed.State?.Running ?? null,
        paused: observed.State?.Paused ?? null,
        restarting: observed.State?.Restarting ?? null,
        oom_killed: observed.State?.OOMKilled ?? null,
        dead: observed.State?.Dead ?? null,
        exit_code: observed.State?.ExitCode ?? null,
        error: observed.State?.Error ?? null,
        started_at: observed.State?.StartedAt ?? null,
        finished_at: observed.State?.FinishedAt ?? null
      }
    };
    const logs = docker(["logs", "--timestamps", "--tail",
      String(DIAGNOSTIC_LOG_TAIL_LINES), exact.containerId], { allowFailure: true });
    diagnostics.logs = {
      command_status: logs.status,
      tail_lines: DIAGNOSTIC_LOG_TAIL_LINES,
      stdout: boundedDiagnosticText(logs.stdout),
      stderr: boundedDiagnosticText(logs.stderr)
    };
    if (logs.status !== 0) {
      diagnostics.errors.push("exact-container-logs-command-failed");
      diagnostics.status = "partial";
    }
  } catch (error) {
    diagnostics.container = { present: true, exact_identity: false };
    diagnostics.errors.push(`exact-container-diagnostics-refused:${error.message}`);
    diagnostics.status = "partial";
  }
  return diagnostics;
}

function safeCaptureFailureDiagnostics() {
  try {
    return captureFailureDiagnostics();
  } catch (error) {
    return { status: "failed", current_stage: currentStage,
      captured_at: new Date().toISOString(), errors: [`diagnostics-threw:${error.message}`] };
  }
}

function cleanup() {
  if (cleanupEvidence) return cleanupEvidence;
  cleanupEvidence = cleanupExactLifecycle({ creationAttempted, containerName, containerId, volumeName,
    inspectContainer: (name) => inspect("container", name),
    inspectVolume: (name) => inspect("volume", name),
    validateContainer: (observed) => assertExactEphemeralPostgresContainer(observed, {
      containerName, databaseName, fixtureLabel, runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: false, requireRunning: false
    }),
    removeContainer: (id) => docker(["rm", "-f", "-v", id]),
    removeVolume: (name) => docker(["volume", "rm", name]) });
  return cleanupEvidence;
}
function safeCleanup() {
  try {
    return cleanup();
  } catch (error) {
    return { status: "failed", attempted: creationAttempted,
      container_absent: false, anonymous_volume_absent: false,
      errors: [`cleanup threw:${error.message}`], exact_targets: [
        { type: "container", id: containerId, name: containerName, absent: false },
        { type: "anonymous-volume", id: volumeName, name: volumeName, absent: false }
      ] };
  }
}
function serializableError(error) {
  return { name: error?.name ?? "Error", message: error?.message ?? String(error),
    stack_sha256: error?.stack ? sha256(error.stack) : null };
}
let artifactWritten = false;
function writeOutcome(outcome) {
  if (preflightOnly) throw new Error("preflight-only mode forbids research publication");
  if (artifactWritten) return null;
  const published = publishOutcome({ artifactPath, manifestPath,
    artifactLabel: artifactPath.slice(root.length + 1), outcome });
  artifactWritten = true;
  return { artifact: artifactPath.slice(root.length + 1), raw_sha256: published.raw_sha256,
    detached_manifest: manifestPath.slice(root.length + 1),
    detached_manifest_sha256: published.manifest_sha256 };
}

function currentOutcomeAuthority() {
  return preflightOnly
    ? { run_id: runId, attempt_id: attemptId, preflight_only: true }
    : outcomeAuthority({ reservation: reservationEvidence, runId, attemptId });
}

function preservePrimaryErrorOnSignal(existingPrimaryError, signal) {
  const interruptionError = new Error(`interrupted:${signal}`);
  return {
    primaryError: existingPrimaryError ?? interruptionError,
    interruptionError,
    primaryErrorPreserved: existingPrimaryError !== null
  };
}

let primaryError = null;
let evidence = null;
let localGates = null;
let runIdPreflight = null;
const interruptionEvidence = [];
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => {
  const interrupted = preservePrimaryErrorOnSignal(primaryError, signal);
  primaryError = interrupted.primaryError;
  interruptionEvidence.push({ signal, received_at: new Date().toISOString(),
    primary_error_preserved: interrupted.primaryErrorPreserved,
    error: serializableError(interrupted.interruptionError) });
  failureDiagnostics = safeCaptureFailureDiagnostics();
  const cleaned = safeCleanup();
  const inputDrift = captureInputDrift("signal-after-cleanup");
  const authority = currentOutcomeAuthority();
  const failed = { schema_version: "property-remediation-b2a-c4-runtime-gate-v1", ...authority,
    candidate_scope: "c4-runtime-candidate-only-production-enablement-remains-blocked",
    status: "failed", candidate_admissible: false, started_at: startedAt,
    finished_at: new Date().toISOString(), error: serializableError(primaryError),
    failed_stage: currentStage, failure_diagnostics: failureDiagnostics,
    interruptions: interruptionEvidence,
    input_freeze_before: inputFreeze, input_drift: inputDrift,
    environment, local_gates: localGates,
    run_id_preflight: runIdPreflight, run_id_reservation: reservationEvidence, cleanup: cleaned };
  let written = { status: "suppressed-preflight-no-research-write" };
  if (!preflightOnly) {
    try { written = writeOutcome(failed); } catch (error) { written = { error: error.message }; }
  }
  process.stderr.write(`${JSON.stringify({ status: "failed", candidate_admissible: false,
    runId, signal, cleanup: cleaned, written })}\n`);
  process.exit(128);
});

try {
  currentStage = "input-freeze:before-create";
  inputFreeze = captureInputs("before-create");
  currentStage = "run-id-preflight";
  runIdPreflight = preflightOnly
    ? { status: "skipped-preflight-only", reservation_created: false,
      research_write_permitted: false }
    : assertUniqueRunId();
  currentStage = "local-gates";
  localGates = runLocalGates();
  currentStage = "input-freeze:after-local-gates";
  assertInputsFrozen("after-local-gates");
  startPostgres();
  bootstrap();
  const url = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${environment.host_port}/${databaseName}`;
  currentStage = "pg-spec";
  const specs = [runPgSpec(url, localGates.pg_contract)];
  currentStage = "input-freeze:after-tests";
  const inputFreezeAfter = assertInputsFrozen("after-tests");
  currentStage = "database-evidence";
  const database = databaseEvidence();
  currentStage = "complete";
  evidence = {
    schema_version: "property-remediation-b2a-c4-runtime-gate-v1",
    run_id: runId,
    candidate_scope: "c4-runtime-candidate-only-production-enablement-remains-blocked",
    status: "passed",
    candidate_admissible: true,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    environment,
    input_freeze_before: inputFreeze,
    input_freeze_after: inputFreezeAfter,
    local_gates: localGates,
    run_id_preflight: runIdPreflight,
    run_id_reservation: reservationEvidence,
    specs,
    database,
    concurrency: {
      deterministic: true,
      matrix_freeze: localGates.pg_contract.matrix_freeze,
      cross_operation_matrix_count: localGates.pg_contract.cross_operation_matrix_count,
      cross_operation_matrix_keys: localGates.pg_contract.cross_operation_matrix_keys,
      true_concurrent_lock_schedule_count:
        localGates.pg_contract.true_concurrent_lock_schedule_count,
      ordered_post_commit_schedule_count:
        localGates.pg_contract.ordered_post_commit_schedule_count,
      independent_proofs: localGates.pg_contract.independent_proofs,
      cross_operation_matrix_complete: true,
      full_c4_cross_operation_matrix_status: "passed",
      coordinator_latches: ["lock-before-ready", "after-first-lock", "action-committed"],
      holder_waiter_observation: ["pg_locks", "pg_stat_activity.wait_event_type=Lock"],
      post_commit_latch_does_not_claim_pg_lock_wait: true,
      sleep_based_coordination: false
    },
    B3_web_consumer_status: "pending",
    production_enablement: false,
    open_p0_p1: [],
    host: { platform: platform(), release: release(), cpu_count: cpus().length,
      total_memory_bytes: totalmem(), free_memory_bytes: freemem() }
  };
} catch (error) {
  primaryError = error;
} finally {
  if (primaryError) failureDiagnostics = safeCaptureFailureDiagnostics();
  const cleaned = safeCleanup();
  if (evidence) evidence.cleanup = cleaned;
  if (cleaned.status !== "passed" && !primaryError) {
    currentStage = "cleanup";
    primaryError = new Error("cleanup failed");
    failureDiagnostics = safeCaptureFailureDiagnostics();
  }
  if (evidence && !primaryError && cleaned.status === "passed") {
    currentStage = "input-freeze:after-database-evidence-and-cleanup";
    try {
      evidence.input_freeze_after = assertInputsFrozen("after-database-evidence-and-cleanup");
    } catch (error) {
      primaryError = error;
      evidence = null;
    }
  }
}

if (primaryError) {
  let inputFreezeAfter = null;
  try { inputFreezeAfter = inputFreeze ? captureInputs("after-failure") : null; }
  catch (error) { inputFreezeAfter = { stage: "after-failure", error: serializableError(error) }; }
  const inputDrift = captureInputDrift("failed-publication");
  const authority = currentOutcomeAuthority();
  const failed = { schema_version: "property-remediation-b2a-c4-runtime-gate-v1", ...authority,
    candidate_scope: "c4-runtime-candidate-only-production-enablement-remains-blocked",
    status: "failed", candidate_admissible: false, started_at: startedAt,
    finished_at: new Date().toISOString(), error: serializableError(primaryError),
    failed_stage: currentStage, failure_diagnostics: failureDiagnostics,
    interruptions: interruptionEvidence,
    input_freeze_before: inputFreeze, input_freeze_after: inputFreezeAfter,
    input_drift: inputDrift,
    environment, local_gates: localGates, run_id_preflight: runIdPreflight,
    run_id_reservation: reservationEvidence, cleanup: cleanupEvidence };
  let publication = { status: "suppressed-preflight-no-research-write" };
  if (!preflightOnly) {
    try { publication = { status: "written", ...writeOutcome(failed) }; }
    catch (error) { publication = { status: "failed", error: serializableError(error) }; }
  }
  process.stderr.write(`${JSON.stringify({ status: "failed", candidate_admissible: false,
    ...authority,
    publication, error: failed.error, cleanup: failed.cleanup })}\n`);
  process.exitCode = 1;
} else {
  if (preflightOnly) {
    process.stdout.write(`${JSON.stringify({ status: "passed", runId,
      preflight_only: true, specs: evidence.specs, database: evidence.database,
      cleanup: evidence.cleanup,
      input_freeze_before_sha256: evidence.input_freeze_before.raw_sha256,
      input_freeze_after_sha256: evidence.input_freeze_after.raw_sha256 })}\n`);
  } else {
  try {
    const written = writeOutcome(evidence);
    process.stdout.write(`${JSON.stringify({ status: "passed", run_id: runId,
      ...written, cleanup: evidence.cleanup })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "failed", candidate_admissible: false,
      run_id: runId, publication: { status: "failed", error: serializableError(error) },
      cleanup: evidence.cleanup })}\n`);
    process.exitCode = 1;
  }
  }
}
