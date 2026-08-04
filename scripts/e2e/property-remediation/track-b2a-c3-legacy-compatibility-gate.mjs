/* global process */
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, realpathSync
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
const seedRoot = resolve(root, "database/seeds");
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research");
const foundationResearchRoot = resolve(root,
  ".trellis/tasks/07-30-pr192-b-identity-control-plane/research");
const remediationResearchRoot = resolve(root,
  ".trellis/tasks/07-30-pr192-property-productization-remediation/research");
const goldenPath = resolve(researchRoot, "b2a-c3-0-formal-candidate-20260801f.json");
const GOLDEN_RAW_SHA256 = "5dfd0e69ae6f5974d6c3f80ebd8160abbab066da4907a3d33aed24824d1281ba";
const GOLDEN_ROWS_SHA256 = "3c2bd8a18ac4236a8db1e4eff583e9daec8c8aa4fac56e21011dee69ee5bd9ff";
const runId = validateRunId(process.env.PROPERTY_B2A_C3_LEGACY_COMPAT_RUN_ID
  ?? `b2ac3compat_${randomBytes(9).toString("hex")}`);
const attemptId = `attempt_${randomBytes(12).toString("hex")}`;
const artifactPath = resolve(root,
  process.env.PROPERTY_B2A_C3_LEGACY_COMPAT_ARTIFACT_PATH ?? "");
const manifestPath = artifactPath.endsWith(".json")
  ? `${artifactPath.slice(0, -5)}.manifest.txt` : `${artifactPath}.manifest.txt`;
const startedAt = new Date().toISOString();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

if (!process.env.PROPERTY_B2A_C3_LEGACY_COMPAT_ARTIFACT_PATH) {
  throw new Error("PROPERTY_B2A_C3_LEGACY_COMPAT_ARTIFACT_PATH is required");
}
if (dirname(artifactPath) !== researchRoot || dirname(manifestPath) !== researchRoot
  || !/^b2a-c3-legacy-compatibility-[a-z0-9_-]+\.json$/u.test(
    artifactPath.slice(researchRoot.length + 1))
  || existsSync(artifactPath) || existsSync(manifestPath)
  || lstatSync(researchRoot).isSymbolicLink()
  || realpathSync(researchRoot) !== researchRoot) {
  throw new Error("C3 compatibility evidence must be a new direct research .json child");
}

// STATIC_TRAVERSAL_BEGIN
function recursiveFiles(directory, predicate = () => true) {
  const walkDirectory = (current) => {
    const directoryMetadata = lstatSync(current);
    if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
      throw new Error(`signed input tree root/branch is not a real directory:${current}`);
    }
    const files = [];
    for (const name of readdirSync(current).sort()) {
      const path = resolve(current, name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) {
        throw new Error(`signed input tree contains symlink:${path}`);
      }
      if (metadata.isDirectory()) files.push(...walkDirectory(path));
      else if (metadata.isFile()) {
        if (predicate(path)) files.push(path);
      } else {
        throw new Error(`signed input tree contains special file:${path}`);
      }
    }
    return files;
  };
  return walkDirectory(directory);
}
// STATIC_TRAVERSAL_END

const pre195Migrations = [
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000190_property_b_migration_compatibility_control.sql",
  "000193_property_b_runtime_integrity_forward_fix.sql",
  "000194_property_task_projection_contract_correction.sql"
];
const migration195 = "000195_property_mutation_receipt_contract_v2.sql";
const seed = resolve(seedRoot, "000001_s1_production_core.sql");
const c3Spec = resolve(root,
  "apps/api/src/modules/property-approvals/property-mutation-receipt.pg.spec.ts");
const staticSpec = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c3-legacy-compatibility-gate.spec.mjs");
const lifecycleHelper = resolve(root,
  "scripts/e2e/property-remediation/track-b2a-c3-runtime-lifecycle.mjs");
const ephemeralHelper = resolve(root,
  "scripts/e2e/property-remediation/bootstrap/ephemeral-postgres.mjs");
const approvalRoot = resolve(root, "apps/api/src/modules/property-approvals");

function buildSignedInputs() {
  // Rebuild every tree on every freeze; no module-initialization file list is authoritative.
  const paths = [
    resolve(researchRoot, "b2a-c1-5-final-gate.md"),
    resolve(researchRoot, "b2a-c1-5-implementation-handoff.md"),
    resolve(researchRoot, "b2a-c3-0-receipt-contract-correction-plan.md"),
    resolve(researchRoot, "b2a-c3-0-000195-final-gate-signoff.md"),
    ...["json", "catalog.json", "functions.json", "security.json", "manifest.txt"].map((suffix) =>
      resolve(researchRoot, `b2a-c3-0-formal-candidate-20260801f.${suffix}`)),
    resolve(researchRoot, "legacy-action-authority-v1.txt"),
    resolve(researchRoot, "port-v2-action-identity-mode-v1.txt"),
    resolve(researchRoot, "b1-approval-runtime-final-gate.md"),
    resolve(researchRoot, "b-approval-runtime-v2.txt"),
    resolve(researchRoot, "b2a-c3-final-gate-signoff.md"),
    resolve(researchRoot, "b2a-c3-runtime-formal-candidate-20260801d.json"),
    resolve(researchRoot, "b2a-c3-runtime-formal-candidate-20260801d.manifest.txt"),
    resolve(researchRoot, "appmodule-contract-v2-reattestation.txt"),
    resolve(foundationResearchRoot, "b-property-foundation-contract-v2-attestation.txt"),
    resolve(researchRoot, "b-property-foundation-runtime-v2.txt"),
    ...["b0-contract-freeze-current.md", "b0-runtime-contract-freeze.md",
      "b0-product-access-freeze.md", "b0-identity-control-freeze.md",
      "b0-schema-physical-addendum.md"].map((name) => resolve(remediationResearchRoot, name)),
    ...recursiveFiles(resolve(root, "apps/api/src"), (path) => path.endsWith(".ts")),
    ...recursiveFiles(resolve(root, "packages/shared/src"), (path) => path.endsWith(".ts")),
    ...recursiveFiles(resolve(root, "packages/shared/test")),
    ...recursiveFiles(migrationRoot, (path) => path.endsWith(".sql")),
    ...recursiveFiles(seedRoot),
    ...recursiveFiles(resolve(root, "packages/config")),
    ...["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json",
      "eslint.config.mjs"].map((name) => resolve(root, name)),
    ...["package.json", "nest-cli.json", "tsconfig.json"].map((name) =>
      resolve(root, "apps/api", name)),
    ...["package.json", "tsconfig.json"].map((name) => resolve(root, "packages/shared", name)),
    ephemeralHelper, lifecycleHelper, staticSpec, fileURLToPath(import.meta.url)
  ];
  return [...new Set(paths)].sort().map((path) => {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`deduplicated signed input is not a regular non-symlink file:${path}`);
    }
    return path;
  });
}

function loadGoldenRows() {
  const metadata = lstatSync(goldenPath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("C3 legacy golden is not a regular non-symlink file");
  }
  const bytes = readFileSync(goldenPath);
  if (sha256(bytes) !== GOLDEN_RAW_SHA256) throw new Error("C3 legacy golden raw SHA drift");
  const document = JSON.parse(bytes.toString("utf8"));
  const rows = document?.legacy_compatibility?.before?.hook?.rows;
  if (!Array.isArray(rows)) throw new Error("C3 legacy golden rows path is absent");
  if (sha256(`${JSON.stringify(rows)}\n`) !== GOLDEN_ROWS_SHA256) {
    throw new Error("C3 legacy golden canonical rows SHA drift");
  }
  return rows;
}
const goldenRows = loadGoldenRows();

function captureInputs(stage) {
  const files = buildSignedInputs().map((path) => {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`signed input is not a regular non-symlink file:${path}`);
    }
    const bytes = readFileSync(path);
    return { path: path.slice(root.length + 1), bytes: bytes.length, raw_sha256: sha256(bytes) };
  });
  const grammar = `property-remediation-b2a-c3-legacy-compatibility-input-freeze-v1\n${files
    .map((file) => `${file.path}\t${file.bytes}\t${file.raw_sha256}\n`).join("")}`;
  return { stage, files, grammar, raw_sha256: sha256(grammar) };
}
let inputFreeze = null;
const inputFreezes = [];
// STATIC_FREEZE_ASSERT_BEGIN
function assertFreezeMatch(expected, observed, stage) {
  if (observed.raw_sha256 !== expected.raw_sha256) {
    throw new Error(`C3 legacy compatibility signed input drift:${stage}`);
  }
}
// STATIC_FREEZE_ASSERT_END
function assertInputsFrozen(stage) {
  const observed = captureInputs(stage);
  assertFreezeMatch(inputFreeze, observed, stage);
  inputFreezes.push(observed);
  return observed;
}

// STATIC_FROZEN_READ_BEGIN
function readExactFrozenFile(path, expectedRawSha256, label, hooks = {}) {
  const identity = (metadata) => [metadata.dev, metadata.ino, metadata.size,
    metadata.mtimeNs, metadata.ctimeNs].join(":");
  const metadata = lstatSync(path, { bigint: true });
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`frozen runtime ${label} is not a regular non-symlink file:${path}`);
  }
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error(`frozen runtime ${label} requires O_NOFOLLOW:${path}`);
  }
  hooks.afterPrecheck?.(path);
  let descriptor = null;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const beforeRead = fstatSync(descriptor, { bigint: true });
    if (!beforeRead.isFile() || identity(beforeRead) !== identity(metadata)) {
      throw new Error(`frozen runtime ${label} identity changed before read:${path}`);
    }
    hooks.afterOpen?.(descriptor, path);
    const bytes = readFileSync(descriptor);
    hooks.afterRead?.(descriptor, path);
    const afterRead = fstatSync(descriptor, { bigint: true });
    const pathAfterRead = lstatSync(path, { bigint: true });
    if (!afterRead.isFile() || identity(afterRead) !== identity(beforeRead)
      || BigInt(bytes.length) !== afterRead.size || pathAfterRead.isSymbolicLink()
      || !pathAfterRead.isFile() || identity(pathAfterRead) !== identity(afterRead)) {
      throw new Error(`frozen runtime ${label} identity changed while reading:${path}`);
    }
    const observedRawSha256 = sha256(bytes);
    if (observedRawSha256 !== expectedRawSha256) {
      throw new Error(`frozen runtime ${label} SHA drift:${path}`);
    }
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}
// STATIC_FROZEN_READ_END

function readFrozenRuntimeFile(path, label) {
  if (!inputFreeze) throw new Error(`runtime file read before input freeze:${label}`);
  const relativePath = path.slice(root.length + 1);
  const frozen = inputFreeze.files.find((file) => file.path === relativePath);
  if (!frozen) throw new Error(`runtime ${label} is absent from frozen closure:${path}`);
  return readExactFrozenFile(path, frozen.raw_sha256, label);
}

function frozenPathsMatching(predicate) {
  if (!inputFreeze) throw new Error("frozen paths requested before input freeze");
  return inputFreeze.files.map((file) => resolve(root, file.path)).filter(predicate).sort();
}

function assertRuntimeFilesMatchFreeze(paths, label, expectedPaths = paths) {
  if (!inputFreeze) throw new Error(`runtime file list requested before input freeze:${label}`);
  const frozen = new Map(inputFreeze.files.map((file) =>
    [resolve(root, file.path), file.raw_sha256]));
  const checked = [...new Set(paths)].sort();
  const expected = [...new Set(expectedPaths)].sort();
  if (JSON.stringify(checked) !== JSON.stringify(expected)) {
    throw new Error(`runtime ${label} file set differs from frozen closure`);
  }
  for (const path of checked) {
    const expectedRawSha256 = frozen.get(path);
    if (!expectedRawSha256) throw new Error(`runtime ${label} list differs from frozen closure:${path}`);
    readExactFrozenFile(path, expectedRawSha256, label);
  }
  return checked;
}

function currentBaselineMigrations() {
  const predicate = (path) => {
    const number = Number(path.slice(migrationRoot.length + 1).match(/^(\d{6})_/u)?.[1]);
    return Number.isInteger(number) && number <= 182 && number !== 175;
  };
  const paths = recursiveFiles(migrationRoot, (path) => path.endsWith(".sql")).filter(predicate);
  return assertRuntimeFilesMatchFreeze(paths, "baseline-migrations",
    frozenPathsMatching((path) => path.startsWith(`${migrationRoot}/`) && path.endsWith(".sql")
      && predicate(path)));
}

function currentLocalRegressionSpecs() {
  const paths = [
    ...recursiveFiles(approvalRoot, (path) => path.endsWith(".spec.ts")),
    ...["property-identity", "property-operations"].flatMap((module) =>
      recursiveFiles(resolve(root, "apps/api/src/modules", module),
        (path) => path.endsWith(".spec.ts")))
  ].filter((path) => !path.endsWith(".pg.spec.ts"));
  const moduleRoots = [approvalRoot, resolve(root, "apps/api/src/modules/property-identity"),
    resolve(root, "apps/api/src/modules/property-operations")];
  return assertRuntimeFilesMatchFreeze(paths, "c3-b1-foundation-local-specs",
    frozenPathsMatching((path) => moduleRoots.some((moduleRoot) => path.startsWith(`${moduleRoot}/`))
      && path.endsWith(".spec.ts") && !path.endsWith(".pg.spec.ts")));
}

function currentApprovalPgSpecs() {
  return assertRuntimeFilesMatchFreeze(
    recursiveFiles(approvalRoot, (path) => path.endsWith(".pg.spec.ts")),
    "c3-b1-postgresql-specs",
    frozenPathsMatching((path) => path.startsWith(`${approvalRoot}/`)
      && path.endsWith(".pg.spec.ts"))
  );
}

const containerName = `pr192_b2a_c3_compat_${runId}_db`;
const databaseName = "pr192_b2a_c3_compat_gate";
const postgresUser = "pr192_b2a_c3_compat";
const postgresPassword = `${runId}_local_only`;
const fixtureLabel = "pr192-b2a-c3-legacy-compatibility-gate";
const docker = (args, options = {}) => runDocker(args, { cwd: root, ...options });
let containerId = null;
let volumeName = null;
let creationAttempted = false;
let environment = null;
let cleanupEvidence = null;
let reservationEvidence = null;
let currentStage = "initialization";
let originalFailureStage = null;

function inspect(type, target) {
  const result = docker(type === "volume" ? ["volume", "inspect", target]
    : ["inspect", "--type", type, target], { allowFailure: true });
  if (result.status !== 0) {
    if (/no such (object|container|volume)/iu.test(`${result.stdout}\n${result.stderr}`)) return null;
    throw new Error(`docker ${type} inspect failed:${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout)[0] ?? null;
}

function startPostgres() {
  if (inspect("container", containerName)) throw new Error(`fixture already exists:${containerName}`);
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
  environment = { image_reference: OFFICIAL_POSTGRES_IMAGE, image_digest: inspected.Image,
    container_id: containerId, container_name: containerName,
    anonymous_volume_name: volumeName, host_port: exact.hostPort };
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
function applyMigration(pathOrName) {
  const path = pathOrName.startsWith?.("/") ? pathOrName : resolve(migrationRoot, pathOrName);
  const bytes = readFrozenRuntimeFile(path, `migration-execution:${path.slice(root.length + 1)}`);
  return psql(bytes.toString("utf8"));
}

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
  const migrationPath = resolve(migrationRoot, name);
  const checksum = sha256(readFrozenRuntimeFile(migrationPath,
    `migration-history:${migrationPath.slice(root.length + 1)}`));
  for (const table of ["sys_schema_migration_history", "schema_migrations"]) {
    psql(`INSERT INTO public.${table}
      (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
      VALUES (${sqlLiteral(name)},${sqlLiteral(checksum)},'succeeded',clock_timestamp(),
        clock_timestamp(),NULL,'b2a-c3-legacy-compatibility-gate',${sqlLiteral(runId.slice(0, 32))});`);
  }
}

const legacyActions = [
  "property.approval.submit", "property.approval.withdraw", "property.approval.decide",
  "property.approval.incident-retry", "property.event.replay", "property.notification.mark-read",
  "party.identity.create-draft", "party.identity.update-draft", "party.identity.submit",
  "party.identity.claim", "party.identity.reassign", "party.identity.verify", "party.identity.withdraw"
];
function seedExactOldSchemaFixture() {
  const values = legacyActions.map((action, index) => `(${index + 1},${sqlLiteral(action)})`).join(",");
  psql(`DO $fixture$ DECLARE r record; v_id uuid; BEGIN
    FOR r IN SELECT * FROM (VALUES ${values}) action(ordinal,action_id) LOOP
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES ('c3-pre195-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('41000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'started-'||r.ordinal,repeat('a',64));
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES ('c3-pre195-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('42000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'completed-'||r.ordinal,repeat('b',64))
      RETURNING id INTO v_id;
      UPDATE biz_property_mutation_receipt SET receipt_status='completed',
        result_ref='pre195/completed/'||r.ordinal,result_hash=repeat('c',64),completed_at=clock_timestamp()
        WHERE id=v_id;
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,
        request_hash,receipt_status,result_ref,result_hash)
      VALUES ('c3-pre195-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('43000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'failed-'||r.ordinal,
        repeat('d',64),'failed','pre195/failed/'||r.ordinal,repeat('e',64));
    END LOOP; END $fixture$;`);
}

function seedExistingC3RegressionFixture() {
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
      UPDATE biz_property_mutation_receipt SET receipt_status='completed',
        result_ref='legacy/result/'||r.ordinal,result_hash=repeat('c',64),completed_at=clock_timestamp()
        WHERE id=v_id;
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,
        request_hash,receipt_status,result_ref,result_hash)
      VALUES ('c3-runtime-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('53000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'failed-'||r.ordinal,
        repeat('d',64),'failed','legacy/failed/'||r.ordinal,repeat('e',64));
    END LOOP; END $fixture$;`);
}

function bootstrapPre195() {
  for (const path of currentBaselineMigrations()) applyMigration(path);
  const seedBytes = readFrozenRuntimeFile(seed, `seed-execution:${seed.slice(root.length + 1)}`);
  psql(seedBytes.toString("utf8"));
  applyMigration("000183_property_business_granular_rbac.sql");
  applyMigration("000184_property_workbench_read_permissions.sql");
  psql(`INSERT INTO asset_park(tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark)
    VALUES ('10000001','20000001','B2A_C3_COMPAT','B2a C3 compatibility park','enabled',false,1,
      'C3 legacy compatibility gate');`);
  ensureHistory();
  assertRuntimeFilesMatchFreeze(pre195Migrations.map((name) => resolve(migrationRoot, name)),
    "pre-195-migration-chain");
  for (const name of pre195Migrations) { applyMigration(name); recordHistory(name); }
  seedExactOldSchemaFixture();
  seedExistingC3RegressionFixture();
}

function observeLegacyRows() {
  const rows = JSON.parse(query(`SELECT coalesce(json_agg(json_build_object(
    'actionId',action_id,'receiptStatus',receipt_status,'requestHash',request_hash::text,
    'resultRef',result_ref,'resultHash',result_hash::text)
    ORDER BY action_id COLLATE "C",receipt_status COLLATE "C"),'[]'::json)::text
    FROM biz_property_mutation_receipt WHERE tenant_id='c3-pre195-legacy';`));
  return rows.map((row) => ({ actionId: row.actionId, receiptStatus: row.receiptStatus,
    requestHash: row.requestHash, resultRef: row.resultRef ?? null,
    resultHash: row.resultHash ?? null }));
}

const legacyFields = ["requestHash", "resultHash", "resultRef"];
function buildCompatibilityEvidence(pre195, postMigrationPrePort, postPort) {
  const stages = { pre195, post_migration_pre_port: postMigrationPrePort, post_port: postPort };
  for (const [stage, rows] of Object.entries(stages)) {
    if (rows.length !== 39 || sha256(`${JSON.stringify(rows)}\n`) !== GOLDEN_ROWS_SHA256) {
      throw new Error(`legacy compatibility row-set mismatch:${stage}`);
    }
  }
  const keys = goldenRows.map((row) => `${row.actionId}\t${row.receiptStatus}`);
  if (new Set(keys).size !== 39 || new Set(goldenRows.map((row) => row.actionId)).size !== 13
    || !goldenRows.every((row) => ["started", "completed", "failed"].includes(row.receiptStatus))) {
    throw new Error("legacy golden is not the exact sorted 13 action x 3 status matrix");
  }
  const comparisons = [];
  for (const [index, expected] of goldenRows.entries()) {
    for (const field of legacyFields) {
      const comparison = { action_id: expected.actionId, receipt_status: expected.receiptStatus,
        field, expected: expected[field], pre195: pre195[index]?.[field],
        post_migration_pre_port: postMigrationPrePort[index]?.[field],
        post_port: postPort[index]?.[field] };
      comparison.exact = comparison.pre195 === comparison.expected
        && comparison.post_migration_pre_port === comparison.expected
        && comparison.post_port === comparison.expected;
      comparisons.push(comparison);
    }
  }
  if (comparisons.length !== 117 || comparisons.some((entry) => !entry.exact)) {
    throw new Error(`legacy field compatibility mismatch:${JSON.stringify(
      comparisons.filter((entry) => !entry.exact))}`);
  }
  return { status: "passed", golden: { path: goldenPath.slice(root.length + 1),
    raw_sha256: GOLDEN_RAW_SHA256, rows_sha256: GOLDEN_ROWS_SHA256 },
    row_count: 39, action_count: 13, status_count: 3, field_comparison_count: 117,
    comparisons };
}

function runCommand(name, command, args, cwd = root, timeout = 300_000, environmentOverride = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout,
    maxBuffer: 40 * 1024 * 1024, env: { ...process.env, ...environmentOverride } });
  if (result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM") {
    throw new Error(`timeout:${name}`);
  }
  if (result.status !== 0 || /# fail [1-9]/u.test(result.stdout)) {
    throw new Error(`C3 compatibility command failed:${name}\n${result.stdout}\n${result.stderr}`);
  }
  return { name, command: [command, ...args], cwd: cwd.slice(root.length + 1) || ".",
    timeout_ms: timeout, exit_status: result.status,
    stdout_sha256: sha256(result.stdout), stderr_sha256: sha256(result.stderr),
    tests: Number(result.stdout.match(/^# tests (\d+)$/mu)?.[1] ?? 0),
    passed: Number(result.stdout.match(/^# pass (\d+)$/mu)?.[1] ?? 0),
    failed: Number(result.stdout.match(/^# fail (\d+)$/mu)?.[1] ?? 0),
    skipped: Number(result.stdout.match(/^# skipped (\d+)$/mu)?.[1] ?? 0) };
}
function requireZeroSkipTap(result, label) {
  if (result.tests < 1 || result.passed !== result.tests || result.failed !== 0 || result.skipped !== 0) {
    throw new Error(`${label} did not expose a zero-skip TAP result`);
  }
  return result;
}
function runLocalTest(path) {
  return requireZeroSkipTap(runCommand(`local:${path.slice(root.length + 1)}`, process.execPath,
    ["--require", "ts-node/register", path], resolve(root, "apps/api")), path);
}
function runLocalGates() {
  const localSpecs = currentLocalRegressionSpecs();
  return { status: "passed", c3_b1_foundation_local_spec_count: localSpecs.length, results: [
    runCommand("shared-build", "pnpm", ["--filter", "@jinhu/shared", "build"]),
    requireZeroSkipTap(runCommand("shared-property-task-contract", process.execPath,
      [resolve(root, "packages/shared/test/track-b-property-task-contract.test.cjs")]),
    "shared-property-task-contract"),
    runCommand("api-typecheck", "pnpm", ["--filter", "@jinhu/api", "typecheck"]),
    runCommand("api-build", "pnpm", ["--filter", "@jinhu/api", "build"]),
    runCommand("target-eslint", "pnpm", ["--filter", "@jinhu/api", "exec", "eslint",
      "src/modules/property-approvals", "src/modules/property-identity",
      "src/modules/property-operations"]),
    runCommand("runner-eslint", "pnpm", ["exec", "eslint",
      "scripts/e2e/property-remediation/track-b2a-c3-legacy-compatibility-gate.mjs",
      "scripts/e2e/property-remediation/track-b2a-c3-legacy-compatibility-gate.spec.mjs"]),
    requireZeroSkipTap(runCommand("runner-static", process.execPath, [staticSpec]), "runner-static"),
    runCommand("diff-check", "git", ["diff", "--check", "--",
      "scripts/e2e/property-remediation/track-b2a-c3-legacy-compatibility-gate.mjs",
      "scripts/e2e/property-remediation/track-b2a-c3-legacy-compatibility-gate.spec.mjs"]),
    { name: "c3-b1-foundation-local-regression", files: localSpecs.map(runLocalTest) }
  ] };
}
function runPgSpec(path, url) {
  const result = runCommand(`pg:${path.slice(root.length + 1)}`, process.execPath,
    ["--require", "ts-node/register", path], resolve(root, "apps/api"), 240_000,
    { PROPERTY_RUNTIME_PG_URL: url, PROPERTY_MUTATION_RECEIPT_PG_URL: url });
  return { ...requireZeroSkipTap(result, path), path: path.slice(root.length + 1),
    raw_sha256: sha256(readFileSync(path)) };
}

function historyEvidence() {
  const names = [...pre195Migrations, migration195];
  const evidence = JSON.parse(query(`SELECT json_build_object(
    'primary',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM sys_schema_migration_history) x),
    'standard',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM schema_migrations) x))::text;`));
  for (const name of names) for (const store of ["primary", "standard"]) {
    const migrationPath = resolve(migrationRoot, name);
    const expected = sha256(readFrozenRuntimeFile(migrationPath,
      `migration-history-evidence:${migrationPath.slice(root.length + 1)}`));
    const matches = evidence[store].filter((row) => row.filename === name);
    if (matches.length !== 1 || matches[0].checksum !== expected || matches[0].status !== "succeeded") {
      throw new Error(`dual migration history drift:${store}:${name}`);
    }
  }
  return evidence;
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
  try { return cleanup(); } catch (error) {
    return { status: "failed", attempted: creationAttempted, container_absent: false,
      anonymous_volume_absent: false, errors: [`cleanup threw:${error.message}`], exact_targets: [
        { type: "container", id: containerId, name: containerName, absent: false },
        { type: "anonymous-volume", id: volumeName, name: volumeName, absent: false }
      ] };
  }
}

function assertUniqueRunId() {
  const inspected = [];
  for (const entry of readdirSync(researchRoot, { withFileTypes: true })) {
    if (!/^b2a-c3-legacy-compatibility-[^.]+(?:\.json|\.manifest\.txt)$/u.test(entry.name)) continue;
    const path = resolve(researchRoot, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`compatibility runId authority is not a regular file:${entry.name}`);
    }
    if (metadata.size > 8 * 1024 * 1024) throw new Error(`runId authority too large:${entry.name}`);
    const text = readFileSync(path, "utf8");
    let observed = null;
    let attemptEvidence = false;
    if (entry.name.endsWith(".json")) {
      const parsed = JSON.parse(text);
      observed = typeof parsed?.run_id === "string" ? parsed.run_id : null;
      attemptEvidence = !observed && parsed?.status === "failed"
        && parsed?.candidate_admissible === false && typeof parsed?.attempt_id === "string"
        && typeof parsed?.attempted_run_id === "string";
    } else {
      observed = text.match(/^run_id\t([^\r\n]+)$/mu)?.[1] ?? null;
      attemptEvidence = !observed && /^status\tfailed$/mu.test(text)
        && /^candidate_admissible\tfalse$/mu.test(text)
        && /^attempt_id\t[^\r\n]+$/mu.test(text) && /^attempted_run_id\t[^\r\n]+$/mu.test(text);
    }
    if (!observed && !attemptEvidence) throw new Error(`runId authority is malformed:${entry.name}`);
    if (observed === runId) throw new Error(`duplicate compatibility runId:${entry.name}:${runId}`);
    inspected.push({ path: entry.name, run_id: observed, attempt_evidence: attemptEvidence });
  }
  const reservationPath = resolve(researchRoot,
    `.b2a-c3-legacy-compatibility-runid-${sha256(runId)}.reservation.json`);
  reservationEvidence = reserveRunId({ reservationPath, runId,
    artifact: artifactPath.slice(root.length + 1), manifest: manifestPath.slice(root.length + 1),
    reservedAt: startedAt });
  reservationEvidence.path = reservationPath.slice(root.length + 1);
  return { status: "passed", inspected_file_count: inspected.length,
    bounded_regular_files_only: true, reservation: reservationEvidence };
}

function serializableError(error) {
  return { name: error?.name ?? "Error", message: error?.message ?? String(error),
    stack_sha256: error?.stack ? sha256(error.stack) : null };
}
let artifactWritten = false;
function writeOutcome(outcome) {
  if (artifactWritten) return null;
  const published = publishOutcome({ artifactPath, manifestPath,
    artifactLabel: artifactPath.slice(root.length + 1), outcome });
  artifactWritten = true;
  return { artifact: artifactPath.slice(root.length + 1), raw_sha256: published.raw_sha256,
    detached_manifest: manifestPath.slice(root.length + 1),
    detached_manifest_sha256: published.manifest_sha256 };
}
function preserveOriginalFailure(error, stage = currentStage) {
  if (originalFailureStage === null) originalFailureStage = stage;
  return error;
}

let primaryError = null;
let evidence = null;
let localGates = null;
let runIdPreflight = null;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => {
  primaryError ??= preserveOriginalFailure(new Error(`interrupted:${signal}`), `signal:${signal}`);
  const cleaned = safeCleanup();
  let freezeAfterCleanup = null;
  try { freezeAfterCleanup = inputFreeze ? assertInputsFrozen("after-cleanup") : null; }
  catch (error) { primaryError ??= preserveOriginalFailure(error, "input-freeze:after-cleanup"); }
  const authority = outcomeAuthority({ reservation: reservationEvidence, runId, attemptId });
  const failed = { schema_version: "property-remediation-b2a-c3-legacy-compatibility-gate-v1",
    ...authority, status: "failed", candidate_admissible: false, started_at: startedAt,
    finished_at: new Date().toISOString(), error: serializableError(primaryError),
    original_failure_stage: originalFailureStage, input_freeze_before: inputFreeze,
    input_freezes: inputFreezes, input_freeze_after_cleanup: freezeAfterCleanup,
    environment, local_gates: localGates, run_id_preflight: runIdPreflight,
    run_id_reservation: reservationEvidence, cleanup: cleaned };
  let written = null;
  try { written = writeOutcome(failed); } catch (error) { written = { error: error.message }; }
  process.stderr.write(`${JSON.stringify({ status: "failed", signal, written, cleanup: cleaned })}\n`);
  process.exit(128);
});

try {
  currentStage = "input-freeze:before-create";
  inputFreeze = captureInputs("before-create");
  inputFreezes.push(inputFreeze);
  currentStage = "run-id-preflight";
  runIdPreflight = assertUniqueRunId();
  currentStage = "local-gates";
  localGates = runLocalGates();
  currentStage = "input-freeze:after-local";
  assertInputsFrozen("after-local");
  currentStage = "postgres-create";
  startPostgres();
  currentStage = "bootstrap-pre-195";
  bootstrapPre195();
  const pre195 = observeLegacyRows();
  currentStage = "apply-000195";
  assertRuntimeFilesMatchFreeze([resolve(migrationRoot, migration195)], "000195-migration");
  applyMigration(migration195);
  recordHistory(migration195);
  const postMigrationPrePort = observeLegacyRows();
  const url = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${environment.host_port}/${databaseName}`;
  currentStage = "current-c3-adapter";
  const pgSpecsBeforePort = currentApprovalPgSpecs();
  if (!pgSpecsBeforePort.includes(c3Spec)) throw new Error("current C3 adapter PG spec is absent");
  const specs = [runPgSpec(c3Spec, url)];
  const postPort = observeLegacyRows();
  currentStage = "b1-foundation-pg-regression";
  const pgSpecsAfterPort = currentApprovalPgSpecs();
  if (JSON.stringify(pgSpecsAfterPort) !== JSON.stringify(pgSpecsBeforePort)) {
    throw new Error("approval PostgreSQL regression list drifted across port execution");
  }
  specs.push(...pgSpecsAfterPort.filter((path) => path !== c3Spec)
    .map((path) => runPgSpec(path, url)));
  currentStage = "input-freeze:after-pg-tests";
  assertInputsFrozen("after-pg-tests");
  currentStage = "compatibility-matrix";
  const compatibility = buildCompatibilityEvidence(pre195, postMigrationPrePort, postPort);
  evidence = { schema_version: "property-remediation-b2a-c3-legacy-compatibility-gate-v1",
    run_id: runId, status: "passed", candidate_admissible: true, started_at: startedAt,
    finished_at: new Date().toISOString(), environment, input_freeze_before: inputFreeze,
    input_freezes: inputFreezes, local_gates: localGates, run_id_preflight: runIdPreflight,
    run_id_reservation: reservationEvidence, migration_history: historyEvidence(),
    compatibility, specs, timeout_contract: { command_timeout_ms: 300000,
      pg_spec_timeout_ms: 240000, postgres_readiness_attempts: 180 },
    host: { platform: platform(), release: release(), cpu_count: cpus().length,
      total_memory_bytes: totalmem(), free_memory_bytes: freemem() } };
} catch (error) {
  primaryError = preserveOriginalFailure(error);
} finally {
  currentStage = "cleanup";
  const cleaned = safeCleanup();
  if (evidence) evidence.cleanup = cleaned;
  if (cleaned.status !== "passed" && !primaryError) {
    primaryError = preserveOriginalFailure(new Error("cleanup failed"), "cleanup");
    evidence = null;
  }
  try {
    if (inputFreeze) {
      const afterCleanup = assertInputsFrozen("after-cleanup");
      if (evidence) evidence.input_freeze_after_cleanup = afterCleanup;
    }
  } catch (error) {
    primaryError ??= preserveOriginalFailure(error, "input-freeze:after-cleanup");
    evidence = null;
  }
}

if (primaryError) {
  const authority = outcomeAuthority({ reservation: reservationEvidence, runId, attemptId });
  const failed = { schema_version: "property-remediation-b2a-c3-legacy-compatibility-gate-v1",
    ...authority, status: "failed", candidate_admissible: false, started_at: startedAt,
    finished_at: new Date().toISOString(), error: serializableError(primaryError),
    original_failure_stage: originalFailureStage, input_freeze_before: inputFreeze,
    input_freezes: inputFreezes, environment, local_gates: localGates,
    run_id_preflight: runIdPreflight, run_id_reservation: reservationEvidence,
    cleanup: cleanupEvidence };
  let publication;
  try { publication = { status: "written", ...writeOutcome(failed) }; }
  catch (error) { publication = { status: "failed", error: serializableError(error) }; }
  process.stderr.write(`${JSON.stringify({ status: "failed", ...authority, publication,
    original_failure_stage: originalFailureStage, error: failed.error, cleanup: failed.cleanup })}\n`);
  process.exitCode = 1;
} else {
  try {
    const written = writeOutcome(evidence);
    process.stdout.write(`${JSON.stringify({ status: "passed", run_id: runId,
      ...written, comparisons: evidence.compatibility.field_comparison_count,
      cleanup: evidence.cleanup })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "failed", candidate_admissible: false,
      run_id: runId, publication: { status: "failed", error: serializableError(error) },
      cleanup: evidence.cleanup })}\n`);
    process.exitCode = 1;
  }
}
