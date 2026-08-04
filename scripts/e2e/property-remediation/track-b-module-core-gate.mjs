/* global process, setTimeout, clearTimeout */
import { spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  loadReviewedBootstrapContract,
  verifyReviewedMigration175Rollback
} from
  "./lib/reviewed-bootstrap-contract.mjs";
import { cleanupExactLifecycle } from "./track-b2a-c4-runtime-lifecycle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const apiRoot = resolve(root, "apps/api");
const researchRoot = resolve(root,
  ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const runnerPath = fileURLToPath(import.meta.url);
const staticSpecPath = resolve(root,
  "scripts/e2e/property-remediation/track-b-module-core-gate.spec.mjs");
const pgSpecPath = resolve(apiRoot, "src/saas-modules.module-core.pg.spec.ts");
const moduleTreeRoot = resolve(apiRoot, "src/modules/saas-modules");
const targetedSpecPath = resolve(moduleTreeRoot,
  "saas-modules.property-dependency.spec.ts");
const runtimeFreezePath = resolve(root,
  ".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-runtime-contract-freeze.md");
const contractLocatorPath = resolve(root,
  ".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-contract-freeze-current.md");
const contractFinalGatePath = resolve(root,
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-5-final-gate.md");
const schemaHandoffPath = resolve(root,
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/ar1-schema-handoff-final.json");
const parentImplementPath = resolve(root,
  ".trellis/tasks/07-30-pr192-property-productization-remediation/implement.md");
const parentReviewGatesPath = resolve(root,
  ".trellis/tasks/07-30-pr192-property-productization-remediation/review-gates.md");
const correctionPlanPath = resolve(researchRoot,
  "b2b-module-core-precondition-correction-plan.md");
const migrationRoot = resolve(root, "database/migrations");
const ephemeralHelperPath = resolve(root,
  "scripts/e2e/property-remediation/bootstrap/ephemeral-postgres.mjs");
const lifecycleHelperPath = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c4-runtime-lifecycle.mjs");
const reviewedBootstrapPath = resolve(root,
  "scripts/e2e/property-remediation/lib/reviewed-bootstrap-contract.mjs");

export const FIXED_AUTHORITIES = Object.freeze({
  b_contract_v2: "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944",
  b_schema_expand: "53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874",
  b_high_risk_stopship: "d30c601729d83155fda96a0686043cd6fcc6f098368775d1ce73aa0983dfa9d8",
  runtime_effect_manifest: "47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf",
  migration_000189: "f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2"
});

export const AUTHORITY_SIDECARS = Object.freeze({
  contract_locator: [contractLocatorPath,
    "671ebcc86c9c49a6f6f9dbf2818ee1646c3a814a4b3d3329cfa09bbb6f705f10"],
  contract_final_gate: [contractFinalGatePath,
    "06733bc1a4a4fe44b592b5f6a7beb2d019ea2804691a2f160cd97b7ee5e5ca87"],
  schema_handoff: [schemaHandoffPath,
    "24c29bc464c31962ac3012a23841beecba10f18e4cf4191b05d7adc367c3ec1d"],
  stopship_implementation_record: [parentImplementPath,
    "9fa03904f4b12c562a24991154f7a28d601151e0df432d00657518e100f31058"],
  stopship_independent_review_record: [parentReviewGatesPath,
    "7f3bf48bde42266641dc9f8c2c1ac3f4afb47524b62a43d62d29d3d0b4bcae09"]
});

export const MODULE_MIGRATIONS = Object.freeze([
  ["000184_property_workbench_read_permissions.sql", "fe6c5339d02985a411b19f99513766af616ff6a1b1119f7ad83a8fceef40b035"],
  ["000185_property_b_identity_schema_expand.sql", "3191ef37395a13ce513283e73994fc6949798dde8fc9666f586c9aeb4c3312ec"],
  ["000186_property_b_approval_runtime_schema.sql", "5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e"],
  ["000187_property_b_event_notification_schema.sql", "85dbd8235a538ed243a613ae9a12d6bddaba34f88687296c1ad02d3df9504c20"],
  ["000188_property_b_task_runtime_schema.sql", "e0b659d9d5c35eec67cfa029240538626492736e4f450f2b47acb40e25dc4e08"],
  ["000189_property_b_module_rbac_definitions.sql", FIXED_AUTHORITIES.migration_000189],
  ["000190_property_b_migration_compatibility_control.sql", "da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a"]
]);

const fixtureLabel = "pr192-b-module-core-gate";
const databaseName = "pr192_b_module_core";
const postgresUser = "pr192_module_core";
const finalPostgresInitMarker = "PostgreSQL init process complete; ready for start up.";
const childTimeoutMs = 60_000;
const expectedStaticTests = 13;
const expectedTargetedTests = 4;
const expectedPgTests = 5;

export const MODULE_CORE_TEST_PREREQUISITE_SQL = `
INSERT INTO sys_module (
  id,module_code,module_name,module_group,description,route_prefix,icon,
  status,sort_no,is_deleted,version,remark
) VALUES (
  'a5500000-0000-4000-8000-000000000001','asset','Asset gate prerequisite',
  'business','Module-core isolated PostgreSQL test prerequisite','/assets','building-2',
  1,20,false,1,'PR192 module-core test-only prerequisite'
)
ON CONFLICT (module_code) WHERE is_deleted=false DO UPDATE SET
  status=1,is_deleted=false,version=EXCLUDED.version,remark=EXCLUDED.remark;
`;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function posixRelative(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function assertRegularFile(path) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`module-core authority requires a regular file:${posixRelative(path)}`);
  }
  return path;
}

export function listModuleTree() {
  const walk = (directory) => {
    const metadata = lstatSync(directory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`module-core tree requires a real directory:${posixRelative(directory)}`);
    }
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      const child = lstatSync(path);
      if (child.isSymbolicLink()) {
        throw new Error(`module-core tree forbids symlink:${posixRelative(path)}`);
      }
      if (child.isDirectory()) return walk(path);
      if (!child.isFile() || !path.endsWith(".ts")) {
        throw new Error(`module-core tree permits only TypeScript files:${posixRelative(path)}`);
      }
      return [path];
    });
  };
  const files = walk(moduleTreeRoot).sort((left, right) =>
    Buffer.from(posixRelative(left)).compare(Buffer.from(posixRelative(right))));
  const production = files.filter((path) => !path.endsWith(".spec.ts"));
  const targeted = files.filter((path) => path.endsWith(".spec.ts"));
  if (files.length !== 14 || production.length !== 13 || targeted.length !== 1
    || !targeted[0]?.endsWith("saas-modules.property-dependency.spec.ts")) {
    throw new Error(
      `module-core exact tree mismatch:total=${files.length}:production=${production.length}:spec=${targeted.length}`
    );
  }
  return files;
}

export function verifyFixedAuthorities() {
  const runtimeBytes = readFileSync(assertRegularFile(runtimeFreezePath));
  if (sha256(runtimeBytes) !== FIXED_AUTHORITIES.runtime_effect_manifest) {
    throw new Error("module-core runtime effect authority drift");
  }
  const sidecars = Object.entries(AUTHORITY_SIDECARS).map(([name, [path, expected]]) => {
    const bytes = readFileSync(assertRegularFile(path));
    const observed = sha256(bytes);
    if (observed !== expected) {
      throw new Error(`module-core authority sidecar drift:${name}:${expected}:${observed}`);
    }
    return { name, path, bytes, raw_sha256: observed };
  });
  const sidecarText = Object.fromEntries(sidecars.map((entry) =>
    [entry.name, entry.bytes.toString("utf8")]));
  for (const name of ["contract_locator", "contract_final_gate"]) {
    if (!sidecarText[name].includes(FIXED_AUTHORITIES.b_contract_v2)) {
      throw new Error(`module-core B-contract authority missing:${name}`);
    }
  }
  if (!sidecarText.schema_handoff.includes(FIXED_AUTHORITIES.b_schema_expand)
    || !sidecarText.schema_handoff.includes('"status": "passed"')
    || !sidecarText.schema_handoff.includes('"open_P0_P1": []')) {
    throw new Error("module-core B-schema-expand handoff is not active and closed");
  }
  for (const name of ["stopship_implementation_record", "stopship_independent_review_record"]) {
    if (!sidecarText[name].includes(FIXED_AUTHORITIES.b_high_risk_stopship)) {
      throw new Error(`module-core stopship authority missing:${name}`);
    }
  }
  const migrations = MODULE_MIGRATIONS.map(([filename, expected]) => {
    const path = assertRegularFile(resolve(migrationRoot, filename));
    const bytes = readFileSync(path);
    const observed = sha256(bytes);
    if (observed !== expected) {
      throw new Error(`module-core migration authority drift:${filename}:${expected}:${observed}`);
    }
    return { path, bytes };
  });
  return { migrations, sidecars };
}

function buildSignedInputs() {
  const reviewed = loadReviewedBootstrapContract(migrationRoot);
  const verified = verifyFixedAuthorities();
  const migrationInputs = verified.migrations.map(({ path }) => path);
  const sidecarInputs = verified.sidecars.map(({ path }) => path);
  return [...new Set([
    ...listModuleTree(),
    ...reviewed.entries.map((entry) => resolve(migrationRoot, entry.filename)),
    ...migrationInputs,
    ...sidecarInputs,
    runtimeFreezePath,
    correctionPlanPath,
    runnerPath,
    staticSpecPath,
    pgSpecPath,
    ephemeralHelperPath,
    lifecycleHelperPath,
    reviewedBootstrapPath,
    resolve(apiRoot, "package.json"),
    resolve(apiRoot, "tsconfig.json"),
    resolve(apiRoot, "tsconfig.build.json"),
    resolve(apiRoot, "nest-cli.json"),
    resolve(root, "package.json"),
    resolve(root, "eslint.config.mjs"),
    resolve(root, "tsconfig.base.json"),
    resolve(root, "pnpm-lock.yaml"),
    resolve(root, "pnpm-workspace.yaml")
  ])].sort((left, right) => Buffer.from(posixRelative(left))
    .compare(Buffer.from(posixRelative(right)))).map(assertRegularFile);
}

export function captureInputFreeze(stage) {
  const files = buildSignedInputs().map((path) => {
    const bytes = readFileSync(path);
    return { path: posixRelative(path), bytes: bytes.length, raw_sha256: sha256(bytes) };
  });
  const grammar = `property-b-module-core-input-freeze-v1\n${Object.entries(FIXED_AUTHORITIES)
    .map(([key, value]) => `authority\t${key}\t${value}\n`).join("")}${files
    .map((file) => `${file.path}\t${file.bytes}\t${file.raw_sha256}\n`).join("")}`;
  return { stage, files, raw_sha256: sha256(grammar) };
}

export function assertFreezeUnchanged(expected, stage) {
  const observed = captureInputFreeze(stage);
  if (observed.raw_sha256 !== expected.raw_sha256) {
    throw new Error(
      `module-core four-stage input drift:${expected.raw_sha256}:${observed.raw_sha256}`
    );
  }
  return observed;
}

export function parseTap(output, expected, label) {
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
    if (matches.length !== 1) throw new Error(`${label} TAP requires one ${field} summary`);
    return [field, Number(matches[0][1])];
  }));
  if (summary.tests !== expected || summary.pass !== expected
    || summary.fail !== 0 || summary.skipped !== 0) {
    throw new Error(`${label} TAP mismatch:${JSON.stringify(summary)}`);
  }
  return summary;
}

function runQualityCommand(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    env: environment
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `module-core quality gate failed:${command} ${args.join(" ")}:`
      + `${result.error?.message ?? result.stderr ?? result.stdout}`
    );
  }
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    stdout_sha256: sha256(result.stdout),
    stderr_sha256: sha256(result.stderr),
    stdout_bytes: Buffer.byteLength(result.stdout),
    stderr_bytes: Buffer.byteLength(result.stderr)
  };
}

function serializableError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack_sha256: error instanceof Error && error.stack ? sha256(error.stack) : null
  };
}

function inspect(docker, type, target) {
  const args = type === "volume"
    ? ["volume", "inspect", target]
    : ["inspect", "--type", "container", target];
  const result = docker(args, { allowFailure: true });
  if (result.status !== 0) {
    if (/no such (object|container|volume)/iu.test(`${result.stdout}\n${result.stderr}`)) {
      return null;
    }
    throw new Error(`docker ${type} inspect failed:${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout)[0] ?? null;
}

export async function runFormalGate(environment = process.env) {
  assertNoDatabaseUrlOverrides(environment);
  const runId = validateRunId(environment.PROPERTY_MODULE_CORE_RUN_ID ?? "");
  const runIdDigest = sha256(runId);
  const attemptId = `attempt-${randomBytes(8).toString("hex")}`;
  const startedAt = new Date().toISOString();
  const artifactPath = resolve(researchRoot, `b-module-core-gate-${runId}.json`);
  const manifestPath = resolve(researchRoot, `b-module-core-gate-${runId}.manifest.txt`);
  const reservationPath = resolve(researchRoot,
    `.b-module-core-runid-${runIdDigest}.reservation.json`);
  const containerName = `pr192_b_module_core_${runId}_db`;
  const postgresPassword = `${runId}_local_only`;
  const docker = (args, options = {}) => runDocker(args, { cwd: root, ...options });

  if (lstatSync(researchRoot).isSymbolicLink() || realpathSync(researchRoot) !== researchRoot) {
    throw new Error("module-core research root must be a real directory");
  }
  for (const target of [artifactPath, manifestPath, reservationPath]) {
    if (dirname(target) !== researchRoot) {
      throw new Error("module-core evidence must be a direct research child");
    }
    if (existsSync(target)) throw new Error(`module-core runId is permanently reserved:${runId}`);
  }

  const reservationValue = {
    schema_version: "property-b-module-core-runid-reservation-v1",
    run_id: runId,
    run_id_sha256: runIdDigest,
    artifact: posixRelative(artifactPath),
    detached_manifest: posixRelative(manifestPath),
    reserved_at: startedAt
  };
  const reservationBytes = `${JSON.stringify(reservationValue, null, 2)}\n`;
  writeFileSync(reservationPath, reservationBytes, { flag: "wx", mode: 0o600 });
  chmodSync(reservationPath, 0o600);
  const reservation = {
    ...reservationValue,
    path: posixRelative(reservationPath),
    bytes: Buffer.byteLength(reservationBytes),
    raw_sha256: sha256(reservationBytes),
    immutable_and_preserved: true
  };

  let stage = "before-container";
  let freezeBefore = null;
  let freezeAfterLocal = null;
  let freezeAfterPg = null;
  let freezeAfterCleanup = null;
  let creationAttempted = false;
  let containerId = null;
  let volumeName = null;
  let hostPort = null;
  let child = null;
  let interruptedBy = null;
  let localGate = null;
  let targetedGate = null;
  let qualityGate = null;
  let pgGate = null;
  let bootstrapGate = null;
  let prerequisiteGate = null;
  let environmentEvidence = null;
  let cleanupEvidence = null;
  let primaryError = null;
  let failedStage = null;

  const signalHandlers = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => [
    signal,
    () => {
      interruptedBy = signal;
      child?.kill("SIGTERM");
    }
  ]));
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);

  const validateExact = (observed, requireLoopbackPort = false, requireRunning = false) =>
    assertExactEphemeralPostgresContainer(observed, {
      containerName, databaseName, fixtureLabel, runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort, requireRunning
    });
  const cleanup = () => cleanupExactLifecycle({
    creationAttempted,
    containerName,
    containerId,
    volumeName,
    inspectContainer: (name) => inspect(docker, "container", name),
    inspectVolume: (name) => inspect(docker, "volume", name),
    validateContainer: (observed) => validateExact(observed, false, false),
    removeContainer: (id) => docker(["rm", "-f", "-v", id]),
    removeVolume: (name) => docker(["volume", "rm", name])
  });

  try {
    freezeBefore = captureInputFreeze("before-container");

    stage = "local-static-gate";
    const local = spawnSync(process.execPath, [staticSpecPath], {
      cwd: root, encoding: "utf8", timeout: childTimeoutMs, maxBuffer: 8 * 1024 * 1024
    });
    if (local.error || local.status !== 0) {
      throw new Error(`module-core static gate failed:${local.error?.message ?? local.stderr}`);
    }
    localGate = parseTap(local.stdout, expectedStaticTests, "module-core static gate");

    stage = "local-targeted-gate";
    const targeted = spawnSync(process.execPath, ["--require",
      resolve(apiRoot, "node_modules/ts-node/register"), targetedSpecPath], {
      cwd: root,
      encoding: "utf8",
      timeout: childTimeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...environment, TS_NODE_PROJECT: resolve(apiRoot, "tsconfig.json") }
    });
    if (targeted.error || targeted.status !== 0) {
      throw new Error(
        `module-core targeted gate failed:${targeted.error?.message ?? targeted.stderr}`
      );
    }
    targetedGate = parseTap(
      targeted.stdout, expectedTargetedTests, "module-core targeted gate"
    );

    stage = "local-quality-gate";
    qualityGate = {
      typecheck: runQualityCommand("pnpm", ["--filter", "@jinhu/api", "typecheck"], environment),
      build: runQualityCommand("pnpm", ["--filter", "@jinhu/api", "build"], environment),
      eslint: runQualityCommand("pnpm", ["exec", "eslint",
        "apps/api/src/saas-modules.module-core.pg.spec.ts",
        "apps/api/src/modules/saas-modules/saas-modules.property-dependency.spec.ts",
        "apps/api/src/modules/saas-modules/saas-modules.service.ts",
        "scripts/e2e/property-remediation/track-b-module-core-gate.mjs",
        "scripts/e2e/property-remediation/track-b-module-core-gate.spec.mjs"
      ], environment)
    };
    freezeAfterLocal = assertFreezeUnchanged(freezeBefore, "after-local");

    stage = "postgres-start";
    if (inspect(docker, "container", containerName)) {
      throw new Error(`exclusive module-core fixture already exists:${containerName}`);
    }
    creationAttempted = true;
    const created = docker(buildEphemeralPostgresRunArgs({
      containerName, databaseName, fixtureLabel, runId, postgresUser, postgresPassword
    }));
    const observed = inspect(docker, "container", containerName);
    const exact = validateExact(observed, true, true);
    containerId = resolveCreatedContainerId(created.stdout, observed, {
      containerName, databaseName, fixtureLabel, runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
    });
    volumeName = exact.volumeName;
    hostPort = exact.hostPort;

    stage = "postgres-ready";
    let stable = 0;
    for (let attempt = 0; attempt < 180 && stable < 2; attempt += 1) {
      const current = inspect(docker, "container", containerName);
      const currentExact = validateExact(current, true, true);
      if (currentExact.containerId !== containerId || currentExact.volumeName !== volumeName
        || currentExact.hostPort !== hostPort) {
        throw new Error("module-core PostgreSQL authority drift");
      }
      const logs = docker(["logs", "--tail", "80", containerId], { allowFailure: true });
      const ready = docker(["exec", containerId, "pg_isready", "-U", postgresUser,
        "-d", databaseName], { allowFailure: true });
      stable = logs.status === 0 && logs.stdout.includes(finalPostgresInitMarker)
        && ready.status === 0 ? stable + 1 : 0;
      if (stable < 2) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    if (stable < 2) throw new Error("module-core PostgreSQL final readiness timeout");
    const imageInspect = docker(["image", "inspect", OFFICIAL_POSTGRES_IMAGE], {
      allowFailure: true
    });
    if (imageInspect.status !== 0) {
      throw new Error(`module-core image inspect failed:${imageInspect.stderr}`);
    }
    const [imageMetadata] = JSON.parse(imageInspect.stdout);
    const serverVersion = docker(["exec", containerId, "psql", "-X", "-qAt",
      "-U", postgresUser, "-d", databaseName, "-c", "SHOW server_version"], {
      allowFailure: true
    });
    if (serverVersion.status !== 0 || !/^16\./u.test(serverVersion.stdout.trim())) {
      throw new Error(`module-core PostgreSQL version mismatch:${serverVersion.stdout}`);
    }
    environmentEvidence = {
      image_reference: observed.Config?.Image ?? null,
      image_id: observed.Image ?? null,
      image_repo_digests: [...(imageMetadata?.RepoDigests ?? [])].sort(),
      postgres_server_version: serverVersion.stdout.trim(),
      host_ip: "127.0.0.1",
      host_port: hostPort,
      database: databaseName
    };

    stage = "postgres-migrations";
    const reviewed = loadReviewedBootstrapContract(migrationRoot);
    const psql = (sql, { allowFailure = false, tuplesOnly = false } = {}) =>
      docker(["exec", "-i", containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1",
        ...(tuplesOnly ? ["-qAt", "-F", "|"] : ["-q"]),
        "-U", postgresUser, "-d", databaseName], { input: sql, allowFailure });
    const applyBootstrapEntries = (entries) => {
      const sql = entries.map((entry) =>
        `\\echo applying ${entry.filename}\n${entry.sql}\n`).join("\n");
      const result = psql(sql, { allowFailure: true });
      if (result.status !== 0) {
        throw new Error(`module-core reviewed bootstrap failed:${result.stderr || result.stdout}`);
      }
      return entries.length;
    };
    const before175 = reviewed.entries.filter((entry) => entry.number < 175);
    const after175 = reviewed.entries.filter((entry) => entry.number > 175);
    const appliedBefore = applyBootstrapEntries(before175);
    const rollback175 = await verifyReviewedMigration175Rollback({
      migration: reviewed.migration175,
      psql
    });
    const appliedAfter = applyBootstrapEntries(after175);
    bootstrapGate = {
      bootstrap_sha256: reviewed.bootstrapSha256,
      applied: appliedBefore + appliedAfter,
      skipped: [rollback175]
    };
    const prerequisite = psql(MODULE_CORE_TEST_PREREQUISITE_SQL, { allowFailure: true });
    if (prerequisite.status !== 0) {
      throw new Error(
        `module-core test prerequisite failed:${prerequisite.stderr || prerequisite.stdout}`
      );
    }
    const prerequisiteRows = psql(`
      SELECT module_code||'|'||status||'|'||is_deleted::text
      FROM sys_module
      WHERE module_code IN ('asset','homestay','housing_rental')
      ORDER BY module_code COLLATE "C";
    `, { tuplesOnly: true });
    const prerequisiteExact = prerequisiteRows.stdout.trim().split("\n");
    if (JSON.stringify(prerequisiteExact) !== JSON.stringify([
      "asset|1|false", "homestay|1|false", "housing_rental|1|false"
    ])) {
      throw new Error(`module-core test prerequisite exact-set mismatch:${prerequisiteRows.stdout}`);
    }
    prerequisiteGate = {
      status: "passed",
      row_count: 3,
      exact_rows_sha256: sha256(`${prerequisiteRows.stdout.trim()}\n`),
      sql_sha256: sha256(MODULE_CORE_TEST_PREREQUISITE_SQL)
    };
    const moduleSql = verifyFixedAuthorities().migrations
      .map(({ path, bytes }) => `\\echo applying ${posixRelative(path)}\n${bytes.toString("utf8")}\n`)
      .join("\n");
    const migrated = psql(moduleSql, { allowFailure: true });
    if (migrated.status !== 0) {
      throw new Error(`module-core migration bootstrap failed:${migrated.stderr || migrated.stdout}`);
    }

    stage = "postgres-nest-service";
    pgGate = await new Promise((resolveGate, rejectGate) => {
      child = spawn(process.execPath, ["--require", "ts-node/register", pgSpecPath], {
        cwd: apiRoot,
        env: {
          ...environment,
          NODE_ENV: "test",
          POSTGRES_HOST: "127.0.0.1",
          POSTGRES_PORT: hostPort,
          POSTGRES_DB: databaseName,
          POSTGRES_USER: postgresUser,
          POSTGRES_PASSWORD: postgresPassword,
          PROPERTY_MODULE_CORE_PG_REQUIRED: "1"
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child?.kill("SIGKILL");
      }, childTimeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", rejectGate);
      child.once("close", (status, signal) => {
        clearTimeout(timeout);
        child = null;
        if (timedOut) return rejectGate(new Error("module-core PG spec hard timeout"));
        if (interruptedBy) return rejectGate(new Error(`module-core interrupted:${interruptedBy}`));
        if (status !== 0) {
          return rejectGate(new Error(`module-core PG spec failed:${JSON.stringify({
            status, signal, stdout, stderr
          })}`));
        }
        try {
          resolveGate(parseTap(stdout, expectedPgTests, "module-core PG gate"));
        } catch (error) {
          rejectGate(error);
        }
      });
    });
    freezeAfterPg = assertFreezeUnchanged(freezeBefore, "after-pg");
  } catch (error) {
    primaryError = error;
    failedStage = stage;
  } finally {
    stage = "cleanup";
    try {
      cleanupEvidence = cleanup();
      if (cleanupEvidence.status !== "passed" && !primaryError) {
        primaryError = new Error("module-core exact cleanup failed");
        failedStage = stage;
      }
    } catch (error) {
      cleanupEvidence = {
        status: "failed", attempted: creationAttempted,
        container_absent: false, anonymous_volume_absent: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
      primaryError ??= error;
      failedStage ??= stage;
    }
    stage = "after-cleanup";
    try {
      freezeAfterCleanup = freezeBefore
        ? assertFreezeUnchanged(freezeBefore, "after-cleanup") : null;
    } catch (error) {
      primaryError ??= error;
      failedStage ??= stage;
    }
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
  }

  const outcome = {
    schema_version: "property-b-module-core-gate-candidate-v1",
    ...(reservation ? { run_id: runId, run_id_reservation: reservation }
      : { attempt_id: attemptId, attempted_run_id: runId }),
    status: primaryError ? "failed" : "passed",
    candidate_admissible: !primaryError,
    final_grammar_or_signoff_generated: false,
    fixed_authorities: FIXED_AUTHORITIES,
    module_tree: { total: 14, production: 13, targeted_spec: 1 },
    input_freeze_before_container: freezeBefore,
    input_freeze_after_local: freezeAfterLocal,
    input_freeze_after_pg: freezeAfterPg,
    input_freeze_after_cleanup: freezeAfterCleanup,
    local_gate: localGate,
    targeted_gate: targetedGate,
    quality_gate: qualityGate,
    reviewed_bootstrap_gate: bootstrapGate,
    test_prerequisite_gate: prerequisiteGate,
    environment: environmentEvidence,
    postgres_gate: pgGate,
    cleanup: cleanupEvidence,
    ...(primaryError ? { failed_stage: failedStage ?? stage, error: serializableError(primaryError) }
      : { open_p0_p1: [] })
  };
  const artifactBytes = `${JSON.stringify(outcome, null, 2)}\n`;
  const artifactSha = sha256(artifactBytes);
  const manifestBytes = [
    "property-b-module-core-gate-candidate-v1",
    `run_id\t${runId}`,
    `status\t${outcome.status}`,
    `candidate_admissible\t${outcome.candidate_admissible}`,
    "final_grammar_or_signoff_generated\tfalse",
    `reservation\t${reservation.path}\t${reservation.raw_sha256}`,
    `freeze_before_container\t${freezeBefore?.raw_sha256 ?? "unavailable"}`,
    `freeze_after_local\t${freezeAfterLocal?.raw_sha256 ?? "unavailable"}`,
    `freeze_after_pg\t${freezeAfterPg?.raw_sha256 ?? "unavailable"}`,
    `freeze_after_cleanup\t${freezeAfterCleanup?.raw_sha256 ?? "unavailable"}`,
    `artifact\t${posixRelative(artifactPath)}\t${Buffer.byteLength(artifactBytes)}\t${artifactSha}`,
    ""
  ].join("\n");
  writeFileSync(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
  writeFileSync(artifactPath, artifactBytes, { flag: "wx", mode: 0o600 });
  chmodSync(manifestPath, 0o600);
  chmodSync(artifactPath, 0o600);

  if (primaryError) throw primaryError;
  return {
    status: "passed", run_id: runId, candidate_admissible: true,
    artifact: posixRelative(artifactPath), artifact_raw_sha256: artifactSha,
    manifest: posixRelative(manifestPath), manifest_raw_sha256: sha256(manifestBytes),
    cleanup: cleanupEvidence
  };
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(await runFormalGate())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: "failed", error: serializableError(error)
    })}\n`);
    process.exitCode = 1;
  }
}
