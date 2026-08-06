/* global process, setTimeout */
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, statSync, writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  OFFICIAL_POSTGRES_IMAGE, assertExactEphemeralPostgresContainer,
  assertNoDatabaseUrlOverrides, buildEphemeralPostgresRunArgs,
  resolveCreatedContainerId, runDocker, validateRunId
} from "../bootstrap/ephemeral-postgres.mjs";
import {
  loadReviewedBootstrapContract, verifyReviewedMigration175Rollback
} from "../lib/reviewed-bootstrap-contract.mjs";
import { fixtureCopyChunks } from "../lib/sql-fixture.mjs";
import { loadProfile, rowsForTable, VALID_TEST_PNG } from "../lib/profile.mjs";
import { cleanupExactLifecycle } from "../track-b2a-c4-runtime-lifecycle.mjs";
import { MODULE_CORE_TEST_PREREQUISITE_SQL } from "../track-b-module-core-gate.mjs";
import { canonicalize, sha256 } from "../lib/canonical.mjs";
import {
  EXPECTED_MUTATIONS_PATH, EXTENSION_PROFILE_PATH, EXTENSION_TABLES,
  SERVICE_NEGATIVE_SCENARIOS,
  computeExtensionFixtureSha, extensionCleanupPlan, extensionResidualSql,
  extensionRows, extensionWritePlan, loadExtensionProfile, negativeScenarioSql
} from "./fixture.mjs";
import {
  AUTHORITIES, assertFrozenInputsEqual, computeCombinedChecksum,
  extensionGeneratorSha256, extensionSelectSql, fingerprintABaseDatabase,
  fingerprintABaseFiles, freezeAuthoritativeInputs, validateExtensionState
} from "./validator.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const apiRoot = resolve(root, "apps/api");
const staticSpec = resolve(root, "scripts/e2e/property-remediation/b-extension/runner.spec.mjs");
const migrationRoot = resolve(root, "database/migrations");
const artifactRoot = resolve(root, "artifacts/property-remediation/runs");
const fixtureLabel = "pr192-b-extension-core";
const image = OFFICIAL_POSTGRES_IMAGE;
const databaseName = "pr192_b_extension_core";
const postgresUser = "pr192_b_extension";
const initMarker = "PostgreSQL init process complete; ready for start up.";

const forwardMigrations = [
  "000184_property_workbench_read_permissions.sql",
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
const reservedAbsentMigrations = [191, 192];
const serviceSpecs = [
  {
    evidence_ids: ["svc:maker-checker"],
    path: "src/modules/property-approvals/property-approval.decision.spec.ts"
  },
  {
    evidence_ids: ["svc:expired-source-version"],
    path: "src/modules/property-tasks/property-task.orchestrator.spec.ts"
  }
];
const supportSpecs = [
  "src/modules/property-approvals/outbox/property-event-runtime.repository.spec.ts"
];
const eventRuntimePgEvidenceIds = Object.freeze([
  "pg:event-stale-fence", "pg:event-order-dedupe"
]);
const gateOwnedPgEvidenceIds = Object.freeze([
  "pg:outbox-retry-dlq", "pg:approval-lease-cas", "pg:consumer-replay-closure"
]);
const taskRuntimePgEvidenceIds = Object.freeze(["pg:task-claim-race"]);

function profileBindings(profile, evidenceIds, expectedKind) {
  return evidenceIds.map((evidenceId) => {
    const matches = profile.negative_scenarios.filter((item) => item.evidence_id === evidenceId);
    if (matches.length !== 1 || matches[0].kind !== expectedKind || !matches[0].target) {
      throw new Error(`B-extension profile executor binding invalid:${evidenceId}`);
    }
    return matches[0];
  });
}

function posixRelative(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseTap(output, expected = null) {
  const lines = output.replaceAll("\r\n", "\n").split("\n");
  if (lines.some((line) => /^\s*not ok\b/u.test(line)
    || /^\s*ok\b.*#\s*(SKIP|TODO)\b/iu.test(line))) {
    throw new Error("TAP contains failure, skip, or todo");
  }
  const read = (name) => {
    const matches = lines.map((line) => line.match(new RegExp(`^# ${name} (\\d+)$`, "u")))
      .filter(Boolean);
    if (matches.length !== 1) throw new Error(`TAP missing ${name}`);
    return Number(matches[0][1]);
  };
  const result = { tests: read("tests"), pass: read("pass"), fail: read("fail"),
    skipped: read("skipped") };
  if ((expected !== null && result.tests !== expected) || result.tests !== result.pass
    || result.fail !== 0 || result.skipped !== 0) {
    throw new Error(`TAP mismatch:${JSON.stringify(result)}`);
  }
  return result;
}

export function bindExactTapTargets(output, targets) {
  const lines = output.replaceAll("\r\n", "\n").split("\n").map((line) => line.trimStart());
  const evidence = [];
  for (const target of targets) {
    const subtests = lines.filter((line) => line === `# Subtest: ${target}`);
    const passed = lines.filter((line) => new RegExp(`^ok \\d+ - ${target.replace(
      /[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u").test(line));
    const rejected = lines.filter((line) => new RegExp(`^(?:not ok|ok) \\d+ - ${target.replace(
      /[.*+?^${}()|[\]\\]/gu, "\\$&")} # (?:SKIP|TODO)`, "iu").test(line));
    if (subtests.length !== 1 || passed.length !== 1 || rejected.length !== 0) {
      throw new Error(`B-extension exact TAP target did not pass once:${target}`);
    }
    evidence.push({ name: target, name_raw_sha256: sha256(target), exact_pass_count: 1 });
  }
  return evidence;
}

function runLocalGates(profile) {
  const staticRun = spawnSync(process.execPath, [staticSpec], {
    cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024
  });
  if (staticRun.error || staticRun.status !== 0) {
    throw new Error(`B-extension static gate failed:${staticRun.error?.message ?? staticRun.stderr}`);
  }
  const staticTap = parseTap(staticRun.stdout);
  const services = serviceSpecs.map(({ evidence_ids: evidenceIds, path }) => {
    const bindings = profileBindings(profile, evidenceIds, "service");
    const absolute = resolve(apiRoot, path);
    const args = ["--require", "ts-node/register", path];
    const run = spawnSync(process.execPath, args, {
      cwd: apiRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024
    });
    if (run.error || run.status !== 0) {
      throw new Error(`B-extension service gate failed:${bindings.map((item) =>
        item.scenario).join(",")}:`
        + `${run.error?.message ?? run.stderr ?? run.stdout}`);
    }
    return {
      bindings, command: [process.execPath, ...args],
      source: posixRelative(absolute),
      source_raw_sha256: sha256(readFileSync(absolute)), tap: parseTap(run.stdout),
      exact_targets: bindExactTapTargets(run.stdout, bindings.map((item) => item.target)),
      stdout_raw_sha256: sha256(run.stdout)
    };
  });
  const support = supportSpecs.map((path) => {
    const absolute = resolve(apiRoot, path);
    const args = ["--require", "ts-node/register", path];
    const run = spawnSync(process.execPath, args, {
      cwd: apiRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024
    });
    if (run.error || run.status !== 0) {
      throw new Error(`B-extension support gate failed:${path}:`
        + `${run.error?.message || run.stderr || run.stdout || `exit=${run.status}`}`);
    }
    return { command: [process.execPath, ...args], source: posixRelative(absolute),
      source_raw_sha256: sha256(readFileSync(absolute)), tap: parseTap(run.stdout),
      stdout_raw_sha256: sha256(run.stdout) };
  });
  return {
    static: { command: [process.execPath, posixRelative(staticSpec)], tap: staticTap,
      stdout_raw_sha256: sha256(staticRun.stdout) },
    services, support
  };
}

export function validateScenarioEvidenceBindings(expectedScenarios, bindings) {
  const scenarios = bindings.map((item) => item.scenario);
  const evidenceIds = bindings.map((item) => item.evidence_id);
  if (bindings.some((item) => !/^[a-z][a-z0-9_]*$/u.test(item.scenario)
    || !/^(?:svc|pg|sql):[a-z0-9-]+$/u.test(item.evidence_id))
    || new Set(scenarios).size !== bindings.length
    || new Set(evidenceIds).size !== bindings.length
    || canonicalize([...scenarios].sort()) !== canonicalize([...expectedScenarios].sort())) {
    throw new Error(`B-extension scenario evidence binding invalid:${canonicalize(bindings)}`);
  }
  const targets = bindings.filter((item) => item.target !== undefined)
    .map((item) => item.target);
  if (targets.some((target) => typeof target !== "string" || !target.trim())
    || new Set(targets).size !== targets.length) {
    throw new Error(`B-extension scenario target binding invalid:${canonicalize(bindings)}`);
  }
  return bindings;
}

function assertRuntimeScenarioEvidence(localGate, runs) {
  const bindings = [
    ...localGate.services.flatMap((service) => service.bindings),
    ...runs.flatMap((run) => run.event_runtime_pg_service_gate.bindings)
  ];
  const scenarios = bindings.map((binding) => binding.scenario);
  const evidenceIds = bindings.map((binding) => binding.evidence_id);
  const targets = bindings.map((binding) => binding.target);
  const unique = [...new Set(scenarios)].sort();
  const expected = [...SERVICE_NEGATIVE_SCENARIOS].sort();
  if (scenarios.length !== unique.length || new Set(evidenceIds).size !== evidenceIds.length
    || new Set(targets).size !== targets.length
    || canonicalize(unique) !== canonicalize(expected)) {
    throw new Error(`B-extension runtime scenario evidence mismatch:${canonicalize(scenarios)}`);
  }
  validateScenarioEvidenceBindings(expected, bindings);
  return { bindings: bindings.sort((left, right) => left.scenario.localeCompare(right.scenario)),
    scenarios: unique, exact_once: true,
    scenarios_raw_sha256: sha256(`${unique.join("\n")}\n`) };
}

function assertCompleteScenarioEvidence(profile, runtimeEvidence, runs) {
  const sqlBindings = runs[0].provision.negative_scenarios.sql_native.map((item) => ({
    scenario: item.scenario, evidence_id: item.evidence_id
  }));
  for (const run of runs.slice(1)) {
    const observed = run.provision.negative_scenarios.sql_native.map((item) => ({
      scenario: item.scenario, evidence_id: item.evidence_id
    }));
    if (canonicalize(observed) !== canonicalize(sqlBindings)) {
      throw new Error("B-extension SQL scenario evidence differs across fresh databases");
    }
  }
  const bindings = [...runtimeEvidence.bindings, ...sqlBindings]
    .sort((left, right) => left.scenario.localeCompare(right.scenario));
  validateScenarioEvidenceBindings(profile.negative_scenarios.map((item) => item.scenario), bindings);
  return { bindings, exact_scenario_count: bindings.length, exact_once: true,
    raw_sha256: sha256(`${bindings.map((item) =>
      `${item.scenario}\t${item.evidence_id}`).join("\n")}\n`) };
}

function inspect(docker, type, target) {
  const args = type === "volume" ? ["volume", "inspect", target]
    : ["inspect", "--type", "container", target];
  const result = docker(args, { allowFailure: true });
  if (result.status !== 0) {
    if (/no such (object|container|volume)/iu.test(`${result.stdout}\n${result.stderr}`)) return null;
    throw new Error(`B-extension docker inspect failed:${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout)[0] ?? null;
}

function createPhysicalFiles(aProfile) {
  const tempRoot = mkdtempSync("/tmp/pr192-b-extension-files-");
  const files = [];
  try {
    for (const row of rowsForTable(aProfile, "sys_file")) {
      const path = resolve(tempRoot, row.storage_path);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, VALID_TEST_PNG, { flag: "wx", mode: 0o600 });
      const bytes = readFileSync(path);
      files.push({ path: row.storage_path, bytes: bytes.length, raw_sha256: sha256(bytes) });
    }
    return { tempRoot, fingerprint: fingerprintABaseFiles(files) };
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function containerHarness({ runId, ordinal }) {
  const containerName = `pr192_b_extension_${runId}_${ordinal}_db`;
  const postgresPassword = `${runId}_${ordinal}_local_only`;
  const docker = (args, options = {}) => runDocker(args, { cwd: root, ...options });
  let creationAttempted = false;
  let containerId = null;
  let volumeName = null;
  let hostPort = null;
  const validate = (observed, loopback = false, running = false) =>
    assertExactEphemeralPostgresContainer(observed, {
      containerName, databaseName, fixtureLabel, runId: `${runId}_${ordinal}`,
      expectedImage: image, requireLoopbackPort: loopback, requireRunning: running
    });
  const psql = (input, { tuplesOnly = false, allowFailure = false } = {}) => {
    if (!containerId) throw new Error("B-extension PostgreSQL is unavailable");
    return docker(["exec", "-i", containerId, "psql", "-X",
      ...(tuplesOnly ? ["-qAt", "-F", "\t"] : ["-q"]),
      "-v", "ON_ERROR_STOP=1", "-U", postgresUser, "-d", databaseName],
    { input, allowFailure });
  };
  const queryJson = async (sql) => {
    const statement = sql.trim().replace(/;$/u, "");
    const result = psql(
      `SELECT COALESCE(jsonb_agg(payload),'[]'::jsonb) FROM (${statement}) payload;\n`,
      { tuplesOnly: true }
    );
    return JSON.parse(result.stdout.trim());
  };
  const cleanup = () => cleanupExactLifecycle({
    creationAttempted, containerName, containerId, volumeName,
    inspectContainer: (name) => inspect(docker, "container", name),
    inspectVolume: (name) => inspect(docker, "volume", name),
    validateContainer: (observed) => validate(observed, false, false),
    removeContainer: (id) => docker(["rm", "-f", "-v", id]),
    removeVolume: (name) => docker(["volume", "rm", name])
  });
  return {
    psql, queryJson, authority: () => ({ container_name: containerName, container_id: containerId,
      anonymous_volume_name: volumeName, host_port: hostPort }),
    runEventRuntimePgSuite(profile) {
      const gateDatabase = `pr192_bext_pg_${runId}_${ordinal}`;
      if (!containerId || !hostPort || !/^[a-z][a-z0-9_]{0,62}$/u.test(gateDatabase)) {
        throw new Error("B-extension PG service gate unavailable");
      }
      let created = false;
      let evidence = null;
      let primaryError = null;
      try {
        psql(`CREATE DATABASE ${gateDatabase} WITH TEMPLATE ${databaseName} OWNER ${postgresUser};`);
        created = true;
        const pgSpecs = [
          { path: "src/modules/property-approvals/outbox/property-event-runtime.pg.spec.ts",
            targets: profileBindings(profile, eventRuntimePgEvidenceIds, "pg") },
          { path: "src/modules/property-approvals/outbox/"
              + "property-event-runtime.c2-v11.pg.spec.ts",
            targets: profileBindings(profile, gateOwnedPgEvidenceIds, "pg") },
          { path: "src/modules/property-tasks/property-task.runtime.pg.spec.ts",
            targets: profileBindings(profile, taskRuntimePgEvidenceIds, "pg"),
            extraEnv: { PROPERTY_B2A_C4_PG_URL: `postgresql://${postgresUser}:`
              + `${encodeURIComponent(postgresPassword)}@127.0.0.1:${hostPort}/${gateDatabase}`,
            PROPERTY_TASK_PG_GATE_REQUIRED: "1" } }
        ];
        const executions = pgSpecs.map(({ path, targets, extraEnv = {} }) => {
          const absolute = resolve(apiRoot, path);
          const args = ["--require", "ts-node/register", absolute];
          const run = spawnSync(process.execPath, args, {
            cwd: apiRoot, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
            env: { ...process.env, PROPERTY_RUNTIME_PG_URL: `postgresql://${postgresUser}:`
              + `${encodeURIComponent(postgresPassword)}@127.0.0.1:${hostPort}/${gateDatabase}`,
            ...extraEnv }
          });
          if (run.error || run.status !== 0) {
            throw new Error(`B-extension event runtime PG suite failed:${posixRelative(absolute)}:`
              + `${run.error?.message || run.stderr || run.stdout || `exit=${run.status}`}`);
          }
          return { bindings: targets,
            command: [process.execPath, ...args], source: posixRelative(absolute),
            source_raw_sha256: sha256(readFileSync(absolute)), tap: parseTap(run.stdout),
            exact_targets: bindExactTapTargets(run.stdout, targets.map((target) => target.target)),
            stdout_raw_sha256: sha256(run.stdout) };
        });
        evidence = { bindings: executions.flatMap((run) => run.bindings),
          executions, database_sha256: sha256(gateDatabase) };
      } catch (error) {
        primaryError = error;
      } finally {
        if (created) {
          const dropped = psql(`DROP DATABASE ${gateDatabase} WITH (FORCE);`, { allowFailure: true });
          const residual = psql(`SELECT count(*) FROM pg_database
            WHERE datname=${sqlLiteral(gateDatabase)};`, { tuplesOnly: true, allowFailure: true });
          if (dropped.status !== 0 || residual.status !== 0 || residual.stdout.trim() !== "0") {
            primaryError = new Error("B-extension PG suite exact database cleanup failed", {
              cause: primaryError ?? undefined
            });
          }
        }
      }
      if (primaryError) throw primaryError;
      return { ...evidence, exact_database_cleanup: true };
    },
    start() {
      if (inspect(docker, "container", containerName)) {
        throw new Error(`exclusive B-extension container exists:${containerName}`);
      }
      creationAttempted = true;
      const exactRunId = `${runId}_${ordinal}`;
      const created = docker(buildEphemeralPostgresRunArgs({
        containerName, databaseName, fixtureLabel, runId: exactRunId,
        postgresUser, postgresPassword
      }));
      const observed = inspect(docker, "container", containerName);
      const exact = validate(observed, true, true);
      containerId = resolveCreatedContainerId(created.stdout, observed, {
        containerName, databaseName, fixtureLabel, runId: exactRunId,
        expectedImage: image, requireLoopbackPort: true
      });
      volumeName = exact.volumeName;
      hostPort = exact.hostPort;
    },
    async waitReady() {
      let stable = 0;
      for (let attempt = 0; attempt < 180 && stable < 2; attempt += 1) {
        const observed = inspect(docker, "container", containerName);
        const exact = validate(observed, true, true);
        if (exact.containerId !== containerId || exact.volumeName !== volumeName
          || exact.hostPort !== hostPort) throw new Error("B-extension Docker authority drift");
        const logs = docker(["logs", "--tail", "80", containerId], { allowFailure: true });
        const ready = docker(["exec", containerId, "pg_isready", "-U", postgresUser,
          "-d", databaseName], { allowFailure: true });
        stable = logs.status === 0 && logs.stdout.includes(initMarker) && ready.status === 0
          ? stable + 1 : 0;
        if (stable < 2) await new Promise((done) => setTimeout(done, 250));
      }
      if (stable < 2) throw new Error("B-extension PostgreSQL readiness timeout");
    },
    cleanup
  };
}

function ensureDualHistory(harness) {
  harness.psql(`CREATE TABLE IF NOT EXISTS public.schema_migrations
    (LIKE public.sys_schema_migration_history INCLUDING ALL);`);
}

function writeHistory(harness, entry, status, errorMessage = null) {
  const error = errorMessage === null ? "NULL" : sqlLiteral(errorMessage.slice(0, 2000));
  for (const table of ["sys_schema_migration_history", "schema_migrations"]) {
    harness.psql(`INSERT INTO public.${table}
      (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
      VALUES (${sqlLiteral(entry.filename)},${sqlLiteral(entry.sha256)},${sqlLiteral(status)},
        clock_timestamp(),clock_timestamp(),${error},'b-extension-core','b-extension-v1')
      ON CONFLICT (filename) DO UPDATE SET checksum=EXCLUDED.checksum,status=EXCLUDED.status,
        finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,
        updated_at=clock_timestamp();`);
  }
}

function applyEntry(harness, entry) {
  const applied = harness.psql(entry.sql, { allowFailure: true });
  if (applied.status !== 0) {
    throw new Error(`B-extension migration failed:${entry.filename}:`
      + `${applied.stderr || applied.stdout}`);
  }
}

function historySql() {
  return `SELECT store||'|'||filename||'|'||checksum||'|'||status FROM (
    SELECT 'primary' store,filename,checksum,status FROM sys_schema_migration_history
    UNION ALL SELECT 'compat',filename,checksum,status FROM schema_migrations
  ) h ORDER BY filename COLLATE "C",store COLLATE "C";`;
}

function readHistory(harness) {
  const raw = harness.psql(historySql(), { tuplesOnly: true }).stdout.replaceAll("\r\n", "\n");
  return { raw, raw_sha256: sha256(raw), rows: raw.trim() ? raw.trimEnd().split("\n") : [] };
}

function migrationStateFingerprint(harness) {
  const sql = `WITH catalog AS (
    SELECT 'column' kind,c.table_schema||'.'||c.table_name||'.'||c.column_name identity,
      concat_ws('|',c.data_type,c.udt_name,c.is_nullable,c.column_default) definition
    FROM information_schema.columns c WHERE c.table_schema='public'
    UNION ALL
    SELECT 'constraint',n.nspname||'.'||r.relname||'.'||c.conname,
      pg_get_constraintdef(c.oid,true)
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'
    UNION ALL
    SELECT 'index',schemaname||'.'||tablename||'.'||indexname,indexdef
      FROM pg_indexes WHERE schemaname='public'
    UNION ALL
    SELECT 'function',n.nspname||'.'||p.proname||'.'||p.oid::text,pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    UNION ALL
    SELECT 'trigger',n.nspname||'.'||r.relname||'.'||t.tgname,pg_get_triggerdef(t.oid,true)
      FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal
  ) SELECT kind||E'\\t'||identity||E'\\t'||definition FROM catalog
    ORDER BY kind COLLATE "C",identity COLLATE "C",definition COLLATE "C";`;
  const raw = harness.psql(sql, { tuplesOnly: true }).stdout.replaceAll("\r\n", "\n");
  return { raw_sha256: sha256(raw), bytes: Buffer.byteLength(raw), row_count:
    raw.trim() ? raw.trimEnd().split("\n").length : 0 };
}

async function applyReviewedChain(harness, reviewed) {
  const before175 = reviewed.entries.filter((entry) => entry.number < 175);
  const after175 = reviewed.entries.filter((entry) => entry.number > 175);
  const appliedBeforeHistory = [];
  for (const entry of before175) {
    applyEntry(harness, entry);
    if (entry.number < 139) appliedBeforeHistory.push(entry);
    if (entry.number === 139) {
      ensureDualHistory(harness);
      for (const prior of [...appliedBeforeHistory, entry]) writeHistory(harness, prior, "succeeded");
    } else if (entry.number > 139) writeHistory(harness, entry, "succeeded");
  }
  const rollback175 = await verifyReviewedMigration175Rollback({
    migration: reviewed.migration175, psql: async (sql, options) => harness.psql(sql, options)
  });
  writeHistory(harness, reviewed.migration175, "failed",
    "reviewed empty-database fail-fast; transaction rolled back with exact zero residual");
  for (const entry of after175) {
    applyEntry(harness, entry);
    writeHistory(harness, entry, "succeeded");
  }
  return { bootstrap_sha256: reviewed.bootstrapSha256, applied_before_175: before175.length,
    reviewed_175_rollback: rollback175, applied_after_175: after175.length };
}

function forwardEntries() {
  const migrationFiles = readdirSync(migrationRoot);
  for (const number of reservedAbsentMigrations) {
    const prefix = `000${number}_`;
    const found = migrationFiles.filter((name) => name.startsWith(prefix));
    if (found.length !== 0) throw new Error(`reserved migration files present:${found.join(",")}`);
  }
  return forwardMigrations.map((filename) => {
    const path = resolve(migrationRoot, filename);
    if (!existsSync(path)) throw new Error(`approved forward migration missing:${filename}`);
    const sql = readFileSync(path, "utf8");
    return { filename, number: Number(filename.slice(0, 6)), sql, sha256: sha256(sql) };
  });
}

function applyForwardChain(harness, entries) {
  const applied = [];
  for (const entry of entries) {
    applyEntry(harness, entry);
    writeHistory(harness, entry, "succeeded");
    const before = migrationStateFingerprint(harness);
    const historyBefore = readHistory(harness);
    applyEntry(harness, entry);
    const after = migrationStateFingerprint(harness);
    const historyAfter = readHistory(harness);
    if (before.raw_sha256 !== after.raw_sha256 || historyBefore.raw !== historyAfter.raw) {
      throw new Error(`B-extension immediate forward rerun was not exact no-op:${entry.filename}`);
    }
    applied.push({
      filename: entry.filename, raw_sha256: entry.sha256, status: "succeeded",
      before_sha256: before.raw_sha256, after_sha256: after.raw_sha256,
      schema_fingerprint_byte_equal: true, history_byte_equal: true
    });
  }
  return { applied_rows: applied.length, applied, schema_fingerprint_byte_equal: true,
    history_byte_equal: true, mode: "immediate-before-successor" };
}

async function directRerunNoop(harness, reviewed, forwards, forwardRerun) {
  const reviewedSucceeded = reviewed.entries.filter((entry) => entry.number !== 175);
  const historyBefore = readHistory(harness);
  const before = migrationStateFingerprint(harness);
  const skipped = [];
  for (const entry of reviewedSucceeded) {
    const query = harness.psql(`SELECT checksum||'|'||status FROM sys_schema_migration_history
      WHERE filename=${sqlLiteral(entry.filename)}
      UNION ALL SELECT checksum||'|'||status FROM schema_migrations
      WHERE filename=${sqlLiteral(entry.filename)} ORDER BY 1;`, { tuplesOnly: true });
    const exact = query.stdout.trim().split("\n");
    if (exact.length !== 2 || exact.some((row) => row !== `${entry.sha256}|succeeded`)) {
      throw new Error(`B-extension rerun history mismatch:${entry.filename}`);
    }
    skipped.push({ filename: entry.filename, raw_sha256: entry.sha256, status: "skipped" });
  }
  for (const entry of forwards) {
    const query = harness.psql(`SELECT checksum||'|'||status FROM sys_schema_migration_history
      WHERE filename=${sqlLiteral(entry.filename)}
      UNION ALL SELECT checksum||'|'||status FROM schema_migrations
      WHERE filename=${sqlLiteral(entry.filename)} ORDER BY 1;`, { tuplesOnly: true });
    const exact = query.stdout.trim().split("\n");
    if (exact.length !== 2 || exact.some((row) => row !== `${entry.sha256}|succeeded`)) {
      throw new Error(`B-extension rerun history mismatch:${entry.filename}`);
    }
  }
  const rollback175 = await verifyReviewedMigration175Rollback({
    migration: reviewed.migration175, psql: async (sql, options) => harness.psql(sql, options)
  });
  const failed175 = harness.psql(`SELECT checksum||'|'||status FROM (
    SELECT checksum,status FROM sys_schema_migration_history WHERE filename=${sqlLiteral(reviewed.migration175.filename)}
    UNION ALL SELECT checksum,status FROM schema_migrations WHERE filename=${sqlLiteral(reviewed.migration175.filename)}
  ) h ORDER BY 1;`, { tuplesOnly: true }).stdout.trim().split("\n");
  if (failed175.length !== 2
    || failed175.some((row) => row !== `${reviewed.migration175.sha256}|failed`)) {
    throw new Error("B-extension reviewed 175 dual-history mismatch");
  }
  const reserved = harness.psql(`SELECT count(*) FROM (
    SELECT filename FROM sys_schema_migration_history UNION ALL SELECT filename FROM schema_migrations
  ) h WHERE filename ~ '^00019[12]_';`, { tuplesOnly: true }).stdout.trim();
  if (reserved !== "0") throw new Error(`B-extension 191/192 history occupied:${reserved}`);
  const after = migrationStateFingerprint(harness);
  const historyAfter = readHistory(harness);
  if (before.raw_sha256 !== after.raw_sha256) {
    throw new Error(`B-extension direct rerun changed schema fingerprint:`
      + `${before.raw_sha256}:${after.raw_sha256}`);
  }
  if (historyBefore.raw !== historyAfter.raw) {
    throw new Error("B-extension direct rerun changed dual history");
  }
  return { ...forwardRerun, skipped_succeeded: skipped.length, skipped,
    reviewed_175_rollback: rollback175, history_before: before, history_after: after,
    dual_history_before: historyBefore, dual_history_after: historyAfter,
    history_byte_equal: historyBefore.raw === historyAfter.raw,
    schema_fingerprint_byte_equal: before.raw_sha256 === after.raw_sha256,
    reserved_191_192_rows: Number(reserved) };
}

function parseState(lines, begin, end, profile, aProfile) {
  const start = lines.indexOf(begin);
  const finish = lines.indexOf(end);
  if (start < 0 || finish <= start) throw new Error(`B-extension state markers missing:${begin}`);
  const raw = `${lines.slice(start + 1, finish).filter(Boolean).join("\n")}\n`;
  const observedRows = {};
  for (const line of raw.trimEnd().split("\n")) {
    const separator = line.indexOf("\t");
    if (separator < 1) throw new Error(`invalid B-extension state row:${line}`);
    observedRows[line.slice(0, separator)] = JSON.parse(line.slice(separator + 1));
  }
  return { raw, raw_sha256: sha256(raw),
    state: validateExtensionState({ observedRows, profile, aBaseProfile: aProfile }) };
}

function parseAffected(lines) {
  const output = {};
  for (const line of lines.filter((value) => value.startsWith("B_EXTENSION_AFFECTED|"))) {
    const [, pass, table, countText] = line.split("|");
    if (!Object.values(EXTENSION_TABLES).includes(table) || !["first", "second"].includes(pass)) {
      throw new Error(`invalid B-extension affected marker:${line}`);
    }
    output[`${pass}:${table}`] = Number(countText);
  }
  return output;
}

function assertAffected(affected, profile, pass, expectedMode) {
  for (const [logical, table] of Object.entries(EXTENSION_TABLES)) {
    const key = `${pass}:${table}`;
    const expected = expectedMode === "fixture" ? profile.expected_counts[logical] : 0;
    if (affected[key] !== expected) {
      throw new Error(`B-extension affected rows mismatch:${key}:${affected[key]}!=${expected}`);
    }
  }
}

function parseNegative(lines, profile) {
  const sqlEvidence = lines.filter((line) => line.startsWith("B_EXTENSION_NEGATIVE|"))
    .map((line) => {
      const [, scenario, evidenceId, sqlstate, affected, delta, uniqueWinners,
        constraintName, passedRaw]
        = line.split("|");
      if (!new Set(["0", "1"]).has(passedRaw)) {
        throw new Error(`invalid B-extension negative boolean marker:${line}`);
      }
      return { scenario, evidence_id: evidenceId, sqlstate,
        affected: Number(affected), delta: Number(delta),
        unique_winners: Number(uniqueWinners), constraint_name: constraintName || null,
        passed: passedRaw === "1" };
    });
  const serviceNames = new Set(SERVICE_NEGATIVE_SCENARIOS);
  const native = sqlEvidence.filter((item) => !serviceNames.has(item.scenario));
  const failedNative = native.filter((item) => !item.passed);
  if (failedNative.length) {
    throw new Error(`B-extension negative SQL scenario failed:${canonicalize(failedNative)}`);
  }
  const observedBindings = native.map(({ scenario, evidence_id }) => ({ scenario, evidence_id }))
    .sort((left, right) => left.scenario.localeCompare(right.scenario));
  const expectedBindings = profile.negative_scenarios.filter((item) => item.kind === "sql")
    .map(({ scenario, evidence_id }) => ({ scenario, evidence_id }))
    .sort((left, right) => left.scenario.localeCompare(right.scenario));
  if (canonicalize(observedBindings) !== canonicalize(expectedBindings)) {
    throw new Error(`B-extension SQL scenario evidence binding mismatch:`
      + `${canonicalize(observedBindings)}`);
  }
  const combined = [...serviceNames, ...native.map((item) => item.scenario)].sort();
  const expected = profile.negative_scenarios.map((item) => item.scenario).sort();
  if (canonicalize(combined) !== canonicalize(expected)) {
    throw new Error(`B-extension negative scenario set mismatch:${canonicalize(combined)}`);
  }
  return { sql_native: native, service_scenarios: [...serviceNames].sort(), total: combined.length,
    exact_scenarios_sha256: sha256(`${combined.join("\n")}\n`) };
}

const closureTables = Object.freeze({
  identity_queue: ["identity_queue", EXTENSION_TABLES.identity_queue],
  identity_snapshot: ["identity_snapshot", EXTENSION_TABLES.identity_snapshot],
  identity_submission: ["identity_submission", EXTENSION_TABLES.identity_submission],
  approval_request: ["approval_request", EXTENSION_TABLES.approval_request],
  approval_stage: ["approval_stage", EXTENSION_TABLES.approval_stage],
  approval_decision: ["approval_decision", EXTENSION_TABLES.approval_decision],
  approval_audit: ["approval_audit", EXTENSION_TABLES.approval_audit],
  approval_effect_manifest: ["effect_manifest", EXTENSION_TABLES.effect_manifest],
  approval_effect_receipt: ["effect_receipt", EXTENSION_TABLES.effect_receipt],
  approval_mutation_receipt: ["mutation_receipt", EXTENSION_TABLES.mutation_receipt],
  task_assignment: ["task_assignment", EXTENSION_TABLES.task_assignment],
  task_projection_head: ["task_projection_head", EXTENSION_TABLES.task_projection_head],
  task_projection: ["task_projection", EXTENSION_TABLES.task_projection],
  task_projection_rebuild_audit: ["task_projection_rebuild_audit",
    EXTENSION_TABLES.task_projection_rebuild_audit],
  message_inbox: ["inbox", EXTENSION_TABLES.inbox],
  message_outbox: ["outbox", EXTENSION_TABLES.outbox],
  message_event_dlq: ["event_dlq", EXTENSION_TABLES.event_dlq],
  message_notification: ["notification", EXTENSION_TABLES.notification],
  message_notification_recipient: ["notification_recipient",
    EXTENSION_TABLES.notification_recipient],
  message_delivery: ["notification_delivery", EXTENSION_TABLES.notification_delivery]
});

function closureQueries(profile, aProfile) {
  const fixtureRows = extensionRows(profile, aProfile);
  const scope = fixtureRows.identity_queue[0];
  const tenant = sqlLiteral(scope.tenant_id);
  const park = sqlLiteral(scope.park_id);
  const queries = Object.entries(closureTables).map(([name, [logical, table]]) => {
    const key = logical === "outbox" ? "event_id" : "id";
    const ids = fixtureRows[logical].map((row) => sqlLiteral(row[key])).join(",");
    return { name, expected_count: profile.expected_counts[logical],
      sql: `SELECT * FROM ${table} WHERE tenant_id=${tenant} AND park_id=${park}`
        + ` AND ${key} IN (${ids}) ORDER BY to_jsonb(${table})::text COLLATE "C"` };
  });
  queries.push({
    name: "approval_request_relations",
    sql: `SELECT r.id,
      (SELECT count(*) FROM biz_property_approval_audit a WHERE a.request_id=r.id) audit_count,
      (SELECT count(*) FROM ${EXTENSION_TABLES.effect_manifest} m WHERE m.request_id=r.id) manifest_count,
      (SELECT count(*) FROM ${EXTENSION_TABLES.effect_receipt} e WHERE e.request_id=r.id) receipt_count
      FROM biz_property_approval_request r WHERE r.tenant_id=${tenant} AND r.park_id=${park}
        AND r.id IN (${fixtureRows.approval_request.map((row) => sqlLiteral(row.id)).join(",")})
      ORDER BY r.id`
    , expected_count: profile.expected_counts.approval_request
  });
  queries.push({
    name: "task_assignment_relations",
    sql: `SELECT a.id,
      (SELECT count(*) FROM biz_property_task_projection p
        WHERE p.derived_assignment_id=a.id) projection_count
      FROM biz_property_task_assignment a WHERE a.tenant_id=${tenant} AND a.park_id=${park}
        AND a.id IN (${fixtureRows.task_assignment.map((row) => sqlLiteral(row.id)).join(",")})
      ORDER BY a.id`
    , expected_count: profile.expected_counts.task_assignment
  });
  queries.push({
    name: "message_exact_once_relations",
    sql: `SELECT o.event_id,
      (SELECT count(*) FROM biz_property_inbox i WHERE i.event_id=o.event_id) inbox_count,
      (SELECT count(*) FROM biz_property_notification n WHERE n.source_event_id=o.event_id) notification_count,
      (SELECT count(*) FROM biz_property_notification_delivery d
        JOIN rel_property_notification_recipient rr ON rr.tenant_id=d.tenant_id
          AND rr.park_id=d.park_id AND rr.id=d.recipient_id
        JOIN biz_property_notification n ON n.tenant_id=rr.tenant_id
          AND n.park_id=rr.park_id AND n.id=rr.notification_id
        WHERE n.source_event_id=o.event_id) delivery_count,
      (SELECT count(*) FROM biz_property_event_dlq q WHERE q.original_event_id=o.event_id) dlq_count
      FROM biz_property_outbox o WHERE o.tenant_id=${tenant} AND o.park_id=${park}
        AND o.event_id IN (${fixtureRows.outbox.map((row) => sqlLiteral(row.event_id)).join(",")})
      ORDER BY o.event_id`
    , expected_count: profile.expected_counts.outbox
  });
  return queries;
}

function closureEvidenceSql(profile, aProfile) {
  return closureQueries(profile, aProfile).map(({ name, sql }) =>
    `SELECT 'B_EXTENSION_CLOSURE|${name}|'||COALESCE(`
      + `jsonb_agg(to_jsonb(q) ORDER BY to_jsonb(q)::text)::text,'[]')`
      + ` FROM (${sql}) q;`).join("\n");
}

function closureQueryText(name, sql) {
  return `SELECT 'B_EXTENSION_CLOSURE|${name}|'||COALESCE(`
    + `jsonb_agg(to_jsonb(q) ORDER BY to_jsonb(q)::text)::text,'[]') FROM (${sql}) q;`;
}

function parseClosure(lines, profile, aProfile) {
  const queries = closureQueries(profile, aProfile);
  const fixtureRows = extensionRows(profile, aProfile);
  const deliveryCountByEvent = new Map(fixtureRows.outbox.map((event) => {
    const notificationIds = new Set(fixtureRows.notification.filter((row) =>
      row.source_event_id === event.event_id).map((row) => row.id));
    const recipientIds = new Set(fixtureRows.notification_recipient.filter((row) =>
      notificationIds.has(row.notification_id)).map((row) => row.id));
    return [event.event_id, fixtureRows.notification_delivery.filter((row) =>
      recipientIds.has(row.recipient_id)).length];
  }));
  const observed = new Map();
  for (const line of lines.filter((value) => value.startsWith("B_EXTENSION_CLOSURE|"))) {
    const second = line.indexOf("|", "B_EXTENSION_CLOSURE|".length);
    if (second < 0) throw new Error(`invalid B-extension closure marker:${line}`);
    const name = line.slice("B_EXTENSION_CLOSURE|".length, second);
    observed.set(name, JSON.parse(line.slice(second + 1)));
  }
  const evidence = {};
  for (const query of queries) {
    const rows = observed.get(query.name);
    if (!Array.isArray(rows) || rows.length !== query.expected_count) {
      throw new Error(`B-extension closure cardinality mismatch:${query.name}:`
        + `${rows?.length ?? "not-array"}!=${query.expected_count}`);
    }
    evidence[query.name] = {
      count: rows.length, query_text_sha256: sha256(closureQueryText(query.name, query.sql)),
      canonical_rows_sha256: sha256(canonicalize(rows))
    };
    let expectedRelations = null;
    if (query.name === "approval_request_relations") {
      expectedRelations = fixtureRows.approval_request.map((request) => ({ id: request.id,
        audit_count: fixtureRows.approval_audit.filter((row) => row.request_id === request.id).length,
        manifest_count: fixtureRows.effect_manifest.filter((row) =>
          row.request_id === request.id).length,
        receipt_count: fixtureRows.effect_receipt.filter((row) =>
          row.request_id === request.id).length }));
    } else if (query.name === "task_assignment_relations") {
      expectedRelations = fixtureRows.task_assignment.map((assignment) => ({ id: assignment.id,
        projection_count: fixtureRows.task_projection.filter((row) =>
          row.derived_assignment_id === assignment.id).length }));
    } else if (query.name === "message_exact_once_relations") {
      expectedRelations = fixtureRows.outbox.map((event) => ({ event_id: event.event_id,
        inbox_count: fixtureRows.inbox.filter((row) => row.event_id === event.event_id).length,
        notification_count: fixtureRows.notification.filter((row) =>
          row.source_event_id === event.event_id).length,
        delivery_count: deliveryCountByEvent.get(event.event_id) ?? 0,
        dlq_count: fixtureRows.event_dlq.filter((row) =>
          row.original_event_id === event.event_id).length }));
    }
    const relationKey = query.name === "message_exact_once_relations" ? "event_id" : "id";
    const byRelationKey = (left, right) => String(left[relationKey]).localeCompare(
      String(right[relationKey])
    );
    const observedRelations = rows.map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, key.endsWith("_count") ? Number(value) : value])
    )).sort(byRelationKey);
    if (expectedRelations && canonicalize(observedRelations)
      !== canonicalize(expectedRelations.sort(byRelationKey))) {
      throw new Error(`B-extension exact relation closure mismatch:${query.name}`);
    }
  }
  return evidence;
}

function parseResidual(result, profile, aProfile) {
  const rows = result.stdout.replaceAll("\r\n", "\n").trim().split("\n").filter(Boolean);
  const observed = {};
  for (const line of rows) {
    const [, logical, count] = line.split("|");
    observed[logical] = Number(count);
  }
  for (const logical of Object.keys(profile.expected_counts)) {
    if (observed[logical] !== 0) throw new Error(`B-extension rollback residual:${logical}`);
  }
  return { rows: observed, exact_zero: true, query_raw_sha256: sha256(extensionResidualSql(
    profile, aProfile)), output_raw_sha256: sha256(`${rows.join("\n")}\n`) };
}

function secondPassSql(profile, aProfile) {
  const sql = extensionWritePlan(profile, aProfile, { repeat: 1 }).sql;
  return sql.split("\n").slice(3).join("\n")
    .replaceAll("B_EXTENSION_AFFECTED|first|", "B_EXTENSION_AFFECTED|second|");
}

function runProvisionTransactions(harness, profile, aProfile) {
  const stateSql = extensionSelectSql(profile, aProfile);
  const firstPlan = extensionWritePlan(profile, aProfile, { repeat: 1 });
  const transaction = harness.psql(`${firstPlan.sql}
    \\echo B_EXTENSION_FIRST_STATE_BEGIN
    ${stateSql}
    \\echo B_EXTENSION_FIRST_STATE_END
    ${secondPassSql(profile, aProfile)}
    \\echo B_EXTENSION_SECOND_STATE_BEGIN
    ${stateSql}
    \\echo B_EXTENSION_SECOND_STATE_END
    ${closureEvidenceSql(profile, aProfile)}
    ${negativeScenarioSql(profile, aProfile)}
    ${extensionCleanupPlan()}`, { tuplesOnly: true, allowFailure: true });
  if (transaction.status !== 0) {
    throw new Error(`B-extension first/second provision failed:${transaction.stderr || transaction.stdout}`);
  }
  const lines = transaction.stdout.replaceAll("\r\n", "\n").split("\n");
  const first = parseState(lines, "B_EXTENSION_FIRST_STATE_BEGIN",
    "B_EXTENSION_FIRST_STATE_END", profile, aProfile);
  const second = parseState(lines, "B_EXTENSION_SECOND_STATE_BEGIN",
    "B_EXTENSION_SECOND_STATE_END", profile, aProfile);
  const affected = parseAffected(lines);
  assertAffected(affected, profile, "first", "fixture");
  assertAffected(affected, profile, "second", "zero");
  if (first.raw !== second.raw) throw new Error("B-extension second provision snapshot drift");
  const closureEvidence = parseClosure(lines, profile, aProfile);
  const negative = parseNegative(lines, profile);
  const residualAfterSecond = parseResidual(harness.psql(extensionResidualSql(profile, aProfile),
    { tuplesOnly: true }), profile, aProfile);

  const thirdTransaction = harness.psql(`${extensionWritePlan(profile, aProfile, { repeat: 1 }).sql}
    \\echo B_EXTENSION_THIRD_STATE_BEGIN
    ${stateSql}
    \\echo B_EXTENSION_THIRD_STATE_END
    ${extensionCleanupPlan()}`, { tuplesOnly: true, allowFailure: true });
  if (thirdTransaction.status !== 0) {
    throw new Error(`B-extension third provision failed:${thirdTransaction.stderr || thirdTransaction.stdout}`);
  }
  const thirdLines = thirdTransaction.stdout.replaceAll("\r\n", "\n").split("\n");
  const third = parseState(thirdLines, "B_EXTENSION_THIRD_STATE_BEGIN",
    "B_EXTENSION_THIRD_STATE_END", profile, aProfile);
  const thirdAffected = parseAffected(thirdLines);
  assertAffected(thirdAffected, profile, "first", "fixture");
  if (first.raw !== third.raw) throw new Error("B-extension third provision snapshot drift");
  const residualAfterThird = parseResidual(harness.psql(extensionResidualSql(profile, aProfile),
    { tuplesOnly: true }), profile, aProfile);
  return {
    first, second, third, affected_rows: affected, third_affected_rows: thirdAffected,
    second_affected_rows_zero: true, second_snapshot_byte_equal: first.raw === second.raw,
    third_snapshot_byte_equal: first.raw === third.raw, rollback_residual_after_second: residualAfterSecond,
    rollback_residual_after_third: residualAfterThird, negative_scenarios: negative,
    closure_evidence: closureEvidence,
    rerun_noop: Object.entries(affected).filter(([key]) => key.startsWith("second:"))
      .every(([, count]) => count === 0) && first.raw === second.raw && first.raw === third.raw
  };
}

async function provisionOne({ runId, ordinal, profile, aProfile, expectedFixture }) {
  const harness = containerHarness({ runId, ordinal });
  const physical = createPhysicalFiles(aProfile);
  let cleanup = null;
  let result = null;
  let primaryError = null;
  try {
    harness.start();
    await harness.waitReady();
    const reviewed = loadReviewedBootstrapContract(migrationRoot);
    const bootstrap = await applyReviewedChain(harness, reviewed);
    for (const chunk of fixtureCopyChunks(aProfile)) harness.psql(chunk.sql);
    harness.psql(MODULE_CORE_TEST_PREREQUISITE_SQL);
    const prerequisiteRows = harness.psql(`
      SELECT module_code||'|'||status||'|'||is_deleted::text
      FROM sys_module
      WHERE module_code IN ('asset','homestay','housing_rental')
      ORDER BY module_code COLLATE "C";
    `, { tuplesOnly: true }).stdout.trim().split("\n");
    const expectedPrerequisiteRows = [
      "asset|1|false", "homestay|1|false", "housing_rental|1|false"
    ];
    if (canonicalize(prerequisiteRows) !== canonicalize(expectedPrerequisiteRows)) {
      throw new Error(`B-extension module prerequisite mismatch:${prerequisiteRows.join(",")}`);
    }
    const modulePrerequisite = {
      status: "passed", row_count: prerequisiteRows.length,
      exact_rows_sha256: sha256(`${prerequisiteRows.join("\n")}\n`),
      sql_sha256: sha256(MODULE_CORE_TEST_PREREQUISITE_SQL)
    };
    const forwards = forwardEntries();
    const forwardRerun = applyForwardChain(harness, forwards);
    const migrationRerun = await directRerunNoop(harness, reviewed, forwards, forwardRerun);
    const before = await fingerprintABaseDatabase(harness.queryJson);
    const eventRuntimePgSuite = harness.runEventRuntimePgSuite(profile);
    const provision = runProvisionTransactions(harness, profile, aProfile);
    const afterRollback = await fingerprintABaseDatabase(harness.queryJson);
    if (before.sha256 !== afterRollback.sha256) {
      throw new Error("B-extension rollback changed A-base rows");
    }
    if (provision.first.state.data_sha256 !== expectedFixture.validation_data_sha256) {
      throw new Error("B-extension state checksum is not reproducible");
    }
    result = {
      ordinal, docker_authority: harness.authority(), migration_bootstrap: bootstrap,
      module_prerequisite: modulePrerequisite,
      migration_forward: forwards.map(({ filename, sha256: rawSha256 }) =>
        ({ filename, raw_sha256: rawSha256, status: "succeeded" })),
      migration_direct_rerun: migrationRerun,
      event_runtime_pg_service_gate: eventRuntimePgSuite,
      a_before: before, a_post_cleanup: afterRollback, a_files: physical.fingerprint,
      b_state: provision.first.state, provision, fixture_sha256: expectedFixture.fixture_sha256,
      rerun_noop: provision.rerun_noop && migrationRerun.applied_rows > 0
        && migrationRerun.schema_fingerprint_byte_equal && migrationRerun.history_byte_equal,
      expected_mutations: []
    };
  } catch (error) {
    primaryError = error;
  } finally {
    try { cleanup = harness.cleanup(); } catch (error) {
      primaryError ??= error;
    } finally {
      rmSync(physical.tempRoot, { recursive: true, force: true });
    }
  }
  const physicalAbsent = !existsSync(physical.tempRoot);
  if (!cleanup || cleanup.status !== "passed" || !physicalAbsent) {
    primaryError = new Error(`B-extension exact cleanup failed:${JSON.stringify({ cleanup,
      physical_files_absent: physicalAbsent })}`, { cause: primaryError ?? undefined });
  }
  if (primaryError) {
    primaryError.provision_evidence = { ordinal, cleanup, physical_files_absent: physicalAbsent };
    throw primaryError;
  }
  if (!result) throw new Error("B-extension provision produced no result");
  result.cleanup = cleanup;
  result.physical_files_absent = physicalAbsent;
  return result;
}

function createReservation(runId) {
  const runDirectory = resolve(artifactRoot, runId);
  if (existsSync(runDirectory)) throw new Error(`B-extension runId permanently reserved:${runId}`);
  mkdirSync(runDirectory, { recursive: false, mode: 0o700 });
  if (realpathSync(runDirectory) !== runDirectory || !lstatSync(runDirectory).isDirectory()) {
    throw new Error("B-extension run directory authority invalid");
  }
  const path = resolve(runDirectory, "b-extension-runid.reservation.json");
  const artifactPath = resolve(runDirectory, "b-extension-core-candidate.json");
  const manifestPath = resolve(runDirectory, "b-extension-core-candidate.manifest.txt");
  const value = { schema_version: "property-remediation-b-extension-runid-v1", run_id: runId,
    run_id_sha256: sha256(runId), artifact: posixRelative(artifactPath),
    manifest: posixRelative(manifestPath), reserved_at: new Date().toISOString() };
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  return { runDirectory, path, artifactPath, manifestPath, bytes, value,
    evidence: { path: posixRelative(path),
    bytes: Buffer.byteLength(bytes), raw_sha256: sha256(bytes),
    artifact: value.artifact, manifest: value.manifest,
    mode: (statSync(path).mode & 0o777).toString(8) } };
}

function publishOutcome(reservation, outcome) {
  const { artifactPath, manifestPath } = reservation;
  const reservationBytes = readFileSync(reservation.path, "utf8");
  const reread = JSON.parse(reservationBytes);
  if (reservationBytes !== reservation.bytes
    || sha256(reservationBytes) !== reservation.evidence.raw_sha256
    || (statSync(reservation.path).mode & 0o777) !== 0o600
    || canonicalize(reread) !== canonicalize(reservation.value)
    || reread.run_id !== outcome.run_id
    || reread.artifact !== posixRelative(artifactPath)
    || reread.manifest !== posixRelative(manifestPath)
    || existsSync(artifactPath) || existsSync(manifestPath)) {
    throw new Error("B-extension reservation authority drift before publication");
  }
  if (outcome.reservation.raw_sha256 !== reservation.evidence.raw_sha256
    || outcome.reservation.artifact !== reread.artifact
    || outcome.reservation.manifest !== reread.manifest) {
    throw new Error("B-extension outcome is not bound to reserved outputs");
  }
  const artifactBytes = `${JSON.stringify(outcome, null, 2)}\n`;
  const manifestBytes = `property-remediation-b-extension-core-candidate-v1\n`
    + `run_id\t${outcome.run_id}\nstatus\t${outcome.status}\n`
    + `failed_stage\t${outcome.failed_stage ?? "none"}\n`
    + `reservation\t${outcome.reservation.raw_sha256}\n`
    + `fixture\t${outcome.b_extension_fixture_sha256 ?? "unavailable"}\n`
    + `combined\t${outcome.combined_checksum ?? "unavailable"}\n`
    + `artifact\t${Buffer.byteLength(artifactBytes)}\t${sha256(artifactBytes)}\n`;
  writeFileSync(artifactPath, artifactBytes, { flag: "wx", mode: 0o600 });
  writeFileSync(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
  chmodSync(manifestPath, 0o600);
  chmodSync(artifactPath, 0o600);
  for (const path of [manifestPath, artifactPath]) {
    if ((statSync(path).mode & 0o777) !== 0o600) throw new Error(`artifact mode drift:${path}`);
  }
  return { artifact: posixRelative(artifactPath), manifest: posixRelative(manifestPath),
    artifact_raw_sha256: sha256(artifactBytes), manifest_raw_sha256: sha256(manifestBytes) };
}

function captureFreeze(initialFreeze, stage) {
  try {
    return assertFrozenInputsEqual(initialFreeze, stage);
  } catch (error) {
    return { stage, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runExtensionGate(environment = process.env) {
  assertNoDatabaseUrlOverrides(environment);
  const initialFreeze = freezeAuthoritativeInputs("before-write");
  const runId = validateRunId(environment.PROPERTY_B_EXTENSION_RUN_ID ?? "");
  validateRunId(`${runId}_a`);
  validateRunId(`${runId}_b`);
  const reservation = createReservation(runId);
  let stage = "local-gate";
  let localGate = null;
  let afterLocal = null;
  let afterPg = null;
  let afterCleanup = null;
  let runs = [];
  let outcome = null;
  let expectedFixture = null;
  try {
    const profile = loadExtensionProfile();
    const aProfile = loadProfile();
    const rows = extensionRows(profile, aProfile);
    const baseFixture = computeExtensionFixtureSha({
      profile, rows, profileRawSha256: sha256(readFileSync(EXTENSION_PROFILE_PATH)),
      expectedMutationsRawSha256: sha256(readFileSync(EXPECTED_MUTATIONS_PATH)),
      generatorSha256: extensionGeneratorSha256(),
      authorityFreezeSha256: initialFreeze.raw_sha256
    });
    expectedFixture = { ...baseFixture, validation_data_sha256: validateExtensionState({
      observedRows: rows, profile, aBaseProfile: aProfile }).data_sha256 };
    localGate = runLocalGates(profile);
    afterLocal = assertFrozenInputsEqual(initialFreeze, "after-local");
    stage = "postgres-gate";
    runs.push(await provisionOne({ runId, ordinal: "a", profile, aProfile, expectedFixture }));
    runs.push(await provisionOne({ runId, ordinal: "b", profile, aProfile, expectedFixture }));
    afterPg = assertFrozenInputsEqual(initialFreeze, "after-pg");
    if (runs.some((run) => !run.rerun_noop || !run.physical_files_absent)) {
      throw new Error("B-extension run did not prove exact rerun or cleanup");
    }
    if (runs[0].a_before.sha256 !== runs[1].a_before.sha256
      || runs[0].a_files.sha256 !== runs[1].a_files.sha256
      || runs[0].b_state.data_sha256 !== runs[1].b_state.data_sha256) {
      throw new Error("B-extension two-fresh-database reproducibility drift");
    }
    const runtimeScenarioEvidence = assertRuntimeScenarioEvidence(localGate, [runs[0]]);
    const scenarioEvidence = assertCompleteScenarioEvidence(profile, runtimeScenarioEvidence, runs);
    stage = "cleanup-freeze";
    afterCleanup = assertFrozenInputsEqual(initialFreeze, "after-cleanup");
    const combined = computeCombinedChecksum({ aDatabaseFingerprint: runs[0].a_before,
      aFilesFingerprint: runs[0].a_files, bFixture: expectedFixture });
    outcome = {
      schema_version: "property-remediation-b-extension-core-candidate-v1",
      status: "passed", candidate_admissible: true, final_signoff_generated: false,
      run_id: runId, failed_stage: null, authorities: AUTHORITIES,
      reservation: reservation.evidence,
      input_freeze_before_write: initialFreeze, input_freeze_after_local: afterLocal,
      input_freeze_after_pg: afterPg, input_freeze_after_cleanup: afterCleanup,
      local_gate: localGate, runs,
      runtime_scenario_evidence: runtimeScenarioEvidence,
      scenario_evidence: scenarioEvidence,
      b_extension_fixture_sha256: expectedFixture.fixture_sha256,
      combined_checksum: combined.combined_checksum, open_p0_p1: []
    };
  } catch (error) {
    afterLocal ??= captureFreeze(initialFreeze, "after-local");
    afterPg ??= captureFreeze(initialFreeze, "after-pg");
    afterCleanup ??= captureFreeze(initialFreeze, "after-cleanup");
    outcome = {
      schema_version: "property-remediation-b-extension-core-candidate-v1",
      status: "failed", candidate_admissible: false, final_signoff_generated: false,
      run_id: runId, failed_stage: stage, authorities: AUTHORITIES,
      reservation: reservation.evidence,
      input_freeze_before_write: initialFreeze, input_freeze_after_local: afterLocal,
      input_freeze_after_pg: afterPg, input_freeze_after_cleanup: afterCleanup,
      local_gate: localGate, runs, cleanup_failure_evidence: error?.provision_evidence ?? null,
      error: error instanceof Error ? error.message : String(error), open_p0_p1: ["gate-failed"]
    };
  }
  const published = publishOutcome(reservation, outcome);
  return { status: outcome.status, run_id: runId, candidate_admissible: outcome.candidate_admissible,
    final_signoff_generated: false, failed_stage: outcome.failed_stage,
    b_extension_fixture_sha256: expectedFixture?.fixture_sha256 ?? null,
    combined_checksum: outcome.combined_checksum ?? null, ...published };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const summary = await runExtensionGate();
    const stream = summary.status === "passed" ? process.stdout : process.stderr;
    stream.write(`${JSON.stringify(summary)}\n`);
    if (summary.status !== "passed") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "failed", candidate_admissible: false,
      error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  }
}
