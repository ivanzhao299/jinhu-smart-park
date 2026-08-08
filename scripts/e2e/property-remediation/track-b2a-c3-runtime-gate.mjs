/* global process */
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync, lstatSync, readFileSync, readdirSync, realpathSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_POSTGRES_IMAGE,
  assertExactEphemeralPostgresContainer,
  buildEphemeralPostgresRunArgs,
  resolveCreatedContainerId,
  runDocker,
  validateRunId
} from "./bootstrap/ephemeral-postgres.mjs";
import {
  cleanupExactLifecycle, outcomeAuthority, publishOutcome, reserveRunId
} from "./track-b2a-c3-runtime-lifecycle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationRoot = resolve(root, "database/migrations");
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research");
const seed = resolve(root, "database/seeds/000001_s1_production_core.sql");
const runId = validateRunId(
  process.env.PROPERTY_B2A_C3_RUN_ID ?? `b2ac3_${randomBytes(9).toString("hex")}`
);
const attemptId = `attempt_${randomBytes(12).toString("hex")}`;
const artifactPath = resolve(root, process.env.PROPERTY_B2A_C3_ARTIFACT_PATH ?? "");
const artifactManifestPath = artifactPath.endsWith(".json")
  ? `${artifactPath.slice(0, -5)}.manifest.txt` : `${artifactPath}.manifest.txt`;
if (!process.env.PROPERTY_B2A_C3_ARTIFACT_PATH) {
  throw new Error("PROPERTY_B2A_C3_ARTIFACT_PATH is required");
}
if (dirname(artifactPath) !== researchRoot || dirname(artifactManifestPath) !== researchRoot
  || !artifactPath.endsWith(".json") || existsSync(artifactPath) || existsSync(artifactManifestPath)
  || lstatSync(researchRoot).isSymbolicLink()
  || realpathSync(researchRoot) !== researchRoot) {
  throw new Error("C3 candidate must be a new direct .json child of the exact research directory");
}

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
  const number = Number(name.match(/^(\d{6})_.*\.sql$/)?.[1]);
  return Number.isInteger(number) && number <= 182 && number !== 175;
}).sort();
const c3Spec = resolve(root,
  "apps/api/src/modules/property-approvals/property-mutation-receipt.pg.spec.ts");
const runnerStaticSpec = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c3-runtime-gate.spec.mjs");
const lifecycleHelper = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c3-runtime-lifecycle.mjs");
function recursiveFiles(directory, predicate) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? recursiveFiles(path, predicate)
      : predicate(path) ? [path] : [];
  });
}
const propertyApprovalRoot = resolve(root, "apps/api/src/modules/property-approvals");
const propertyApprovalSpecs = recursiveFiles(propertyApprovalRoot,
  (path) => path.endsWith(".spec.ts")).sort();
const b1PgSpecs = [
  resolve(root, "apps/api/src/modules/property-approvals/property-approval.runtime.pg.spec.ts"),
  resolve(root, "apps/api/src/modules/property-approvals/outbox/property-event-runtime.pg.spec.ts")
];
const signedInputs = [
  resolve(root, ".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-runtime-contract-freeze.md"),
  resolve(researchRoot, "legacy-action-authority-v1.txt"),
  resolve(researchRoot, "port-v2-action-identity-mode-v1.txt"),
  resolve(researchRoot, "b2a-c3-0-000195-final-gate-signoff.md"),
  ...["json", "catalog.json", "functions.json", "security.json", "manifest.txt"].map((suffix) =>
    resolve(researchRoot, `b2a-c3-0-formal-candidate-20260801f.${suffix}`)),
  resolve(root, "packages/shared/src/property-business/property-task-contracts.ts"),
  resolve(root, "packages/shared/test/track-b-property-task-contract.test.cjs"),
  resolve(root, "apps/api/src/modules/property-approvals/property-approval.module.ts"),
  resolve(root, "apps/api/src/modules/property-approvals/property-approval.module.spec.ts"),
  resolve(root, "apps/api/src/modules/property-approvals/entities/property-approval.entities.ts"),
  resolve(root, "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.ts"),
  resolve(root, "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.spec.ts"),
  c3Spec,
  ...b1PgSpecs,
  ...recursiveFiles(resolve(root, "apps/api/src"), (path) => path.endsWith(".ts")),
  ...recursiveFiles(resolve(root, "packages/shared/src"), (path) => path.endsWith(".ts")),
  resolve(root, "apps/api/package.json"),
  resolve(root, "apps/api/nest-cli.json"),
  resolve(root, "apps/api/tsconfig.json"),
  resolve(root, "packages/shared/package.json"),
  resolve(root, "packages/shared/tsconfig.json"),
  resolve(root, "tsconfig.base.json"),
  ...recursiveFiles(resolve(root, "packages/config"), (path) => path.endsWith(".json")),
  resolve(root, "eslint.config.mjs"),
  resolve(root, "package.json"),
  resolve(root, "pnpm-lock.yaml"),
  resolve(root, "pnpm-workspace.yaml"),
  ...baselineMigrations.map((name) => resolve(migrationRoot, name)),
  seed,
  resolve(migrationRoot, "000183_property_business_granular_rbac.sql"),
  resolve(migrationRoot, "000184_property_workbench_read_permissions.sql"),
  ...migrationChain.map((name) => resolve(migrationRoot, name)),
  resolve(root, "scripts/e2e/property-remediation/bootstrap/ephemeral-postgres.mjs"),
  lifecycleHelper,
  runnerStaticSpec,
  fileURLToPath(import.meta.url)
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const captureInputs = (stage) => {
  const files = [...new Set(signedInputs)].sort().map((path) => {
    const bytes = readFileSync(path);
    return { path: path.slice(root.length + 1), bytes: bytes.length, raw_sha256: sha256(bytes) };
  });
  const grammar = `property-remediation-b2a-c3-runtime-input-freeze-v1\n${files.map((file) =>
    `${file.path}\t${file.bytes}\t${file.raw_sha256}\n`).join("")}`;
  return { stage, files, grammar, raw_sha256: sha256(grammar) };
};
let inputFreeze = null;
const assertInputsFrozen = (stage) => {
  const observed = captureInputs(stage);
  if (observed.raw_sha256 !== inputFreeze.raw_sha256) {
    throw new Error(`C3 signed input drift: ${inputFreeze.raw_sha256} != ${observed.raw_sha256}`);
  }
  return observed;
};

const containerName = `pr192_b2a_c3_${runId}_db`;
const databaseName = "pr192_b2a_c3_gate";
const postgresUser = "pr192_b2a_c3";
const postgresPassword = `${runId}_local_only`;
const fixtureLabel = "pr192-b2a-c3-runtime-gate";
const docker = (args, options = {}) => runDocker(args, { cwd: root, ...options });
let containerId = null;
let volumeName = null;
let creationAttempted = false;
let environment = null;
let cleanupEvidence = null;
let reservationEvidence = null;
const startedAt = new Date().toISOString();

function inspect(type, target) {
  const result = docker(type === "volume" ? ["volume", "inspect", target]
    : ["inspect", "--type", type, target], { allowFailure: true });
  if (result.status !== 0) {
    if (/no such (object|container|volume)/i.test(`${result.stdout}\n${result.stderr}`)) return null;
    throw new Error(`docker ${type} inspect failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout)[0] ?? null;
}

function startPostgres() {
  if (inspect("container", containerName)) throw new Error(`fixture already exists: ${containerName}`);
  creationAttempted = true;
  const created = docker(buildEphemeralPostgresRunArgs({
    containerName, databaseName, fixtureLabel, runId, postgresUser, postgresPassword
  }));
  const inspected = inspect("container", containerName);
  const exact = assertExactEphemeralPostgresContainer(inspected, {
    containerName, databaseName, fixtureLabel, runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
  });
  containerId = exact.containerId;
  volumeName = exact.volumeName;
  if (resolveCreatedContainerId(created.stdout, inspected, {
    containerName, databaseName, fixtureLabel, runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
  }) !== containerId) throw new Error("created container identity mismatch");
  environment = {
    image_reference: OFFICIAL_POSTGRES_IMAGE, image_digest: inspected.Image,
    container_id: containerId, container_name: containerName,
    anonymous_volume_name: volumeName, host_port: exact.hostPort
  };
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const logs = docker(["logs", "--tail", "80", containerId], { allowFailure: true });
    const ready = docker(["exec", containerId, "pg_isready", "-U", postgresUser, "-d", databaseName],
      { allowFailure: true });
    if (`${logs.stdout}${logs.stderr}`.includes("PostgreSQL init process complete; ready for start up.")
      && ready.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("ephemeral PostgreSQL readiness timeout");
}

function psql(sql, { tuples = false } = {}) {
  return docker(["exec", "-i", containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1",
    ...(tuples ? ["-qAt", "-F", "\t"] : ["-q"]), "-U", postgresUser, "-d", databaseName],
  { input: `\\set VERBOSITY verbose\n${sql}` });
}
const query = (sql) => psql(sql, { tuples: true }).stdout.trimEnd();
const applyMigration = (name) => psql(readFileSync(resolve(migrationRoot, name), "utf8"));

function ensureHistory() {
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
    psql(`INSERT INTO public.${table}
      (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
      VALUES (${sqlLiteral(name)},${sqlLiteral(checksum)},'succeeded',clock_timestamp(),
        clock_timestamp(),NULL,'b2a-c3-runtime-gate',${sqlLiteral(runId.slice(0, 32))});`);
  }
}

const legacyActions = [
  "property.approval.submit", "property.approval.withdraw", "property.approval.decide",
  "property.approval.incident-retry", "property.event.replay", "property.notification.mark-read",
  "party.identity.create-draft", "party.identity.update-draft", "party.identity.submit",
  "party.identity.claim", "party.identity.reassign", "party.identity.verify", "party.identity.withdraw"
];
function seedLegacyContinuity() {
  const values = legacyActions.map((action, index) => `(${index + 1},${sqlLiteral(action)})`).join(",");
  psql(`DO $fixture$ DECLARE r record; v_id uuid; BEGIN
    FOR r IN SELECT * FROM (VALUES ${values}) action(ordinal,action_id) LOOP
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES ('c3-runtime-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('51000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'started-'||r.ordinal,repeat('a',64));
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES ('c3-runtime-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('52000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'completed-'||r.ordinal,repeat('b',64))
      RETURNING id INTO v_id;
      UPDATE biz_property_mutation_receipt SET receipt_status='completed',result_ref='legacy/result/'||r.ordinal,
        result_hash=repeat('c',64),completed_at=clock_timestamp() WHERE id=v_id;
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,
        request_hash,receipt_status,result_ref,result_hash)
      VALUES ('c3-runtime-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('53000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'failed-'||r.ordinal,
        repeat('d',64),'failed','legacy/failed/'||r.ordinal,repeat('e',64));
    END LOOP; END $fixture$;`);
}

function bootstrap() {
  for (const name of baselineMigrations) applyMigration(name);
  psql(readFileSync(seed, "utf8"));
  applyMigration("000183_property_business_granular_rbac.sql");
  applyMigration("000184_property_workbench_read_permissions.sql");
  psql(`INSERT INTO asset_park(tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark)
    VALUES ('10000001','20000001','B2A_C3_GATE','B2a C3 runtime isolated park','enabled',false,1,
      'C3 runtime gate');`);
  ensureHistory();
  for (const name of migrationChain) {
    if (name === "000195_property_mutation_receipt_contract_v2.sql") seedLegacyContinuity();
    applyMigration(name);
    recordHistory(name);
  }
}

function runSpec(path, url) {
  const result = spawnSync(process.execPath,
    ["--require", "ts-node/register", path], {
      cwd: resolve(root, "apps/api"), encoding: "utf8", timeout: 240_000,
      maxBuffer: 40 * 1024 * 1024,
      env: { ...process.env, PROPERTY_RUNTIME_PG_URL: url, PROPERTY_MUTATION_RECEIPT_PG_URL: url }
    });
  const tests = Number(result.stdout.match(/^# tests (\d+)$/mu)?.[1] ?? -1);
  const passed = Number(result.stdout.match(/^# pass (\d+)$/mu)?.[1] ?? -1);
  const skipped = Number(result.stdout.match(/^# skipped (\d+)$/mu)?.[1] ?? 0);
  if (result.status !== 0 || /# fail [1-9]/u.test(result.stdout)
    || tests < 1 || passed !== tests || skipped !== 0) {
    throw new Error(`PostgreSQL spec failed: ${path}\n${result.stdout}\n${result.stderr}`);
  }
  return {
    path: path.slice(root.length + 1), raw_sha256: sha256(readFileSync(path)),
    exit_status: result.status, tests, passed, skipped,
    stdout_sha256: sha256(result.stdout), stderr_sha256: sha256(result.stderr)
  };
}

function runLocalCommand(name, command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd, encoding: "utf8", timeout: 300_000, maxBuffer: 40 * 1024 * 1024,
    env: { ...process.env }
  });
  if (result.status !== 0 || /# fail [1-9]/u.test(result.stdout)) {
    throw new Error(`C3 local gate failed: ${name}\n${result.stdout}\n${result.stderr}`);
  }
  return { name, command: [command, ...args], cwd: cwd.slice(root.length + 1) || ".",
    exit_status: result.status, stdout_sha256: sha256(result.stdout),
    stderr_sha256: sha256(result.stderr),
    tests: Number(result.stdout.match(/^# tests (\d+)$/mu)?.[1] ?? 0),
    passed: Number(result.stdout.match(/^# pass (\d+)$/mu)?.[1] ?? 0),
    failed: Number(result.stdout.match(/^# fail (\d+)$/mu)?.[1] ?? 0),
    skipped: Number(result.stdout.match(/^# skipped (\d+)$/mu)?.[1] ?? 0) };
}

function runLocalTestFile(path) {
  const apiRoot = resolve(root, "apps/api");
  const name = `local-test:${path.slice(propertyApprovalRoot.length + 1)}`;
  const result = runLocalCommand(name, process.execPath,
    ["--require", "ts-node/register", path], apiRoot);
  if (result.tests < 1 || result.passed !== result.tests
    || result.failed !== 0 || result.skipped !== 0) {
    throw new Error(`local test did not expose a zero-skip inner TAP result: ${JSON.stringify(result)}`);
  }
  return result;
}

function assertZeroSkipTap(result, label) {
  if (result.tests < 1 || result.passed !== result.tests
    || result.failed !== 0 || result.skipped !== 0) {
    throw new Error(`${label} did not expose a zero-skip inner TAP result: ${JSON.stringify(result)}`);
  }
  return result;
}

function runLocalGates() {
  const localSpecs = propertyApprovalSpecs.filter((path) => !path.endsWith(".pg.spec.ts"));
  const results = [
    runLocalCommand("shared-build", "pnpm", ["--filter", "@jinhu/shared", "build"]),
    assertZeroSkipTap(runLocalCommand("shared-property-task-contract", process.execPath,
      [resolve(root, "packages/shared/test/track-b-property-task-contract.test.cjs")]),
    "shared-property-task-contract"),
    runLocalCommand("api-typecheck", "pnpm", ["--filter", "@jinhu/api", "typecheck"]),
    runLocalCommand("api-build", "pnpm", ["--filter", "@jinhu/api", "build"]),
    runLocalCommand("target-eslint", "pnpm", ["--filter", "@jinhu/api", "exec", "eslint",
      "src/modules/property-approvals/property-mutation-receipt.adapter.ts",
      "src/modules/property-approvals/property-mutation-receipt.adapter.spec.ts",
      "src/modules/property-approvals/property-mutation-receipt.pg.spec.ts",
      "src/modules/property-approvals/entities/property-approval.entities.ts",
      "src/modules/property-approvals/property-approval.legacy-receipt-contract.spec.ts",
      "src/modules/property-approvals/property-approval.module.ts",
      "src/modules/property-approvals/property-approval.module.spec.ts"]),
    runLocalCommand("runner-eslint", "pnpm", ["exec", "eslint",
      "scripts/e2e/property-remediation/track-b2a-c3-runtime-gate.mjs",
      "scripts/e2e/property-remediation/track-b2a-c3-runtime-lifecycle.mjs",
      "scripts/e2e/property-remediation/track-b2a-c3-runtime-gate.spec.mjs"]),
    assertZeroSkipTap(runLocalCommand("runner-static-lifecycle", process.execPath,
      [runnerStaticSpec]), "runner-static-lifecycle"),
    runLocalCommand("c3-diff-check", "git", ["diff", "--check", "--",
      "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.ts",
      "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.spec.ts",
      "apps/api/src/modules/property-approvals/property-mutation-receipt.pg.spec.ts",
      "apps/api/src/modules/property-approvals/entities/property-approval.entities.ts",
      "apps/api/src/modules/property-approvals/property-approval.legacy-receipt-contract.spec.ts",
      "apps/api/src/modules/property-approvals/property-approval.module.ts",
      "apps/api/src/modules/property-approvals/property-approval.module.spec.ts",
      "scripts/e2e/property-remediation/track-b2a-c3-runtime-gate.mjs",
      "scripts/e2e/property-remediation/track-b2a-c3-runtime-lifecycle.mjs",
      "scripts/e2e/property-remediation/track-b2a-c3-runtime-gate.spec.mjs"]),
    { name: "adapter-and-module-unit", files: [
      runLocalTestFile(resolve(propertyApprovalRoot, "property-mutation-receipt.adapter.spec.ts")),
      runLocalTestFile(resolve(propertyApprovalRoot, "property-approval.module.spec.ts"))
    ] },
    { name: "property-approvals-local-regression",
      files: localSpecs.map((path) => runLocalTestFile(path)) }
  ];
  const regression = results.at(-1).files;
  if (regression.length !== localSpecs.length) {
    throw new Error(`local regression cardinality drift: ${JSON.stringify({
      expected: localSpecs.length, observed: regression.length
    })}`);
  }
  return { status: "passed", pg_specs_excluded_for_dedicated_postgresql_execution: b1PgSpecs
      .concat(c3Spec).map((path) => path.slice(root.length + 1)),
    local_spec_count: localSpecs.length, results };
}

function historyEvidence() {
  const evidence = JSON.parse(query(`SELECT json_build_object('primary',(SELECT json_agg(row_to_json(x) ORDER BY filename)
      FROM (SELECT filename,checksum,status FROM sys_schema_migration_history) x),
    'standard',(SELECT json_agg(row_to_json(x) ORDER BY filename)
      FROM (SELECT filename,checksum,status FROM schema_migrations) x))::text;`));
  for (const name of migrationChain) {
    const checksum = sha256(readFileSync(resolve(migrationRoot, name)));
    for (const store of ["primary", "standard"]) {
      const matches = evidence[store].filter((row) => row.filename === name);
      if (matches.length !== 1 || matches[0].status !== "succeeded"
        || matches[0].checksum !== checksum) {
        throw new Error(`dual migration history drift: ${store}:${name}`);
      }
    }
  }
  return evidence;
}
function legacyEvidence() {
  return JSON.parse(query(`SELECT json_build_object('rows',count(*),'legacy_v1',count(*) FILTER (
      WHERE receipt_contract_version='legacy-v1'),'actions',count(DISTINCT action_id),
      'started',count(*) FILTER (WHERE receipt_status='started'),
      'completed',count(*) FILTER (WHERE receipt_status='completed'),
      'failed',count(*) FILTER (WHERE receipt_status='failed'),
      'extensions_null',count(*) FILTER (WHERE identity_kind IS NULL AND business_occurrence_key IS NULL
        AND task_key IS NULL AND identity_source_type IS NULL AND result_version IS NULL))::text
    FROM biz_property_mutation_receipt WHERE tenant_id='c3-runtime-legacy';`));
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

function assertUniqueRunId() {
  const inspected = [];
  for (const entry of readdirSync(researchRoot, { withFileTypes: true })) {
    if (!/^b2a-c3[-_][^.]+(?:\.json|\.manifest\.txt)$/u.test(entry.name)) continue;
    const path = resolve(researchRoot, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`C3 runId authority is not a regular file:${entry.name}`);
    }
    if (metadata.size > 8 * 1024 * 1024) {
      throw new Error(`C3 runId authority exceeds bounded size:${entry.name}`);
    }
    let observed = null;
    let attemptEvidence = false;
    try {
      const text = readFileSync(path, "utf8");
      if (entry.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && typeof parsed.run_id === "string") {
          observed = parsed.run_id;
        } else if (parsed?.status === "failed" && parsed?.candidate_admissible === false
          && typeof parsed?.attempt_id === "string" && typeof parsed?.attempted_run_id === "string") {
          attemptEvidence = true;
        }
      } else {
        observed = text.match(/^run_id\t([^\r\n]+)$/mu)?.[1] ?? null;
        attemptEvidence = !observed
          && /^status\tfailed$/mu.test(text)
          && /^candidate_admissible\tfalse$/mu.test(text)
          && /^attempt_id\t[^\r\n]+$/mu.test(text)
          && /^attempted_run_id\t[^\r\n]+$/mu.test(text);
      }
    } catch (error) {
      throw new Error(`C3 runId authority cannot be parsed:${entry.name}:${error.message}`);
    }
    if (!observed && !attemptEvidence) {
      throw new Error(`C3 runId authority has no run_id:${entry.name}`);
    }
    inspected.push({ path: entry.name, run_id: observed, attempt_evidence: attemptEvidence });
    if (observed === runId) {
      throw new Error(`duplicate C3 runId already recorded:${entry.name}:${runId}`);
    }
  }
  const reservationPath = resolve(researchRoot,
    `.b2a-c3-runtime-runid-${sha256(runId)}.reservation.json`);
  reservationEvidence = reserveRunId({ reservationPath, runId,
    artifact: artifactPath.slice(root.length + 1),
    manifest: artifactManifestPath.slice(root.length + 1), reservedAt: startedAt });
  reservationEvidence.path = reservationPath.slice(root.length + 1);
  return { status: "passed", inspected_file_count: inspected.length,
    reservation: reservationEvidence,
    bounded_regular_files_only: true, max_file_bytes: 8 * 1024 * 1024 };
}

function serializableError(error) {
  return { name: error?.name ?? "Error", message: error?.message ?? String(error),
    stack_sha256: error?.stack ? sha256(error.stack) : null };
}

let artifactWritten = false;
function writeOutcome(outcome) {
  if (artifactWritten) return null;
  const published = publishOutcome({ artifactPath, manifestPath: artifactManifestPath,
    artifactLabel: artifactPath.slice(root.length + 1), outcome });
  artifactWritten = true;
  return { artifact: artifactPath.slice(root.length + 1), raw_sha256: published.raw_sha256,
    detached_manifest: artifactManifestPath.slice(root.length + 1),
    detached_manifest_sha256: published.manifest_sha256 };
}

let primaryError = null;
let evidence = null;
let localGates = null;
let runIdPreflight = null;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => {
  primaryError = new Error(`interrupted:${signal}`);
  const cleaned = safeCleanup();
  const authority = outcomeAuthority({ reservation: reservationEvidence, runId, attemptId });
  const failed = { schema_version: "property-remediation-b2a-c3-runtime-gate-v1", ...authority,
    candidate_scope: "runtime-candidate-only-requires-separate-foundation-appmodule-v2-reattestation",
    status: "failed", candidate_admissible: false, started_at: startedAt,
    finished_at: new Date().toISOString(), error: serializableError(primaryError),
    input_freeze_before: inputFreeze, environment, local_gates: localGates,
    run_id_preflight: runIdPreflight, run_id_reservation: reservationEvidence, cleanup: cleaned };
  let written = null;
  try { written = writeOutcome(failed); } catch (error) { written = { error: error.message }; }
  process.stderr.write(`${JSON.stringify({ signal, cleanup: cleaned, written })}\n`);
  process.exit(128);
});
try {
  inputFreeze = captureInputs("before-create");
  runIdPreflight = assertUniqueRunId();
  localGates = runLocalGates();
  assertInputsFrozen("after-local-gates");
  startPostgres();
  bootstrap();
  const url = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${environment.host_port}/${databaseName}`;
  const specs = [runSpec(c3Spec, url), ...b1PgSpecs.map((path) => runSpec(path, url))];
  const legacy = legacyEvidence();
  if (legacy.rows !== 39 || legacy.legacy_v1 !== 39 || legacy.actions !== 13
    || legacy.started !== 13 || legacy.completed !== 13 || legacy.failed !== 13
    || legacy.extensions_null !== 39) throw new Error(`39-row legacy continuity failed: ${JSON.stringify(legacy)}`);
  evidence = {
    schema_version: "property-remediation-b2a-c3-runtime-gate-v1", run_id: runId,
    candidate_scope: "runtime-candidate-only-requires-separate-foundation-appmodule-v2-reattestation",
    status: "passed", candidate_admissible: true, started_at: startedAt,
    finished_at: new Date().toISOString(), environment,
    input_freeze_before: inputFreeze, input_freeze_after: assertInputsFrozen("after-tests"),
    manifest: { legacy_actions: 13, port_v2_actions: 8 },
    detached_manifest: artifactManifestPath.slice(root.length + 1),
    local_gates: localGates, run_id_preflight: runIdPreflight,
    run_id_reservation: reservationEvidence,
    migration_history: historyEvidence(), legacy_continuity: legacy, specs,
    host: { platform: platform(), release: release(), cpu_count: cpus().length,
      total_memory_bytes: totalmem(), free_memory_bytes: freemem() }
  };
} catch (error) {
  primaryError = error;
} finally {
  const cleaned = safeCleanup();
  if (evidence) evidence.cleanup = cleaned;
  if (cleaned.status !== "passed" && !primaryError) primaryError = new Error("cleanup failed");
}
if (primaryError) {
  let inputFreezeAfter = null;
  try { inputFreezeAfter = inputFreeze ? captureInputs("after-failure") : null; }
  catch (error) { inputFreezeAfter = { stage: "after-failure", error: serializableError(error) }; }
  const authority = outcomeAuthority({ reservation: reservationEvidence, runId, attemptId });
  const failed = { schema_version: "property-remediation-b2a-c3-runtime-gate-v1", ...authority,
    candidate_scope: "runtime-candidate-only-requires-separate-foundation-appmodule-v2-reattestation",
    status: "failed", candidate_admissible: false, started_at: startedAt,
    finished_at: new Date().toISOString(), error: serializableError(primaryError),
    input_freeze_before: inputFreeze, input_freeze_after: inputFreezeAfter,
    environment, local_gates: localGates, run_id_preflight: runIdPreflight,
    run_id_reservation: reservationEvidence,
    cleanup: cleanupEvidence };
  let publication;
  try { publication = { status: "written", ...writeOutcome(failed) }; }
  catch (error) { publication = { status: "failed", error: serializableError(error) }; }
  process.stderr.write(`${JSON.stringify({ status: "failed", ...authority,
    publication, error: failed.error, cleanup: failed.cleanup })}\n`);
  process.exitCode = 1;
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
