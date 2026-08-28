#!/usr/bin/env node
/* global process, structuredClone */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { currentState, validateConfig } from "./full-domain-lifecycle.mjs";
import { buildEvidenceIndex, manifestHash, verifyManifestChain } from "./parent-manifest.mjs";
import { verifyGlobalFacts } from "./verify-global-facts.mjs";
import { injectAllowlistedFault, validateFaultId } from "./rehearsal-fault-injector.mjs";
import {
  BackupRestoreVerificationError,
  buildFileTreeManifest,
  canonicalJson,
  copyFileTree,
  hashCanonical,
  inventoryFileTree,
  normalizeToc,
  sha256,
  validateBackupRestoreEvidence,
  verifyRestoreEquality,
  writePrivateJson
} from "./verify-rehearsal-restore.mjs";

const LAB_ID = /^jinhu_hr_migration_lab_full_[a-z0-9_]{6,48}$/;
const ROLE_ID = /^[a-z][a-z0-9_]{5,62}$/;
const FACT_SCHEMA = /^hr_cutover_facts_[a-z0-9_]{4,32}$/;
const FORBIDDEN_TARGET = /prod(?:uction)?|jinhu_smart_park|shared|default/i;
const RESOURCE_TYPES = new Set(["database", "container", "network", "volume", "role", "directory", "account", "file", "port", "process", "credential_artifact"]);

export class BackupRestoreError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "BackupRestoreError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new BackupRestoreError(code, detail); };
const digest = (value) => createHash("sha256").update(value).digest("hex");
const mode = (path) => (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
const quoteIdentifier = (value) => {
  if (!/^[a-z][a-z0-9_]{5,62}$/.test(value ?? "")) fail("UNSAFE_TARGET_IDENTITY", String(value));
  return `"${value}"`;
};

function inside(parent, child) {
  const value = relative(parent, child);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

function privateReplace(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function privateText(path, value) {
  writeFileSync(path, value, { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}

function assertPrivateRegularFile(path, label) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || mode(path) !== "0600") fail("UNSAFE_FILE_PERMISSION", label);
}

function artifact(path, root) {
  assertPrivateRegularFile(path, basename(path));
  const relativePath = relative(root, path).split(sep).join("/");
  if (!relativePath || relativePath.startsWith("../") || isAbsolute(relativePath)) fail("EVIDENCE_PATH_ESCAPE", basename(path));
  const bytes = readFileSync(path);
  return { relativePath, sha256: sha256(bytes), bytes: bytes.length, mode: "0600" };
}

export function deriveRestoreIdentities(config) {
  const source = config?.target?.database;
  const project = config?.target?.composeProject;
  if (!LAB_ID.test(source ?? "") || !LAB_ID.test(project ?? "") || source !== project || FORBIDDEN_TARGET.test(source)) fail("UNSAFE_TARGET_IDENTITY", "source database/project must be the same full-domain lab identity");
  if (!config?.runId || !["A", "B"].includes(config?.rehearsal) || typeof config?.target?.root !== "string" || typeof config?.target?.evidenceRoot !== "string" || typeof config?.target?.fileRoot !== "string") fail("BACKUP_RESTORE_CONFIG_INVALID", "run/rehearsal/paths");
  const operation = digest(`${config.runId}:${canonicalJson(config.triple ?? {})}`).slice(0, 12);
  const database = `jinhu_hr_migration_lab_full_restore_${config.rehearsal.toLowerCase()}_${operation}`;
  const role = `${database}_verify`;
  if (!LAB_ID.test(database) || !ROLE_ID.test(role) || database === source || database === project) fail("UNSAFE_RESTORE_IDENTITY", database);
  const artifactRoot = resolve(config.target.root, `backup-restore-${operation}`);
  const backupFilesRoot = resolve(artifactRoot, "file-snapshot");
  const restoredFilesRoot = resolve(artifactRoot, "restored-files");
  const dumpFile = resolve(artifactRoot, "database.dump");
  const tocFile = resolve(artifactRoot, "database.toc");
  const normalizedTocFile = resolve(artifactRoot, "database.toc.normalized");
  const summaryFile = resolve(config.target.evidenceRoot, `backup-restore-${operation}-summary.json`);
  const lockFile = resolve(config.target.root, ".backup-restore.lock");
  const faultProbeFile = resolve(config.target.fileRoot, `.backup-restore-fault-probe-${operation}`);
  for (const path of [artifactRoot, backupFilesRoot, restoredFilesRoot, dumpFile, tocFile, normalizedTocFile, summaryFile, lockFile, faultProbeFile]) {
    if (!inside(config.target.root, path)) fail("CLEANUP_PATH_ESCAPE", basename(path));
  }
  return { operation, database, role, artifactRoot, backupFilesRoot, restoredFilesRoot, dumpFile, tocFile, normalizedTocFile, summaryFile, lockFile, faultProbeFile };
}

const resource = (type, planned) => ({ type, planned, observed: null, removed: false, residualCount: 0 });

export function planRestoreResources(config, identities, fileInventory = { directories: [], files: [] }) {
  const rows = [
    resource("database", identities.database),
    resource("role", identities.role),
    resource("directory", identities.artifactRoot),
    resource("directory", identities.backupFilesRoot),
    resource("directory", identities.restoredFilesRoot),
    resource("file", identities.dumpFile),
    resource("file", identities.tocFile),
    resource("file", identities.normalizedTocFile),
    resource("file", identities.summaryFile),
    resource("file", identities.lockFile),
    resource("file", identities.faultProbeFile)
  ];
  for (const relativePath of fileInventory.directories ?? []) {
    rows.push(resource("directory", resolve(identities.backupFilesRoot, relativePath)));
    rows.push(resource("directory", resolve(identities.restoredFilesRoot, relativePath)));
  }
  for (const entry of fileInventory.files ?? []) {
    rows.push(resource("file", resolve(identities.backupFilesRoot, entry.relativePath)));
    rows.push(resource("file", resolve(identities.restoredFilesRoot, entry.relativePath)));
  }
  const seen = new Set();
  for (const row of rows) {
    if (!RESOURCE_TYPES.has(row.type) || typeof row.planned !== "string" || !row.planned) fail("RESOURCE_PLAN_INVALID", row.type);
    const key = `${row.type}:${row.planned}`;
    if (seen.has(key)) fail("RESOURCE_IDENTITY_DUPLICATE", key);
    seen.add(key);
  }
  return rows;
}

export function registerPlannedResources(registryPath, resources) {
  assertPrivateRegularFile(registryPath, "resource registry");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry)) fail("RESOURCE_REGISTRY_INVALID", "registry must be an array");
  const existing = new Set(registry.map((entry) => `${entry.type}:${entry.planned}`));
  for (const entry of resources) {
    if (!RESOURCE_TYPES.has(entry.type) || typeof entry.planned !== "string" || !entry.planned || entry.observed !== null || entry.removed !== false || entry.residualCount !== 0) fail("RESOURCE_PLAN_INVALID", `${entry.type}:${entry.planned}`);
    const key = `${entry.type}:${entry.planned}`;
    if (existing.has(key)) fail("RESOURCE_IDENTITY_DUPLICATE", key);
    existing.add(key);
  }
  privateReplace(registryPath, [...registry, ...resources]);
  return { registered: resources.length };
}

function updateResource(registryPath, type, planned, changes) {
  const rows = JSON.parse(readFileSync(registryPath, "utf8"));
  const matches = rows.filter((entry) => entry.type === type && entry.planned === planned);
  if (matches.length !== 1) fail("RESOURCE_REGISTRY_INVALID", `${type}:${planned}`);
  Object.assign(matches[0], changes);
  privateReplace(registryPath, rows);
}

export function validateBackupRestorePreconditions(config, state, head, registry, runtime) {
  if (config.backend !== "lab" || !LAB_ID.test(config.target?.database ?? "") || config.target.database !== config.target.composeProject || FORBIDDEN_TARGET.test(config.target.database)) fail("UNSAFE_TARGET_IDENTITY", "lab database/project");
  if (config.target.postgresContainer !== `${config.target.composeProject}-postgres-1`) fail("UNSAFE_TARGET_IDENTITY", "container/project binding");
  if (runtime.dockerProject !== config.target.composeProject) fail("UNSAFE_TARGET_IDENTITY", "Docker Compose project label differs");
  if (runtime.publishedHost !== "127.0.0.1") fail("UNSAFE_DOCKER_ENDPOINT", "PostgreSQL must publish on loopback only");
  if (state !== "uat_ready" || head?.state !== "uat_ready" || head?.parentRunId !== config.runId || canonicalJson(head?.triple) !== canonicalJson(config.triple)) fail("STATE_TRANSITION_INVALID", "backup/restore requires the hash-valid uat_ready manifest head");
  if (!Array.isArray(head.children) || head.children.length !== 6 || head.children.some((child, index) => child.domain !== `T${index}` || child.status !== "verified")) fail("PARTIAL_RUN", "T0-T5 must be continuously verified");
  if (head.hardGates?.technicalUat?.status !== "PASS") fail("TECHNICAL_UAT_REQUIRED", "technical UAT must pass before backup/restore");
  if (head.hardGates?.restore?.status === "PASS") fail("RESTORE_ALREADY_PROVEN", config.runId);
  if (!Array.isArray(registry) || !registry.some((entry) => entry.type === "database" && entry.planned === config.target.database && entry.observed === config.target.database) || !registry.some((entry) => entry.type === "container" && entry.planned === config.target.postgresContainer && entry.observed === config.target.postgresContainer)) fail("RESOURCE_REGISTRY_INVALID", "source database/container must be observed");
  return { ok: true, productionImport: "HOLD", productionRestore: "HOLD" };
}

function dockerInspect(config) {
  const context = spawnSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8", stdio: "pipe" });
  if (context.status !== 0 || !context.stdout.trim().startsWith("unix://")) fail("UNSAFE_DOCKER_ENDPOINT", "Docker must use a local Unix socket");
  const inspect = spawnSync("docker", ["inspect", config.target.postgresContainer], { encoding: "utf8", stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
  if (inspect.status !== 0) fail("BACKUP_SOURCE_MISSING", "registered PostgreSQL container is unavailable");
  const value = JSON.parse(inspect.stdout)[0];
  const dockerProject = value?.Config?.Labels?.["com.docker.compose.project"];
  const published = value?.NetworkSettings?.Ports?.["5432/tcp"];
  if (!Array.isArray(published) || published.length !== 1 || published[0].HostPort !== String(config.target.postgresPort)) fail("UNSAFE_DOCKER_ENDPOINT", "PostgreSQL port identity differs");
  return { dockerProject, publishedHost: published[0].HostIp };
}

function psql(config, database, sql) {
  if (!LAB_ID.test(database) && database !== "postgres") fail("UNSAFE_TARGET_IDENTITY", database);
  const result = spawnSync("docker", ["exec", "-i", config.target.postgresContainer, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) fail("BACKUP_RESTORE_DATABASE_COMMAND_FAILED", "isolated PostgreSQL command failed");
  return result.stdout.trim();
}

function scalar(config, database, sql) {
  const value = psql(config, database, sql).split("\n").filter(Boolean).at(-1);
  if (value === undefined) fail("BACKUP_RESTORE_DATABASE_RESULT_INVALID", "scalar result missing");
  return value;
}

function assertResourceAbsent(config, identities) {
  if (existsSync(identities.artifactRoot) || existsSync(identities.summaryFile) || existsSync(identities.lockFile) || existsSync(identities.faultProbeFile)) fail("RESOURCE_ALREADY_EXISTS", "restore filesystem identity exists");
  const databaseCount = Number(scalar(config, "postgres", `SELECT count(*) FROM pg_database WHERE datname='${identities.database}';`));
  const roleCount = Number(scalar(config, "postgres", `SELECT count(*) FROM pg_roles WHERE rolname='${identities.role}';`));
  if (databaseCount !== 0 || roleCount !== 0) fail("RESOURCE_ALREADY_EXISTS", "restore database/role identity exists");
}

function runToFile(command, args, outputPath, inputPath = null) {
  const outputFd = openSync(outputPath, "wx", 0o600);
  const inputFd = inputPath ? openSync(inputPath, "r") : null;
  try {
    const result = spawnSync(command, args, { stdio: [inputFd ?? "ignore", outputFd, "pipe"], maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) fail("BACKUP_RESTORE_COMMAND_FAILED", `${basename(args.find((entry) => /pg_(?:dump|restore)/u.test(entry)) ?? command)} failed`);
  } finally {
    if (inputFd !== null) closeSync(inputFd);
    closeSync(outputFd);
  }
  chmodSync(outputPath, 0o600);
}

function runWithInput(command, args, inputPath) {
  const inputFd = openSync(inputPath, "r");
  try {
    const result = spawnSync(command, args, { stdio: [inputFd, "ignore", "pipe"], maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) fail("BACKUP_RESTORE_COMMAND_FAILED", "custom-format restore failed");
  } finally { closeSync(inputFd); }
}

const MIGRATION_HISTORY_SQL = `COPY (
  SELECT source,filename,checksum,status FROM (
    SELECT 'primary'::text source,filename,checksum,status FROM public.sys_schema_migration_history
    UNION ALL
    SELECT 'standard'::text source,filename,checksum,status FROM public.schema_migrations
  ) history ORDER BY source,filename
) TO STDOUT WITH (FORMAT csv);`;

const PLATFORM_CATALOG_SQL = `WITH catalog AS (
  SELECT 'column' kind,jsonb_build_array(n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) value
  FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S')
  UNION ALL
  SELECT 'constraint',jsonb_build_array(n.nspname,c.relname,x.conname,x.contype,pg_get_constraintdef(x.oid,true)) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND n.nspname<>'information_schema'
  UNION ALL
  SELECT 'index',jsonb_build_array(n.nspname,c.relname,i.relname,pg_get_indexdef(i.oid)) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND n.nspname<>'information_schema'
  UNION ALL
  SELECT 'trigger',jsonb_build_array(n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid,true)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND n.nspname<>'information_schema'
  UNION ALL
  SELECT 'enum',jsonb_build_array(n.nspname,t.typname,e.enumsortorder,e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND n.nspname<>'information_schema'
  UNION ALL
  SELECT 'extension',jsonb_build_array(extname,extversion) FROM pg_extension
) SELECT COALESCE(jsonb_agg(value ORDER BY kind,value::text),'[]'::jsonb)::text FROM catalog;`;

function queryFactRows(config, database, schema, table, columns) {
  if (!FACT_SCHEMA.test(schema) || !/^[a-z_]{3,80}$/.test(table) || columns.some((column) => !/^[a-z_]{2,80}$/.test(column))) fail("GLOBAL_FACTS_ARGUMENT_INVALID", "fact query identity");
  return psql(config, database, `SELECT COALESCE(jsonb_agg(to_jsonb(row_value) ORDER BY to_jsonb(row_value)::text),'[]'::jsonb)::text FROM (SELECT ${columns.join(",")} FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} WHERE run_id='${config.runId}') row_value;`);
}

function captureCanonicalFacts(config, database, fixtureSchema, fixtureValue, fileRoot) {
  const global = verifyGlobalFacts({ container: config.target.postgresContainer, database, fixtureSchema: config.verification.factSchema, runId: config.runId });
  const migrationHistory = psql(config, database, MIGRATION_HISTORY_SQL);
  const platformCatalog = psql(config, database, PLATFORM_CATALOG_SQL);
  const quarantine = global.ledger.map((row) => ({ domain: row.domain, sourceObject: row.source_object, approvedIgnored: row.approvedIgnored, approvedIgnoredReasonCode: row.approvedIgnoredReasonCode ?? null, approvalAttestationSha256: row.approvalAttestationSha256 ?? null }));
  const sideEffects = queryFactRows(config, database, config.verification.factSchema, "hr_cutover_side_effect_snapshot", ["table_name", "phase", "locked", "row_hash"]);
  const observedFixture = scalar(config, database, `SELECT value_sha256 FROM ${quoteIdentifier(fixtureSchema)}.verification_fixture WHERE fixture_id='restore-proof';`);
  if (observedFixture !== fixtureValue) throw new BackupRestoreVerificationError("RESTORE_FIXTURE_MISMATCH", "verification fixture differs");
  return {
    migrationHistorySha256: digest(migrationHistory),
    platformCatalogSha256: digest(platformCatalog),
    hrLedgerSha256: hashCanonical(global.ledger),
    hrGlobalSha256: global.globalHash,
    hrDomainHashes: global.domainHashes,
    quarantineLedgerSha256: hashCanonical(quarantine),
    sideEffectSha256: digest(sideEffects),
    fileTree: buildFileTreeManifest(fileRoot),
    faultFixtureSha256: digest(observedFixture)
  };
}

function createFaultFixture(config, fixtureSchema, fixtureValue) {
  psql(config, config.target.database, `BEGIN;
CREATE SCHEMA ${quoteIdentifier(fixtureSchema)};
CREATE TABLE ${quoteIdentifier(fixtureSchema)}.verification_fixture(fixture_id text PRIMARY KEY,value_sha256 text NOT NULL CHECK(value_sha256 ~ '^[0-9a-f]{64}$'));
INSERT INTO ${quoteIdentifier(fixtureSchema)}.verification_fixture VALUES('restore-proof','${fixtureValue}');
COMMIT;`);
}

function createRestoreTarget(config, identities, registryPath) {
  psql(config, "postgres", `CREATE ROLE ${quoteIdentifier(identities.role)} NOLOGIN;`);
  updateResource(registryPath, "role", identities.role, { observed: identities.role });
  psql(config, "postgres", `CREATE DATABASE ${quoteIdentifier(identities.database)} TEMPLATE template0 OWNER jinhu;`);
  updateResource(registryPath, "database", identities.database, { observed: identities.database });
}

function dropRestoreTarget(config, identities) {
  try { psql(config, "postgres", `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${identities.database}' AND pid<>pg_backend_pid(); DROP DATABASE IF EXISTS ${quoteIdentifier(identities.database)};`); } catch { /* recovery continues to the exact role */ }
  try { psql(config, "postgres", `DROP ROLE IF EXISTS ${quoteIdentifier(identities.role)};`); } catch { /* lifecycle recovery will re-enumerate */ }
}

export function removeExactFilesystem(registryPath, identities) {
  if (!existsSync(registryPath)) return;
  const rows = JSON.parse(readFileSync(registryPath, "utf8"));
  const controlled = rows.filter((entry) => ["file", "directory"].includes(entry.type) && (
    entry.planned === identities.lockFile || entry.planned === identities.summaryFile || entry.planned === identities.faultProbeFile || entry.planned === identities.artifactRoot || inside(identities.artifactRoot, entry.planned)
  ));
  for (const entry of controlled.filter((entry) => entry.type === "file")) if (existsSync(entry.planned) && !lstatSync(entry.planned).isSymbolicLink()) unlinkSync(entry.planned);
  for (const entry of controlled.filter((entry) => entry.type === "directory").sort((left, right) => right.planned.length - left.planned.length)) if (existsSync(entry.planned) && readdirSync(entry.planned).length === 0) rmdirSync(entry.planned);
  for (const entry of rows) {
    if (controlled.some((candidate) => candidate.type === entry.type && candidate.planned === entry.planned)) {
      entry.residualCount = existsSync(entry.planned) ? 1 : 0;
      entry.removed = entry.residualCount === 0;
    }
  }
  privateReplace(registryPath, rows);
}

export function assertRestoreResourcesRemoved(registryPath, identities) {
  const rows = JSON.parse(readFileSync(registryPath, "utf8"));
  const selected = rows.filter((entry) => (
    (entry.type === "database" && entry.planned === identities.database)
    || (entry.type === "role" && entry.planned === identities.role)
    || (["file", "directory"].includes(entry.type) && (
      entry.planned === identities.lockFile || entry.planned === identities.summaryFile || entry.planned === identities.faultProbeFile || entry.planned === identities.artifactRoot || inside(identities.artifactRoot, entry.planned)
    ))
  ));
  const residualCount = selected.reduce((total, entry) => total + entry.residualCount, 0);
  if (selected.some((entry) => entry.removed !== true) || residualCount !== 0) fail("RESOURCE_RESIDUAL_NONZERO", String(residualCount));
  return { residualCount: 0 };
}

function appendRestoreManifest(config, summaryFile) {
  const chainPath = resolve(config.verification.manifestChainFile);
  const chain = JSON.parse(readFileSync(chainPath, "utf8"));
  const result = verifyManifestChain(chain, { evidenceRoot: config.target.evidenceRoot });
  const headRecord = chain.find((entry) => entry.sha256 === result.headSha256);
  if (!headRecord) fail("MANIFEST_CHAIN_INVALID", "head missing");
  const relativePath = relative(config.target.evidenceRoot, summaryFile).split(sep).join("/");
  const newEvidence = buildEvidenceIndex(config.target.evidenceRoot, [{ kind: "rehearsal_backup_restore", relativePath }]);
  const manifest = structuredClone(headRecord.manifest);
  manifest.supersedesManifestSha256 = headRecord.sha256;
  manifest.hardGates.restore = { status: "PASS", reasonCodes: [] };
  manifest.hardGates.productionImport = { status: "HOLD", reasonCodes: ["PRODUCTION_IMPORT_AUTH_MISSING"] };
  manifest.evidence = [...manifest.evidence, ...newEvidence];
  const registry = JSON.parse(readFileSync(resolve(config.target.evidenceRoot, "resource-registry.json"), "utf8"));
  manifest.resourceRegistry = registry.map((entry) => ({ ...entry, observed: typeof entry.observed === "string" ? entry.observed : null }));
  const record = { sha256: manifestHash(manifest), manifest };
  chain.push(record);
  privateReplace(chainPath, chain);
  verifyManifestChain(chain, { evidenceRoot: config.target.evidenceRoot });
  return record.sha256;
}

function parseArgs(argv) {
  const args = { fault: "VERIFY_FIXTURE_ROW_CHANGED" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--") continue;
    if (argv[index] === "--config") args.config = argv[++index];
    else if (argv[index] === "--fault") args.fault = argv[++index];
    else fail("CLI_ARGUMENT_INVALID", argv[index]);
  }
  if (!args.config) fail("CLI_ARGUMENT_INVALID", "--config <0600 rehearsal config> [--fault allowlisted-id]");
  validateFaultId(args.fault);
  return args;
}

export function runBackupRestore(configInput, configPath, faultId = "VERIFY_FIXTURE_ROW_CHANGED") {
  const config = validateConfig(structuredClone(configInput));
  config.__configPath = resolve(configPath);
  validateFaultId(faultId);
  if (!config.verification) fail("GLOBAL_FACTS_REQUIRED", "backup/restore requires the full-domain fact contract");
  const identities = deriveRestoreIdentities(config);
  const registryPath = resolve(config.target.evidenceRoot, "resource-registry.json");
  const runtime = dockerInspect(config);
  const chain = JSON.parse(readFileSync(config.verification.manifestChainFile, "utf8"));
  const chainResult = verifyManifestChain(chain, { evidenceRoot: config.target.evidenceRoot });
  const head = chain.find((entry) => entry.sha256 === chainResult.headSha256)?.manifest;
  const state = currentState(config);
  const existingRegistry = JSON.parse(readFileSync(registryPath, "utf8"));
  validateBackupRestorePreconditions(config, state, head, existingRegistry, runtime);
  if (existsSync(resolve(config.target.root, ".operation.lock"))) fail("RUN_CONCURRENT", config.runId);
  assertResourceAbsent(config, identities);
  registerPlannedResources(registryPath, planRestoreResources(config, identities));
  let success = false;
  try {
    privateText(identities.lockFile, `${config.runId}\n`);
    updateResource(registryPath, "file", identities.lockFile, { observed: identities.lockFile });
    mkdirSync(identities.artifactRoot, { recursive: false, mode: 0o700 });
    chmodSync(identities.artifactRoot, 0o700);
    updateResource(registryPath, "directory", identities.artifactRoot, { observed: identities.artifactRoot });

    if (faultId === "REGISTERED_FILE_UNREADABLE") {
      privateText(identities.faultProbeFile, `${digest(config.runId)}\n`);
      updateResource(registryPath, "file", identities.faultProbeFile, { observed: identities.faultProbeFile });
    }
    const sourceInventory = inventoryFileTree(config.target.fileRoot);
    const copyResources = planRestoreResources(config, identities, sourceInventory).filter((entry) => !JSON.parse(readFileSync(registryPath, "utf8")).some((row) => row.type === entry.type && row.planned === entry.planned));
    if (copyResources.length) registerPlannedResources(registryPath, copyResources);
    const backupTree = copyFileTree(config.target.fileRoot, identities.backupFilesRoot);
    updateResource(registryPath, "directory", identities.backupFilesRoot, { observed: identities.backupFilesRoot });
    for (const relativePath of sourceInventory.directories) updateResource(registryPath, "directory", resolve(identities.backupFilesRoot, relativePath), { observed: resolve(identities.backupFilesRoot, relativePath) });
    for (const entry of sourceInventory.files) updateResource(registryPath, "file", resolve(identities.backupFilesRoot, entry.relativePath), { observed: resolve(identities.backupFilesRoot, entry.relativePath) });

    const fixtureSchema = `hr_restore_fixture_${identities.operation}`;
    const fixtureValue = digest(`${config.runId}:restore-proof`);
    createFaultFixture(config, fixtureSchema, fixtureValue);
    const before = captureCanonicalFacts(config, config.target.database, fixtureSchema, fixtureValue, config.target.fileRoot);
    if (canonicalJson(before.fileTree) !== canonicalJson(backupTree)) fail("BACKUP_FILE_SNAPSHOT_MISMATCH", "copied file snapshot differs before fault");

    runToFile("docker", ["exec", config.target.postgresContainer, "pg_dump", "-Fc", "--no-owner", "--no-privileges", "-U", "jinhu", "-d", config.target.database], identities.dumpFile);
    updateResource(registryPath, "file", identities.dumpFile, { observed: identities.dumpFile });
    const dumpBoundaryEpochMs = Date.now();
    runToFile("docker", ["exec", "-i", config.target.postgresContainer, "pg_restore", "--list"], identities.tocFile, identities.dumpFile);
    updateResource(registryPath, "file", identities.tocFile, { observed: identities.tocFile });
    const normalizedToc = normalizeToc(readFileSync(identities.tocFile, "utf8"));
    privateText(identities.normalizedTocFile, normalizedToc);
    updateResource(registryPath, "file", identities.normalizedTocFile, { observed: identities.normalizedTocFile });

    const fault = faultId === "VERIFY_FIXTURE_ROW_CHANGED"
      ? injectAllowlistedFault({
        faultId,
        targetIdentity: config.target.database,
        mutateFixture: () => psql(config, config.target.database, `UPDATE ${quoteIdentifier(fixtureSchema)}.verification_fixture SET value_sha256='${digest(`${fixtureValue}:fault`)}' WHERE fixture_id='restore-proof';`),
        restoreFixture: () => psql(config, config.target.database, `UPDATE ${quoteIdentifier(fixtureSchema)}.verification_fixture SET value_sha256='${fixtureValue}' WHERE fixture_id='restore-proof';`),
        detectFixture: () => captureCanonicalFacts(config, config.target.database, fixtureSchema, fixtureValue, config.target.fileRoot)
      })
      : injectAllowlistedFault({
        faultId,
        targetIdentity: config.target.database,
        registeredFile: identities.faultProbeFile,
        registered: JSON.parse(readFileSync(registryPath, "utf8")).some((entry) => entry.type === "file" && entry.planned === identities.faultProbeFile && entry.observed === identities.faultProbeFile),
        detectFile: () => buildFileTreeManifest(config.target.fileRoot)
      });
    const afterRevert = captureCanonicalFacts(config, config.target.database, fixtureSchema, fixtureValue, config.target.fileRoot);
    verifyRestoreEquality(before, afterRevert);

    const restoreStartedEpochMs = Date.now();
    const restoreStartMono = process.hrtime.bigint();
    createRestoreTarget(config, identities, registryPath);
    runWithInput("docker", ["exec", "-i", config.target.postgresContainer, "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "-U", "jinhu", "-d", identities.database], identities.dumpFile);
    const restoredTree = copyFileTree(identities.backupFilesRoot, identities.restoredFilesRoot);
    updateResource(registryPath, "directory", identities.restoredFilesRoot, { observed: identities.restoredFilesRoot });
    for (const relativePath of sourceInventory.directories) updateResource(registryPath, "directory", resolve(identities.restoredFilesRoot, relativePath), { observed: resolve(identities.restoredFilesRoot, relativePath) });
    for (const entry of sourceInventory.files) updateResource(registryPath, "file", resolve(identities.restoredFilesRoot, entry.relativePath), { observed: resolve(identities.restoredFilesRoot, entry.relativePath) });
    const restored = captureCanonicalFacts(config, identities.database, fixtureSchema, fixtureValue, identities.restoredFilesRoot);
    if (canonicalJson(restored.fileTree) !== canonicalJson(restoredTree)) fail("RESTORE_FILE_TREE_MISMATCH", "restored file snapshot differs");
    const equality = verifyRestoreEquality(before, restored);
    const rtoObservedMs = Number((process.hrtime.bigint() - restoreStartMono) / 1_000_000n);
    const verifiedReadyEpochMs = Date.now();
    const evidence = {
      formatVersion: 1,
      evidenceKind: "yuzhou_hr_rehearsal_backup_restore",
      status: "PASS",
      parentRunId: config.runId,
      rehearsal: config.rehearsal,
      triple: config.triple,
      target: { composeProject: config.target.composeProject, postgresContainer: config.target.postgresContainer, sourceDatabase: config.target.database, restoreDatabase: identities.database, restoreRole: identities.role },
      backup: {
        format: "pg_dump_custom",
        dump: artifact(identities.dumpFile, config.target.root),
        toc: artifact(identities.tocFile, config.target.root),
        normalizedTocSha256: digest(normalizedToc),
        fileSnapshot: backupTree
      },
      fault,
      before,
      restored,
      equality,
      timing: { clock: "monotonic_plus_utc_epoch_ms", dumpBoundaryEpochMs, restoreStartedEpochMs, verifiedReadyEpochMs, rtoObservedMs, rpoObservedObjects: 0, targetApproval: "UNAPPROVED" },
      security: { directoryMode: "0700", fileMode: "0600", containsSecrets: false, containsPersonalValues: false },
      productionImport: "HOLD",
      productionRestore: "HOLD"
    };
    validateBackupRestoreEvidence(evidence);
    writePrivateJson(identities.summaryFile, evidence);
    updateResource(registryPath, "file", identities.summaryFile, { observed: identities.summaryFile });
    const manifestSha256 = appendRestoreManifest(config, identities.summaryFile);
    success = true;
    return { status: "PASS", parentRunId: config.runId, restoreEvidenceSha256: sha256(readFileSync(identities.summaryFile)), manifestSha256, rtoObservedMs, rpoObservedObjects: 0, targetApproval: "UNAPPROVED", productionImport: "HOLD", productionRestore: "HOLD" };
  } finally {
    if (existsSync(identities.lockFile)) unlinkSync(identities.lockFile);
    if (existsSync(registryPath)) updateResource(registryPath, "file", identities.lockFile, { removed: true, residualCount: 0 });
    if (!success) {
      dropRestoreTarget(config, identities);
      if (existsSync(registryPath)) {
        const databaseResidual = Number(scalar(config, "postgres", `SELECT count(*) FROM pg_database WHERE datname='${identities.database}';`));
        const roleResidual = Number(scalar(config, "postgres", `SELECT count(*) FROM pg_roles WHERE rolname='${identities.role}';`));
        updateResource(registryPath, "database", identities.database, { removed: databaseResidual === 0, residualCount: databaseResidual });
        updateResource(registryPath, "role", identities.role, { removed: roleResidual === 0, residualCount: roleResidual });
      }
      removeExactFilesystem(registryPath, identities);
      assertRestoreResourcesRemoved(registryPath, identities);
    }
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const configPath = realpathSync(resolve(args.config));
    assertPrivateRegularFile(configPath, "rehearsal config");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const result = runBackupRestore(config, configPath, args.fault);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof BackupRestoreError || error instanceof BackupRestoreVerificationError ? error.code : error.code ?? "BACKUP_RESTORE_FAILED";
    process.stderr.write(`${code}: ${error.message.replace(/^.*?: /u, "")}\n`);
    process.exitCode = 1;
  }
}
