/* global process */
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { cpus, freemem, platform, release, tmpdir, totalmem } from "node:os";
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = resolve(root, "database/migrations");
const seed = resolve(root, "database/seeds/000001_s1_production_core.sql");
const testFile = resolve(
  root,
  "scripts/e2e/property-remediation/tests/b2a-c3-0-receipt-contract-v2.spec.mjs"
);
const legacyManifest = resolve(
  root,
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/legacy-action-authority-v1.txt"
);
const portV2Manifest = resolve(
  root,
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/port-v2-action-identity-mode-v1.txt"
);
const migration195 = "000195_property_mutation_receipt_contract_v2.sql";
const chain = [
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000190_property_b_migration_compatibility_control.sql",
  "000193_property_b_runtime_integrity_forward_fix.sql",
  "000194_property_task_projection_contract_correction.sql",
  migration195
];
const legacyActions = [
  "property.approval.submit", "property.approval.withdraw", "property.approval.decide",
  "property.approval.incident-retry", "property.event.replay", "property.notification.mark-read",
  "party.identity.create-draft", "party.identity.update-draft", "party.identity.submit",
  "party.identity.claim", "party.identity.reassign", "party.identity.verify", "party.identity.withdraw"
];
const runId = validateRunId(
  process.env.PROPERTY_B2A_C3_0_RUN_ID ?? `b2ac30_${randomBytes(8).toString("hex")}`
);
const artifactPath = process.env.PROPERTY_B2A_C3_0_ARTIFACT_PATH;
const freezeDiagnostic = process.env.PROPERTY_B2A_C3_0_FREEZE_DIAGNOSTIC === "1";
if (!artifactPath) {
  throw new Error(
    "PROPERTY_B2A_C3_0_ARTIFACT_PATH is required for an immutable C3-0 candidate"
  );
}
const researchRoot = resolve(
  root,
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research"
);
const absoluteArtifactPath = resolve(root, artifactPath);
const artifactStem = absoluteArtifactPath.endsWith(".json")
  ? absoluteArtifactPath.slice(0, -5)
  : absoluteArtifactPath;
const artifactTargets = {
  candidate: absoluteArtifactPath,
  catalog: `${artifactStem}.catalog.json`,
  functions: `${artifactStem}.functions.json`,
  security: `${artifactStem}.security.json`,
  manifest: `${artifactStem}.manifest.txt`
};

function artifactPreflight() {
  if (dirname(absoluteArtifactPath) !== researchRoot || !absoluteArtifactPath.endsWith(".json")) {
    throw new Error("candidate artifact must be a direct .json child of the B2a task research directory");
  }
  if (freezeDiagnostic && !absoluteArtifactPath.includes("freeze-diagnostic")) {
    throw new Error("freeze diagnostic artifact filename must contain freeze-diagnostic");
  }
  if (lstatSync(researchRoot).isSymbolicLink() || realpathSync(researchRoot) !== researchRoot) {
    throw new Error("candidate research directory must be the exact non-symbolic-link task directory");
  }
  for (const [kind, target] of Object.entries(artifactTargets)) {
    if (dirname(target) !== researchRoot || existsSync(target)) {
      throw new Error(`candidate ${kind} target is outside the exact directory or already exists: ${target}`);
    }
  }
  return { directory: researchRoot, targets: artifactTargets, all_absent: true, symlink_free: true };
}
const artifactPreflightEvidence = artifactPreflight();

const containerName = `pr192_b2a_c3_0_${runId}_db`;
const databaseName = "pr192_b2a_c3_0_gate";
const postgresUser = "pr192_b2a_c3_0";
const postgresPassword = `${runId}_local_only`;
const fixtureLabel = "pr192-b2a-c3-0-schema-gate";
const startedAt = new Date().toISOString();
const docker = (args, options = {}) => runDocker(args, { cwd: root, ...options });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

let createdByThisRun = false;
let containerId = null;
let volumeName = null;
let containerIdentity = null;
let wrapperDirectory = null;
let cleanupEvidence = null;
let signalHandled = false;
let inputFreeze = null;

function psql(input, { tuplesOnly = false, allowFailure = false } = {}) {
  if (!containerId) throw new Error("PostgreSQL fixture is not identity-bound");
  return docker(
    [
      "exec", "-i", containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1",
      ...(tuplesOnly ? ["-qAt", "-F", "\t"] : ["-q"]),
      "-U", postgresUser, "-d", databaseName
    ],
    { input: `\\set VERBOSITY verbose\n${input}`, allowFailure }
  );
}

function query(sql) {
  return psql(sql, { tuplesOnly: true }).stdout.trimEnd();
}

function baselineFiles() {
  return readdirSync(migrations).filter((name) => {
    const number = Number(name.match(/^(\d{6})_.*\.sql$/)?.[1]);
    return Number.isInteger(number) && number <= 182 && number !== 175;
  }).sort();
}

function inputFiles() {
  return [...new Set([
    ...baselineFiles().map((name) => resolve(migrations, name)),
    seed,
    resolve(migrations, "000183_property_business_granular_rbac.sql"),
    resolve(migrations, "000184_property_workbench_read_permissions.sql"),
    ...chain.map((name) => resolve(migrations, name)),
    testFile,
    resolve(root, "scripts/e2e/property-remediation/bootstrap/ephemeral-postgres.mjs"),
    fileURLToPath(import.meta.url),
    legacyManifest,
    portV2Manifest
  ])].sort();
}

function captureInputs(stage) {
  const files = inputFiles().map((path) => {
    const bytes = readFileSync(path);
    return { path: path.slice(root.length + 1), bytes: bytes.length, raw_sha256: sha256(bytes) };
  });
  const grammar = `property-remediation-b2a-c3-0-input-freeze-v1\n${files.map((file) =>
    `${file.path}\t${file.bytes}\t${file.raw_sha256}\n`).join("")}`;
  return { stage, files, grammar, raw_sha256: sha256(grammar) };
}

function assertInputsFrozen(stage) {
  const observed = captureInputs(stage);
  if (!inputFreeze || observed.raw_sha256 !== inputFreeze.raw_sha256) {
    throw new Error(`gate input drift at ${stage}: ${inputFreeze?.raw_sha256} != ${observed.raw_sha256}`);
  }
  return observed;
}

function applyFile(filename, options = {}) {
  return psql(readFileSync(resolve(migrations, filename), "utf8"), options);
}

function ensureHistoryStores() {
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

function recordHistory(filename) {
  const checksum = sha256(readFileSync(resolve(migrations, filename)));
  for (const store of ["sys_schema_migration_history", "schema_migrations"]) {
    psql(`INSERT INTO public.${store}
      (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
      VALUES (${sqlLiteral(filename)},${sqlLiteral(checksum)},'succeeded',clock_timestamp(),
        clock_timestamp(),NULL,'b2a-c3-0-isolated-runner',${sqlLiteral(runId.slice(0, 32))});`);
  }
}

function bootstrap() {
  for (const filename of baselineFiles()) applyFile(filename);
  psql(readFileSync(seed, "utf8"));
  applyFile("000183_property_business_granular_rbac.sql");
  applyFile("000184_property_workbench_read_permissions.sql");
  psql(`BEGIN;
    INSERT INTO sys_tenant(tenant_id,park_id,tenant_code,tenant_name,tenant_type,status,max_users,max_parks,plan_code,remark)
    VALUES ('10000002','0','B2A_C30_SECOND','B2a C3-0 second qualifying tenant','park_operator',1,0,0,'GROUP','multi-scope gate');
    INSERT INTO asset_park(tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark)
    VALUES ('10000001','20000001','B2A_C30_GATE','B2a C3-0 isolated park','enabled',false,1,'first qualifying scope'),
           ('10000002','20000002','B2A_C30_GATE_2','B2a C3-0 second park','enabled',false,1,'second qualifying scope');
    INSERT INTO rel_tenant_module(tenant_id,park_id,tenant_code,module_id,status,enabled,is_deleted,version,remark)
    SELECT '10000002','20000002','B2A_C30_SECOND',m.id,'enabled',true,false,1,'multi-scope asset assignment'
    FROM sys_module m WHERE m.module_code='asset' AND m.status=1 AND m.is_deleted=false ORDER BY m.id LIMIT 1;
    CREATE TEMP TABLE b2a_c30_permission_fixture_map(
      source_id uuid PRIMARY KEY, fixture_id uuid NOT NULL UNIQUE) ON COMMIT DROP;
    INSERT INTO b2a_c30_permission_fixture_map(source_id,fixture_id)
    SELECT permission.id,uuid_generate_v4() FROM sys_permission permission
    WHERE permission.tenant_id='10000001' AND permission.is_enabled=true
      AND permission.status='enabled' AND permission.is_deleted=false;
    INSERT INTO sys_permission(
      id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
      permission_level,level,sort_no,permission_type,perm_type,api_method,api_path,frontend_route,
      component_key,icon,keep_alive,always_show,field_key,data_dimension,is_system,is_builtin,
      is_tenant_custom,visible,is_enabled,status,create_by,create_time,update_by,update_time,
      is_deleted,version,remark)
    SELECT fixture.fixture_id,'10000002','20000002',permission.code,permission.name,NULL,
      permission.resource,permission.action,permission.permission_path,permission.perm_path,
      permission.permission_level,permission.level,permission.sort_no,permission.permission_type,
      permission.perm_type,permission.api_method,permission.api_path,permission.frontend_route,
      permission.component_key,permission.icon,permission.keep_alive,permission.always_show,
      permission.field_key,permission.data_dimension,permission.is_system,permission.is_builtin,
      permission.is_tenant_custom,permission.visible,permission.is_enabled,permission.status,
      permission.create_by,permission.create_time,permission.update_by,permission.update_time,
      false,permission.version,'B2A C3-0 exact production permission subtree fixture'
    FROM sys_permission permission
    JOIN b2a_c30_permission_fixture_map fixture ON fixture.source_id=permission.id;
    UPDATE sys_permission target SET parent_id=parent_fixture.fixture_id
    FROM b2a_c30_permission_fixture_map child_fixture
    JOIN sys_permission source ON source.id=child_fixture.source_id
    JOIN b2a_c30_permission_fixture_map parent_fixture ON parent_fixture.source_id=source.parent_id
    WHERE target.id=child_fixture.fixture_id;
    DO $fixture$
    DECLARE source_count integer; fixture_count integer; unresolved integer; drift integer;
    BEGIN
      SELECT count(*) INTO source_count FROM b2a_c30_permission_fixture_map;
      SELECT count(*) INTO fixture_count FROM sys_permission
       WHERE tenant_id='10000002' AND is_enabled=true AND status='enabled' AND is_deleted=false;
      SELECT count(*) INTO unresolved FROM b2a_c30_permission_fixture_map child
       JOIN sys_permission source ON source.id=child.source_id
       LEFT JOIN b2a_c30_permission_fixture_map parent ON parent.source_id=source.parent_id
       WHERE source.parent_id IS NOT NULL AND parent.fixture_id IS NULL;
      WITH source_semantics AS (
        SELECT p.code,p.name,parent.code parent_code,p.resource,p.action,p.permission_path,p.perm_path,
          p.permission_level,p.level,p.sort_no,p.permission_type,p.perm_type,p.api_method,p.api_path,
          p.frontend_route,p.component_key,p.icon,p.keep_alive,p.always_show,p.field_key,p.data_dimension,
          p.is_system,p.is_builtin,p.is_tenant_custom,p.visible,p.is_enabled,p.status,p.version
        FROM sys_permission p LEFT JOIN sys_permission parent ON parent.id=p.parent_id
        WHERE p.tenant_id='10000001' AND p.is_enabled=true AND p.status='enabled' AND p.is_deleted=false
      ), fixture_semantics AS (
        SELECT p.code,p.name,parent.code parent_code,p.resource,p.action,p.permission_path,p.perm_path,
          p.permission_level,p.level,p.sort_no,p.permission_type,p.perm_type,p.api_method,p.api_path,
          p.frontend_route,p.component_key,p.icon,p.keep_alive,p.always_show,p.field_key,p.data_dimension,
          p.is_system,p.is_builtin,p.is_tenant_custom,p.visible,p.is_enabled,p.status,p.version
        FROM sys_permission p LEFT JOIN sys_permission parent ON parent.id=p.parent_id
        WHERE p.tenant_id='10000002' AND p.is_enabled=true AND p.status='enabled' AND p.is_deleted=false
      ), delta AS ((SELECT * FROM source_semantics EXCEPT SELECT * FROM fixture_semantics)
        UNION ALL (SELECT * FROM fixture_semantics EXCEPT SELECT * FROM source_semantics))
      SELECT count(*) INTO drift FROM delta;
      IF source_count=0 OR fixture_count<>source_count OR unresolved<>0 OR drift<>0 THEN
        RAISE EXCEPTION 'b2a-c3-0-second-scope-permission-subtree-fixture-failed' USING ERRCODE='23514';
      END IF;
    END $fixture$;
    COMMIT;`);
  ensureHistoryStores();
  for (const filename of chain.slice(0, -1)) {
    applyFile(filename);
    recordHistory(filename);
  }
}

function start() {
  if (strictInspect("container", containerName)) {
    throw new Error(`exact fixture already exists: ${containerName}`);
  }
  const created = docker(buildEphemeralPostgresRunArgs({
    containerName, databaseName, fixtureLabel, runId, postgresUser, postgresPassword
  }));
  createdByThisRun = true;
  const inspected = strictInspect("container", containerName);
  const exact = assertExactEphemeralPostgresContainer(inspected, {
    containerName, databaseName, fixtureLabel, runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
  });
  // Bind cleanup ownership immediately after the name-resolved container has
  // passed the complete exact-identity contract. A later stdout-id failure
  // must not discard the already validated cleanup target.
  containerId = exact.containerId;
  volumeName = exact.volumeName;
  containerIdentity = {
    image_reference: OFFICIAL_POSTGRES_IMAGE,
    image_digest: inspected.Image,
    container_id: containerId,
    container_name: containerName,
    anonymous_volume_name: volumeName,
    host_port: exact.hostPort
  };
  const stdoutContainerId = resolveCreatedContainerId(created.stdout, inspected, {
    containerName, databaseName, fixtureLabel, runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
  });
  if (stdoutContainerId !== containerId) {
    throw new Error("docker run stdout id does not match the exact name-inspected cleanup target");
  }
  let lastLogs = null;
  let lastReady = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    lastLogs = docker(["logs", "--tail", "100", containerId], { allowFailure: true });
    const ready = docker(["exec", containerId, "pg_isready", "-U", postgresUser, "-d", databaseName],
      { allowFailure: true });
    lastReady = ready;
    const initializationComplete = `${lastLogs.stdout ?? ""}${lastLogs.stderr ?? ""}`.includes(
      "PostgreSQL init process complete; ready for start up."
    );
    if (initializationComplete && ready.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`ephemeral PostgreSQL readiness timeout: ${JSON.stringify({
    logs_status: lastLogs?.status ?? null,
    logs_stdout: lastLogs?.stdout ?? "",
    logs_stderr: lastLogs?.stderr ?? "",
    pg_isready_status: lastReady?.status ?? null,
    pg_isready_stdout: lastReady?.stdout ?? "",
    pg_isready_stderr: lastReady?.stderr ?? ""
  })}`);
}

function strictInspect(type, target) {
  const args = type === "volume" ? ["volume", "inspect", target] : ["inspect", "--type", type, target];
  const result = docker(args, { allowFailure: true });
  if (result.status !== 0) {
    const absentPattern = type === "volume" ? /no such (volume|object)/i : /No such (object|container)/i;
    const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (absentPattern.test(diagnostic)) return null;
    throw new Error(`docker ${type} inspect failed without exact absence proof: ${(result.stderr || result.stdout).trim()}`);
  }
  try {
    const [row] = JSON.parse(result.stdout);
    if (!row) throw new Error("empty inspect result");
    return row;
  } catch (error) {
    throw new Error(`docker ${type} inspect returned invalid JSON: ${error.message}`);
  }
}

function exactContainerAbsent() {
  return (!containerId || strictInspect("container", containerId) === null) &&
    strictInspect("container", containerName) === null;
}

function exactVolumeAbsent() {
  if (!volumeName) return true;
  return strictInspect("volume", volumeName) === null;
}

function cleanup() {
  if (cleanupEvidence) return cleanupEvidence;
  const errors = [];
  let containerRemoval = null;
  let volumeRemoval = null;
  let cleanupReacquisition = { attempted: false, outcome: "not-required" };
  if (createdByThisRun && !containerId) {
    cleanupReacquisition = { attempted: true, outcome: "pending" };
    try {
      const reacquired = strictInspect("container", containerName);
      if (reacquired === null) {
        cleanupReacquisition = {
          attempted: true,
          outcome: "exact-name-explicitly-absent",
          container_name: containerName
        };
      } else {
        const exact = assertExactEphemeralPostgresContainer(reacquired, {
          containerName, databaseName, fixtureLabel, runId,
          expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: false, requireRunning: false
        });
        containerId = exact.containerId;
        volumeName = exact.volumeName;
        cleanupReacquisition = {
          attempted: true,
          outcome: "exact-identity-reacquired",
          container_name: containerName,
          container_id: containerId,
          anonymous_volume_name: volumeName
        };
      }
    } catch (error) {
      cleanupReacquisition = {
        attempted: true,
        outcome: "fail-closed-no-delete",
        container_name: containerName,
        error: error.message
      };
      errors.push(`cleanup exact target reacquisition failed: ${error.message}`);
    }
  }
  if (createdByThisRun && containerId) {
    try {
      const inspected = strictInspect("container", containerName);
      if (inspected) {
        const exact = assertExactEphemeralPostgresContainer(inspected, {
          containerName, databaseName, fixtureLabel, runId,
          expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: false, requireRunning: false
        });
        if (exact.containerId !== containerId || exact.volumeName !== volumeName) {
          throw new Error("cleanup exact container/volume identity mismatch");
        }
        containerRemoval = docker(["rm", "-f", "-v", containerId], { allowFailure: true });
      }
    } catch (error) {
      errors.push(`cleanup validated target recheck failed; destructive cleanup refused: ${error.message}`);
    }
  } else if (createdByThisRun && cleanupReacquisition.outcome !== "exact-name-explicitly-absent") {
    errors.push("created fixture has no validated exact container id; destructive cleanup refused");
  }
  let containerAbsent = false;
  try {
    for (let attempt = 0; attempt < 100 && !exactContainerAbsent(); attempt += 1) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
    containerAbsent = exactContainerAbsent();
  } catch (error) {
    errors.push(error.message);
  }
  if (!containerAbsent) errors.push("exact container remains after cleanup deadline");
  if (volumeName && containerAbsent) {
    volumeRemoval = docker(["volume", "rm", volumeName], { allowFailure: true });
  }
  let volumeAbsent = false;
  try {
    for (let attempt = 0; attempt < 100 && !exactVolumeAbsent(); attempt += 1) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
    volumeAbsent = exactVolumeAbsent();
  } catch (error) {
    errors.push(error.message);
  }
  if (!volumeAbsent) errors.push("exact anonymous volume remains after cleanup deadline");
  if (wrapperDirectory) {
    rmSync(wrapperDirectory, { recursive: true, force: true });
  }
  cleanupEvidence = {
    status: containerAbsent && volumeAbsent && errors.length === 0 ? "passed" : "failed",
    container_absent: containerAbsent,
    anonymous_volume_absent: volumeAbsent,
    temp_wrapper_absent: !wrapperDirectory || !existsSync(wrapperDirectory),
    errors,
    cleanup_reacquisition: cleanupReacquisition,
    removal_status: {
      container: {
        status: containerRemoval?.status ?? null,
        stdout: containerRemoval?.stdout ?? "",
        stderr: containerRemoval?.stderr ?? "",
        nonzero_but_exact_absence_proven: (containerRemoval?.status ?? 0) !== 0 && containerAbsent
      },
      volume: {
        status: volumeRemoval?.status ?? null,
        stdout: volumeRemoval?.stdout ?? "",
        stderr: volumeRemoval?.stderr ?? "",
        nonzero_but_exact_absence_proven: (volumeRemoval?.status ?? 0) !== 0 && volumeAbsent
      }
    },
    exact_targets: [
      { type: "container", id: containerId, name: containerName, absent: containerAbsent },
      { type: "anonymous-volume", id: volumeName, name: volumeName, absent: volumeAbsent }
    ]
  };
  return cleanupEvidence;
}

function preserveSignalFailureEvidence(signal, evidence) {
  if (Object.values(artifactTargets).some((target) => existsSync(target))) {
    return { written: false, reason: "an immutable artifact target already exists" };
  }
  const runnerPath = fileURLToPath(import.meta.url);
  const migrationBytes = readFileSync(resolve(migrations, migration195));
  const interrupted = {
    schema_version: "property-remediation-b2a-c3-0-interrupted-v1",
    run_id: runId,
    status: "failed",
    candidate_admissible: false,
    execution_mode: freezeDiagnostic ? "freeze-diagnostic-first-apply-only" : "formal-candidate",
    signal,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    migration: { filename: migration195, raw_sha256: sha256(migrationBytes) },
    runner: { path: runnerPath.slice(root.length + 1), raw_sha256: sha256(readFileSync(runnerPath)) },
    artifact_preflight: artifactPreflightEvidence,
    input_freeze_before: inputFreeze,
    environment: containerIdentity,
    cleanup: evidence
  };
  return { written: true, ...writeArtifacts(interrupted, {
    catalog: { unavailable: true, reason: signal },
    functions: { unavailable: true, reason: signal },
    security: { unavailable: true, reason: signal }
  }) };
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    if (signalHandled) return;
    signalHandled = true;
    const evidence = cleanup();
    let preserved;
    try {
      preserved = preserveSignalFailureEvidence(signal, evidence);
    } catch (error) {
      preserved = { written: false, error: error.message };
    }
    process.stderr.write(`${signal}: ${JSON.stringify({ cleanup: evidence, preserved })}\n`);
    process.exit(evidence.status === "passed" ? 128 : 1);
  });
}

function historyGuardSql(marker) {
  return `DO $history$
  DECLARE mismatch_count integer; occupied_count integer;
  BEGIN
    WITH primary_rows AS (
      SELECT filename,checksum,status FROM public.sys_schema_migration_history
       WHERE filename=${sqlLiteral(migration195)}
    ), standard_rows AS (
      SELECT filename,checksum,status FROM public.schema_migrations
       WHERE filename=${sqlLiteral(migration195)}
    ), joined AS (
      SELECT p.filename p_filename,s.filename s_filename,p.checksum p_checksum,s.checksum s_checksum,
        p.status p_status,s.status s_status FROM primary_rows p FULL JOIN standard_rows s USING(filename)
    )
    SELECT count(*) FILTER (WHERE p_filename IS NULL OR s_filename IS NULL
      OR p_checksum IS DISTINCT FROM s_checksum OR p_status IS DISTINCT FROM s_status),count(*)
      INTO mismatch_count,occupied_count FROM joined;
    IF mismatch_count<>0 THEN
      RAISE EXCEPTION 'property-mutation-receipt-000195-history-inconsistent:${marker}' USING ERRCODE='23514';
    END IF;
    IF occupied_count<>0 THEN
      RAISE EXCEPTION 'property-mutation-receipt-000195-history-occupied:${marker}' USING ERRCODE='23514';
    END IF;
  END $history$;`;
}

function assertFreshHistory(marker) {
  psql(historyGuardSql(marker));
  return JSON.parse(query(`WITH p AS (SELECT filename,checksum,status FROM sys_schema_migration_history
      WHERE filename=${sqlLiteral(migration195)}),
    s AS (SELECT filename,checksum,status FROM schema_migrations WHERE filename=${sqlLiteral(migration195)})
    SELECT json_build_object('marker',${sqlLiteral(marker)},'primary_count',(SELECT count(*) FROM p),
      'standard_count',(SELECT count(*) FROM s),'full_join_count',(
        SELECT count(*) FROM p FULL JOIN s USING(filename)))::text;`));
}

function historyNegativeGate() {
  const insert = (store, checksum, status) => `INSERT INTO public.${store}
    (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    VALUES (${sqlLiteral(migration195)},${sqlLiteral(checksum)},${sqlLiteral(status)},clock_timestamp(),
      CASE WHEN ${sqlLiteral(status)}='running' THEN NULL ELSE clock_timestamp() END,NULL,
      'b2a-c3-0-history-negative',${sqlLiteral(runId.slice(0, 32))});`;
  const cases = [
    { name: "primary-only", sql: insert("sys_schema_migration_history", "1".repeat(64), "succeeded"), marker: "history-inconsistent" },
    { name: "standard-only", sql: insert("schema_migrations", "2".repeat(64), "succeeded"), marker: "history-inconsistent" },
    { name: "checksum-mismatch", sql: `${insert("sys_schema_migration_history", "3".repeat(64), "succeeded")}${insert("schema_migrations", "4".repeat(64), "succeeded")}`, marker: "history-inconsistent" },
    { name: "status-mismatch-running", sql: `${insert("sys_schema_migration_history", "5".repeat(64), "running")}${insert("schema_migrations", "5".repeat(64), "succeeded")}`, marker: "history-inconsistent" },
    { name: "dual-running", sql: `${insert("sys_schema_migration_history", "6".repeat(64), "running")}${insert("schema_migrations", "6".repeat(64), "running")}`, marker: "history-occupied" },
    { name: "dual-failed", sql: `${insert("sys_schema_migration_history", "7".repeat(64), "failed")}${insert("schema_migrations", "7".repeat(64), "failed")}`, marker: "history-occupied" },
    { name: "dual-succeeded", sql: `${insert("sys_schema_migration_history", "8".repeat(64), "succeeded")}${insert("schema_migrations", "8".repeat(64), "succeeded")}`, marker: "history-occupied" }
  ];
  const results = cases.map((item) => {
    const attempted = psql(`BEGIN;${item.sql}${historyGuardSql(`negative-${item.name}`)}COMMIT;`,
      { allowFailure: true });
    const diagnostic = `${attempted.stdout}\n${attempted.stderr}`;
    if (attempted.status === 0 || !diagnostic.includes(item.marker)) {
      throw new Error(`history negative did not fail closed: ${item.name}:${diagnostic}`);
    }
    const restored = assertFreshHistory(`restored-${item.name}`);
    return { case: item.name, observed_status: attempted.status, expected_marker: item.marker,
      rollback_verified: restored.primary_count === 0 && restored.standard_count === 0 };
  });
  return { schema_version: "b2a-c3-0-history-negative-v1", status: "passed", cases: results };
}

function historyEvidence() {
  return JSON.parse(query(`SELECT json_build_object(
    'primary',(SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM
      (SELECT filename,checksum,status,executed_by,batch_id FROM sys_schema_migration_history
       WHERE filename=${sqlLiteral(migration195)}) x),
    'standard',(SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM
      (SELECT filename,checksum,status,executed_by,batch_id FROM schema_migrations
       WHERE filename=${sqlLiteral(migration195)}) x))::text;`));
}

function assertMigration194History() {
  const filename = "000194_property_task_projection_contract_correction.sql";
  const checksum = sha256(readFileSync(resolve(migrations, filename)));
  const evidence = JSON.parse(query(`SELECT json_build_object(
    'expected_checksum',${sqlLiteral(checksum)},
    'primary',(SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM
      (SELECT filename,checksum,status FROM sys_schema_migration_history WHERE filename=${sqlLiteral(filename)}) x),
    'standard',(SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM
      (SELECT filename,checksum,status FROM schema_migrations WHERE filename=${sqlLiteral(filename)}) x))::text;`));
  for (const store of ["primary", "standard"]) {
    const rows = evidence[store];
    if (rows.length !== 1 || rows[0].checksum !== checksum || rows[0].status !== "succeeded") {
      throw new Error(`000194 ${store} history is not exact: ${JSON.stringify(rows)}`);
    }
  }
  return { ...evidence, status: "passed" };
}

function legacyReceiptFingerprint() {
  const grammar = query(`SELECT coalesce(string_agg(
    id||E'\\t'||tenant_id||E'\\t'||park_id||E'\\t'||actor_id||E'\\t'||action_id||E'\\t'||
    target_id||E'\\t'||client_key||E'\\t'||request_hash||E'\\t'||receipt_status||E'\\t'||
    coalesce(result_ref,'<NULL>')||E'\\t'||coalesce(result_hash::text,'<NULL>')||E'\\t'||
    coalesce(to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'<NULL>')||E'\\n',''
    ORDER BY action_id,client_key),'') FROM biz_property_mutation_receipt WHERE tenant_id='c3-pre195-legacy';`);
  return { rows: Number(query("SELECT count(*) FROM biz_property_mutation_receipt WHERE tenant_id='c3-pre195-legacy';")),
    grammar, raw_sha256: sha256(grammar) };
}

function seedLegacyReceipts() {
  const values = legacyActions.map((action, index) => `(${index + 1},${sqlLiteral(action)})`).join(",");
  psql(`DO $fixture$
  DECLARE r record; v_id uuid;
  BEGIN
    FOR r IN SELECT * FROM (VALUES ${values}) action(ordinal,action_id) LOOP
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES ('c3-pre195-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('41000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'started-'||r.ordinal,repeat('a',64));
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES ('c3-pre195-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('42000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'completed-'||r.ordinal,repeat('b',64))
      RETURNING id INTO v_id;
      UPDATE biz_property_mutation_receipt SET receipt_status='completed',result_ref='pre195/completed/'||r.ordinal,
        result_hash=repeat('c',64),completed_at=clock_timestamp() WHERE id=v_id;
      INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash,
        receipt_status,result_ref,result_hash)
      VALUES ('c3-pre195-legacy','p1','10000000-0000-4000-8000-000000000001',r.action_id,
        ('43000000-0000-4000-8000-'||lpad(r.ordinal::text,12,'0'))::uuid,'failed-'||r.ordinal,repeat('d',64),
        'failed','pre195/failed/'||r.ordinal,repeat('e',64));
    END LOOP;
  END $fixture$;`);
  const evidence = legacyReceiptFingerprint();
  if (evidence.rows !== 39) throw new Error(`pre-195 legacy receipt fixture count mismatch: ${evidence.rows}`);
  const rows = JSON.parse(query(`SELECT coalesce(json_agg(json_build_object(
    'actionId',action_id,'receiptStatus',receipt_status,'requestHash',request_hash::text,
    'resultRef',result_ref,'resultHash',result_hash::text)
    ORDER BY action_id COLLATE "C",receipt_status COLLATE "C"),'[]'::json)::text
    FROM biz_property_mutation_receipt WHERE tenant_id='c3-pre195-legacy';`));
  const normalizedRows = rows.map((row) => ({
    actionId: row.actionId,
    receiptStatus: row.receiptStatus,
    requestHash: row.requestHash,
    resultRef: row.resultRef ?? null,
    resultHash: row.resultHash ?? null
  })).sort((left, right) => {
    const leftKey = `${left.actionId}\t${left.receiptStatus}`;
    const rightKey = `${right.actionId}\t${right.receiptStatus}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const hook = {
    schemaVersion: "b2a-c3-0-pre-195-legacy-fingerprint-v1",
    tenantId: "c3-pre195-legacy",
    rows: normalizedRows,
    canonicalSha256: sha256(`${JSON.stringify(normalizedRows)}\n`)
  };
  return { ...evidence, hook };
}

function assertLegacyReceiptsPreserved(before) {
  const after = legacyReceiptFingerprint();
  const extension = query(`SELECT count(*)||'|'||count(*) FILTER (WHERE receipt_contract_version='legacy-v1'
    AND identity_kind IS NULL AND business_occurrence_key IS NULL AND task_key IS NULL
    AND identity_source_type IS NULL AND result_version IS NULL)
    FROM biz_property_mutation_receipt WHERE tenant_id='c3-pre195-legacy';`);
  if (after.raw_sha256 !== before.raw_sha256 || after.rows !== 39 || extension !== "39|39") {
    throw new Error(`pre-195 legacy receipts changed: ${JSON.stringify({ before, after, extension })}`);
  }
  return { before, after, extension, exact: true };
}

function createPsqlWrapper() {
  wrapperDirectory = mkdtempSync(resolve(tmpdir(), `b2a-c3-0-${runId}-`));
  const wrapperPath = resolve(wrapperDirectory, "psql");
  const script = `#!/bin/sh\nset -eu\ncase "\${1-}" in postgresql://*) shift ;; *) exit 64 ;; esac\nexec docker exec -i ${containerId} psql -U ${postgresUser} -d ${databaseName} "$@"\n`;
  writeFileSync(wrapperPath, script, { flag: "wx", mode: 0o700 });
  chmodSync(wrapperPath, 0o700);
  return wrapperDirectory;
}

function runContractTests(pre195Fingerprint) {
  const wrapperPath = createPsqlWrapper();
  const fingerprintPath = resolve(wrapperDirectory, "pre-195-legacy-fingerprint.json");
  writeFileSync(fingerprintPath, `${JSON.stringify(pre195Fingerprint, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1/${databaseName}`;
  const childEnvironment = {
    ...process.env,
    PATH: `${wrapperPath}:${process.env.PATH ?? ""}`,
    PROPERTY_B2A_C3_0_DATABASE_URL: databaseUrl,
    PROPERTY_B2A_C3_0_PRE_195_FINGERPRINT_PATH: fingerprintPath
  };
  delete childEnvironment.PROPERTY_B2A_C3_0_STATIC_ONLY;
  const result = spawnSync(process.execPath, [testFile], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 40 * 1024 * 1024,
    env: childEnvironment
  });
  if (result.status !== 0) {
    throw new Error(`C3-0 node contract tests failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  const tests = Number(result.stdout.match(/^# tests (\d+)$/m)?.[1] ?? -1);
  const skipped = Number(result.stdout.match(/^# skipped (\d+)$/m)?.[1] ?? -1);
  const passed = Number(result.stdout.match(/^# pass (\d+)$/m)?.[1] ?? -1);
  if (tests !== 13 || skipped !== 0 || passed !== 13) {
    throw new Error(`C3-0 child test cardinality mismatch: ${JSON.stringify({ tests, skipped, passed })}\n${result.stdout}`);
  }
  return { status: "passed", exit_status: result.status, tests, passed, skipped,
    static_only_removed: true, expected_test_count: 13,
    signed_test_source_sha256: inputFreeze.files.find((file) => file.path === testFile.slice(root.length + 1))?.raw_sha256,
    pre_195_fingerprint_sha256: sha256(readFileSync(fingerprintPath)),
    invocation: [process.execPath, testFile], stdout: result.stdout, stderr: result.stderr };
}

function catalogEvidence() {
  return JSON.parse(query(`WITH relations AS (
      SELECT c.oid,n.nspname,c.relname,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relacl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
       ('biz_property_mutation_receipt','sys_property_runtime_control_contract_audit')
    ), facts AS (
      SELECT 'relation' kind,relname name,concat_ws('|',relkind,relpersistence,relrowsecurity,relforcerowsecurity,relacl::text) definition FROM relations
      UNION ALL SELECT 'column',r.relname||'.'||a.attname,concat_ws('|',a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),''))
       FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attnum>0 AND NOT a.attisdropped
      UNION ALL SELECT 'constraint',r.relname||'.'||c.conname,concat_ws('|',c.contype,c.convalidated,pg_get_constraintdef(c.oid,true))
       FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid
      UNION ALL SELECT 'trigger',r.relname||'.'||t.tgname,concat_ws('|',t.tgenabled,pg_get_triggerdef(t.oid,true))
       FROM relations r JOIN pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal
      UNION ALL SELECT 'function',p.oid::regprocedure::text,pg_get_functiondef(p.oid)
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
       AND p.proname IN ('fn_property_mutation_receipt_result_hash_v2','fn_property_mutation_receipt_guard_v2','fn_property_task_projection_replace_v1')
    ), grammar AS (SELECT string_agg(kind||E'\\t'||name||E'\\t'||definition||E'\\n','' ORDER BY kind,name) bytes FROM facts)
    SELECT json_build_object('grammar',bytes,'raw_sha256',encode(public.digest(convert_to(bytes,'UTF8'),'sha256'),'hex'))::text FROM grammar;`));
}

function functionEvidence() {
  return JSON.parse(query(`SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.identity),'[]'::json)::text FROM (
    SELECT p.oid::regprocedure::text identity,p.provolatile,p.prosecdef,p.proisstrict,p.proconfig,p.proacl,
      encode(public.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex') definition_sha256,
      pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('fn_property_mutation_receipt_result_hash_v2','fn_property_mutation_receipt_guard_v2','fn_property_task_projection_replace_v1')) x;`));
}

function freezeDiagnosticEvidence() {
  return JSON.parse(query(`WITH function_rows AS (
    SELECT p.oid::regprocedure::text identity,p.proname,p.provolatile,p.prosecdef,p.proisstrict,
      p.proconfig,p.proacl,has_function_privilege('public',p.oid,'EXECUTE') public_execute,
      has_function_privilege(current_user,p.oid,'EXECUTE') owner_execute,
      pg_get_functiondef(p.oid) definition,
      btrim(regexp_replace(pg_get_functiondef(p.oid),'[[:space:]]+',' ','g')) normalized_definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proname IN ('fn_property_task_projection_replace_v1',
        'fn_property_mutation_receipt_result_hash_v2','fn_property_mutation_receipt_guard_v2')
  ), constraint_rows AS (
    SELECT c.conname,pg_get_constraintdef(c.oid,true) definition
    FROM pg_constraint c WHERE c.conrelid='public.biz_property_mutation_receipt'::regclass
      AND c.conname IN ('ck_biz_property_mutation_receipt_contract_version_v2',
        'ck_biz_property_mutation_receipt_action_version_v2','ck_biz_property_mutation_receipt_identity_v2',
        'ck_biz_property_mutation_receipt_outcome_v2') ORDER BY c.conname
  ), constraint_grammar AS (
    SELECT string_agg(conname||E'\\t'||definition||E'\\n','' ORDER BY conname) bytes FROM constraint_rows
  ), trigger_row AS (
    SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition,
      btrim(regexp_replace(pg_get_triggerdef(t.oid,true),'[[:space:]]+',' ','g')) normalized_definition
    FROM pg_trigger t WHERE t.tgrelid='public.biz_property_mutation_receipt'::regclass
      AND t.tgname='trg_property_mutation_receipt_guard_v2' AND NOT t.tgisinternal
  ) SELECT json_build_object(
    'schema_version','b2a-c3-0-freeze-diagnostic-v1',
    'candidate_admissible',false,
    'functions',(SELECT json_agg(json_build_object('identity',identity,'name',proname,
      'definition_sha256',encode(public.digest(convert_to(definition,'UTF8'),'sha256'),'hex'),
      'normalized_definition_sha256',encode(public.digest(convert_to(normalized_definition,'UTF8'),'sha256'),'hex'),
      'provolatile',provolatile,'prosecdef',prosecdef,'proisstrict',proisstrict,'proconfig',proconfig,
      'proacl',proacl,'public_execute',public_execute,'owner_execute',owner_execute)
      ORDER BY identity) FROM function_rows),
    'overloads',(SELECT json_object_agg(proname,overload_count ORDER BY proname) FROM
      (SELECT proname,count(*) overload_count FROM function_rows GROUP BY proname) x),
    'constraints',(SELECT json_agg(row_to_json(c) ORDER BY c.conname) FROM constraint_rows c),
    'constraints_aggregate_sha256',(SELECT encode(public.digest(convert_to(bytes,'UTF8'),'sha256'),'hex') FROM constraint_grammar),
    'trigger',(SELECT json_build_object('name',tgname,'enabled',tgenabled,
      'definition_sha256',encode(public.digest(convert_to(definition,'UTF8'),'sha256'),'hex'),
      'normalized_definition_sha256',encode(public.digest(convert_to(normalized_definition,'UTF8'),'sha256'),'hex')) FROM trigger_row),
    'columns',(SELECT json_agg(row_to_json(x) ORDER BY x.ordinal_position) FROM
      (SELECT ordinal_position,column_name,data_type,character_maximum_length,is_nullable,column_default
       FROM information_schema.columns WHERE table_schema='public' AND table_name='biz_property_mutation_receipt') x)
  )::text;`));
}

function securityEvidence() {
  return JSON.parse(query(`SELECT json_build_object(
    'relation_acl',(SELECT c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='biz_property_mutation_receipt'),
    'function_acl',(SELECT json_agg(row_to_json(x) ORDER BY x.identity) FROM
      (SELECT p.oid::regprocedure::text identity,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
       ('fn_property_mutation_receipt_result_hash_v2','fn_property_mutation_receipt_guard_v2','fn_property_task_projection_replace_v1')) x),
    'trigger',(SELECT row_to_json(x) FROM (SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition
      FROM pg_trigger t WHERE t.tgrelid='public.biz_property_mutation_receipt'::regclass
       AND t.tgname='trg_property_mutation_receipt_guard_v2' AND NOT t.tgisinternal) x),
    'controls',(SELECT json_agg(row_to_json(x) ORDER BY x.tenant_id,x.park_id,x.control_key) FROM
      (SELECT tenant_id,park_id,control_key,contract_hash,enabled,control_mode,version FROM sys_property_runtime_control) x),
    'audits',(SELECT json_agg(row_to_json(x) ORDER BY x.tenant_id,x.park_id,x.control_key) FROM
      (SELECT tenant_id,park_id,control_key,correction_key,old_contract_hash,new_contract_hash,old_version,new_version
       FROM sys_property_runtime_control_contract_audit WHERE correction_key='b2a-contract-correction-000195') x))::text;`));
}

function fullStateFingerprint() {
  return query(`WITH owned_relations AS (
    SELECT c.oid,c.relname,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,
      c.relacl,c.relowner,obj_description(c.oid,'pg_class') comment
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname IN ('biz_property_mutation_receipt','sys_property_runtime_control',
        'sys_property_runtime_control_contract_audit','sys_schema_migration_history','schema_migrations')
  ), facts AS (
    SELECT 'relation' kind,relname identity,concat_ws('|',relkind,relpersistence,relrowsecurity,
      relforcerowsecurity,relacl::text,relowner,comment) value FROM owned_relations
    UNION ALL SELECT 'column',r.relname||'.'||a.attname,concat_ws('|',a.attnum,
      format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
      coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attacl::text,col_description(r.oid,a.attnum))
      FROM owned_relations r JOIN pg_attribute a ON a.attrelid=r.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'constraint',r.relname||'.'||c.conname,concat_ws('|',c.contype,c.convalidated,
      c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid,true),obj_description(c.oid,'pg_constraint'))
      FROM owned_relations r JOIN pg_constraint c ON c.conrelid=r.oid
    UNION ALL SELECT 'index',r.relname||'.'||i.relname,concat_ws('|',x.indisunique,x.indisprimary,
      x.indisvalid,x.indisready,pg_get_indexdef(x.indexrelid),i.relacl::text,obj_description(i.oid,'pg_class'))
      FROM owned_relations r JOIN pg_index x ON x.indrelid=r.oid JOIN pg_class i ON i.oid=x.indexrelid
    UNION ALL SELECT 'trigger',r.relname||'.'||t.tgname,concat_ws('|',t.tgenabled,t.tgdeferrable,
      t.tginitdeferred,pg_get_triggerdef(t.oid,true),obj_description(t.oid,'pg_trigger'))
      FROM owned_relations r JOIN pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal
    UNION ALL SELECT 'function',p.oid::regprocedure::text,concat_ws('|',p.provolatile,p.prosecdef,
      p.proisstrict,p.proconfig::text,p.proacl::text,obj_description(p.oid,'pg_proc'),pg_get_functiondef(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proname IN ('fn_property_mutation_receipt_result_hash_v2','fn_property_mutation_receipt_guard_v2',
        'fn_property_task_projection_replace_v1','fn_property_runtime_control_contract_audit_immutable')
    UNION ALL SELECT 'receipt',id::text,row_to_json(r)::text FROM biz_property_mutation_receipt r
    UNION ALL SELECT 'control',id::text,row_to_json(c)::text FROM sys_property_runtime_control c
    UNION ALL SELECT 'control-audit',id::text,row_to_json(a)::text FROM sys_property_runtime_control_contract_audit a
    UNION ALL SELECT 'history-primary',id::text,row_to_json(h)::text FROM sys_schema_migration_history h
    UNION ALL SELECT 'history-standard',id::text,row_to_json(h)::text FROM schema_migrations h
  ), grammar AS (SELECT string_agg(kind||E'\\t'||identity||E'\\t'||value||E'\\n',''
      ORDER BY kind,identity) bytes FROM facts)
  SELECT encode(public.digest(convert_to(bytes,'UTF8'),'sha256'),'hex') FROM grammar;`);
}

function migrationNegativeGate() {
  const migration = readFileSync(resolve(migrations, migration195), "utf8");
  const actor = "10000000-0000-4000-8000-000000000099";
  const enabled = (mode) => `UPDATE sys_property_runtime_control SET enabled=true,control_mode=${sqlLiteral(mode)},
    enabled_by='${actor}',enabled_at=clock_timestamp(),approval_reference='negative-${mode}'
    WHERE id=(SELECT id FROM sys_property_runtime_control ORDER BY tenant_id,park_id,control_key LIMIT 1);`;
  const cases = [
    { name: "control-enabled", injection: enabled("observe"), marker: "property-runtime-control-contract-drift" },
    { name: "control-shadow", injection: enabled("shadow"), marker: "property-runtime-control-contract-drift" },
    { name: "control-enforce", injection: enabled("enforce"), marker: "property-runtime-control-contract-drift" },
    { name: "control-mixed", injection: `UPDATE sys_property_runtime_control
      SET contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944',
          disabled_reason='b2a-contract-correction-000195',version=3
      WHERE id=(SELECT id FROM sys_property_runtime_control ORDER BY tenant_id,park_id,control_key LIMIT 1);`,
      marker: "property-runtime-control-mixed-contract-state" },
    { name: "control-missing", injection: `ALTER TABLE sys_property_runtime_control_contract_audit
      DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;
      DELETE FROM sys_property_runtime_control_contract_audit WHERE control_id=(
        SELECT id FROM sys_property_runtime_control ORDER BY tenant_id,park_id,control_key LIMIT 1);
      DELETE FROM sys_property_runtime_control WHERE id=(
        SELECT id FROM sys_property_runtime_control ORDER BY tenant_id,park_id,control_key LIMIT 1);`,
      marker: "property-runtime-control-scope-exact-set-drift" },
    { name: "control-extra", injection: `INSERT INTO sys_property_runtime_control(
        tenant_id,park_id,control_key,control_kind,target,adapter_version,contract_hash,enabled,
        control_mode,enabled_by,enabled_at,approval_reference,disabled_reason,version)
      SELECT tenant_id,park_id,'negative.extra-control',control_kind,target,adapter_version,contract_hash,false,
        'disabled',NULL,NULL,NULL,disabled_reason,version
      FROM sys_property_runtime_control ORDER BY tenant_id,park_id,control_key LIMIT 1;`,
      marker: "property-runtime-control-scope-exact-set-drift" },
    { name: "audit-constraint-missing", injection: "ALTER TABLE sys_property_runtime_control_contract_audit DROP CONSTRAINT ck_sys_property_runtime_control_contract_audit_key;", marker: "property-runtime-control-audit-key-constraint-missing" },
    { name: "old-audit-missing", injection: "ALTER TABLE sys_property_runtime_control_contract_audit DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable; DELETE FROM sys_property_runtime_control_contract_audit WHERE id=(SELECT id FROM sys_property_runtime_control_contract_audit ORDER BY id LIMIT 1);", marker: "property-runtime-control-000194-audit-drift" },
    { name: "unknown-legacy-action", injection: `INSERT INTO biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash) VALUES ('negative','p1','${actor}','property.unknown.action','50000000-0000-4000-8000-000000000001','unknown',repeat('a',64));`, marker: "property-mutation-receipt-legacy-action-history-drift" },
    { name: "partial-receipt-schema", injection: "ALTER TABLE biz_property_mutation_receipt ADD COLUMN receipt_contract_version varchar(16);", marker: "property-mutation-receipt-partial-preexisting-drift" },
    { name: "projection-definition-drift", injection: "ALTER FUNCTION public.fn_property_task_projection_replace_v1(varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,char,varchar,char,varchar,jsonb) STABLE;", marker: "property-task-projection-000194-preexisting-definition-drift" }
  ];
  const baseline = fullStateFingerprint();
  const results = cases.map((item) => {
    const attempted = psql(`BEGIN;\n${item.injection}\n${migration}`, { allowFailure: true });
    const diagnostic = `${attempted.stdout}\n${attempted.stderr}`;
    if (attempted.status === 0 || !diagnostic.includes(item.marker)) {
      throw new Error(`migration negative did not fail at signed marker: ${item.name}:${diagnostic}`);
    }
    const after = fullStateFingerprint();
    if (after !== baseline) throw new Error(`migration negative did not rollback exactly: ${item.name}`);
    return { case: item.name, expected_marker: item.marker, observed_status: attempted.status,
      before_sha256: baseline, after_sha256: after, transaction_rollback_exact: true };
  });
  return { schema_version: "b2a-c3-0-migration-negative-v1", status: "passed", cases: results };
}

function stateFingerprint() {
  return fullStateFingerprint();
}

function gitValue(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function writeArtifacts(candidate, sidecars) {
  const files = {
    catalog: artifactTargets.catalog,
    functions: artifactTargets.functions,
    security: artifactTargets.security
  };
  for (const [key, path] of Object.entries(files)) {
    writeFileSync(path, `${JSON.stringify(sidecars[key], null, 2)}\n`, { flag: "wx" });
  }
  const sidecarHashes = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, {
    path: path.slice(root.length + 1), raw_sha256: sha256(readFileSync(path))
  }]));
  candidate.sidecars = sidecarHashes;
  candidate.detached_manifest = {
    path: artifactTargets.manifest.slice(root.length + 1),
    binds_candidate_main_hash: true,
    deliberately_not_self_embedded: true
  };
  writeFileSync(artifactTargets.candidate, `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
  const candidateHash = sha256(readFileSync(artifactTargets.candidate));
  const manifest = `${freezeDiagnostic ? "property-remediation-b2a-c3-0-freeze-diagnostic-manifest-v1" : "property-remediation-b2a-c3-0-candidate-manifest-v1"}\n` +
    `run_id\t${runId}\n` +
    `candidate\t${artifactTargets.candidate.slice(root.length + 1)}\t${candidateHash}\n` +
    `migration\t${migration195}\t${candidate.migration.raw_sha256}\n` +
    `runner\t${candidate.runner.path}\t${candidate.runner.raw_sha256}\n` +
    Object.entries(sidecarHashes).map(([key, value]) => `${key}\t${value.path}\t${value.raw_sha256}\n`).join("") +
    (inputFreeze?.files ?? []).map((file) => `input\t${file.path}\t${file.raw_sha256}\n`).join("");
  writeFileSync(artifactTargets.manifest, manifest, { flag: "wx" });
  return { artifact_path: artifactTargets.candidate, artifact_raw_sha256: candidateHash,
    manifest_path: artifactTargets.manifest, manifest_raw_sha256: sha256(readFileSync(artifactTargets.manifest)) };
}

let status = "failed";
let error = null;
let preflight = null;
let negativeHistory = null;
let history = null;
let contractTests = null;
let rerun = null;
let catalog = null;
let functions = null;
let security = null;
let migration194History = null;
let migrationNegatives = null;
let legacyCompatibility = null;
let diagnosticFreeze = null;
let inputsAfter = null;
let inputsAfterCleanup = null;
inputFreeze = captureInputs("before-docker-start");
try {
  start();
  bootstrap();
  migration194History = assertMigration194History();
  preflight = assertFreshHistory("formal-before-000195-reservation");
  if (freezeDiagnostic) {
    applyFile(migration195);
    recordHistory(migration195);
    history = historyEvidence();
    diagnosticFreeze = freezeDiagnosticEvidence();
    functions = diagnosticFreeze;
    catalog = catalogEvidence();
    security = securityEvidence();
    inputsAfter = assertInputsFrozen("after-freeze-diagnostic");
    status = "diagnostic-collected";
  } else {
    negativeHistory = historyNegativeGate();
    migrationNegatives = migrationNegativeGate();
    const legacyBefore = seedLegacyReceipts();
    applyFile(migration195);
    recordHistory(migration195);
    history = historyEvidence();
    legacyCompatibility = assertLegacyReceiptsPreserved(legacyBefore);
    contractTests = runContractTests(legacyBefore.hook);
    const before = stateFingerprint();
    const rerunResult = applyFile(migration195, { allowFailure: true });
    if (rerunResult.status !== 0) {
      throw new Error(`000195 rerun failed: ${rerunResult.stderr}`);
    }
    const after = stateFingerprint();
    if (before !== after) throw new Error(`000195 rerun was not an exact no-op: ${before} != ${after}`);
    rerun = { status: "passed", before_sha256: before, after_sha256: after, exact_no_op: true };
    catalog = catalogEvidence();
    functions = functionEvidence();
    security = securityEvidence();
    inputsAfter = assertInputsFrozen("after-formal-gate");
    status = "passed";
  }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  cleanupEvidence = cleanup();
  if (cleanupEvidence.status !== "passed") {
    status = "failed";
    error ??= `cleanup failed: ${JSON.stringify(cleanupEvidence)}`;
  }
  try {
    inputsAfterCleanup = assertInputsFrozen("after-cleanup");
  } catch (caught) {
    status = "failed";
    error ??= caught instanceof Error ? caught.message : String(caught);
  }
}

const migrationBytes = readFileSync(resolve(migrations, migration195));
const candidate = {
  schema_version: "property-remediation-b2a-c3-0-schema-gate-v1",
  run_id: runId,
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  status,
  candidate_admissible: status === "passed" && !freezeDiagnostic,
  execution_mode: freezeDiagnostic ? "freeze-diagnostic-first-apply-only" : "formal-candidate",
  error,
  base_commit: gitValue(["rev-parse", "HEAD"]),
  branch: gitValue(["branch", "--show-current"]),
  worktree_dirty: gitValue(["status", "--porcelain"]).length > 0,
  chain,
  artifact_preflight: artifactPreflightEvidence,
  input_freeze_before: inputFreeze,
  input_freeze_after: inputsAfter,
  input_freeze_after_cleanup: inputsAfterCleanup,
  migration: { filename: migration195, raw_sha256: sha256(migrationBytes) },
  runner: { path: fileURLToPath(import.meta.url).slice(root.length + 1), raw_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))) },
  environment: {
    ...containerIdentity,
    cpu_model: cpus()[0]?.model ?? null,
    cpu_count: cpus().length,
    ram_bytes: totalmem(),
    ram_free_bytes_at_artifact: freemem(),
    os: `${platform()} ${release()}`
  },
  history_preflight: preflight,
  migration_000194_history: migration194History,
  history_negative: negativeHistory,
  migration_negative: migrationNegatives,
  migration_history: history,
  legacy_compatibility: legacyCompatibility,
  freeze_diagnostic: diagnosticFreeze,
  contract_tests: contractTests,
  rerun,
  cleanup: cleanupEvidence,
  review: { architecture_database: "pending", test_security: "pending", product_compatibility: "pending", open_p0_p1: "not_computed" }
};

const written = writeArtifacts(candidate, { catalog, functions, security });
process.stdout.write(`${JSON.stringify({ status, run_id: runId, ...written })}\n`);
if (status !== "passed" && status !== "diagnostic-collected") process.exitCode = 1;
