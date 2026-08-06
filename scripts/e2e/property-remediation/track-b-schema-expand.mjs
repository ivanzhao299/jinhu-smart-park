import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_POSTGRES_IMAGE,
  assertExactEphemeralPostgresContainer,
  assertNoDatabaseUrlOverrides,
  buildEphemeralPostgresRunArgs,
  inspectContainer,
  resolveCreatedContainerId,
  runDocker,
  validateRunId
} from "./bootstrap/ephemeral-postgres.mjs";
import { canonicalize } from "./lib/canonical.mjs";

export const B_CONTRACT_SHA =
  "a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8";
export const B_SCHEMA_CATALOG_GRAMMAR = "b0-schema-catalog-v2";
export const B_SCHEMA_SECURITY_GRAMMAR = "b0-schema-security-v1";
export const B_SCHEMA_MANIFEST_GRAMMAR = "b0-schema-expand-v2";
export const B_ENDPOINT_AUTHORITY_RAW_SHA256 =
  "9fd05b0249b7e873bc250154f13f0b4a903ec998139189295f35c977f09387e1";
export const POSTGRES_INIT_COMPLETE_MARKER =
  "PostgreSQL init process complete; ready for start up.";
export const B_SCHEMA_CATALOG_V2_POLICY = Object.freeze({
  scopeNormalization: Object.freeze({
    tenant: "sys_tenant.tenant_id",
    park: "asset_park.park_id"
  }),
  excludedEphemeralInputs: Object.freeze([
    "catalog_oid",
    "container_and_volume_identity",
    "generated_timestamp",
    "physical_tenant_and_park_uuid",
    "role_and_owner_identity",
    "temporary_runtime_role"
  ]),
  rowOrdering: "utf8-byte(kind-tab-name)",
  jsonCanonicalization: "RFC8785"
});
export const B_MIGRATIONS = [
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000200_property_b_migration_compatibility_control.sql"
];
export const FROZEN_INPUTS = [
  ["b0-identity-control-freeze.md", "f0af4c2d1cc7979ebc8c5d15f662cc299a698e1c0749393f180509bd0507239b"],
  ["b0-runtime-contract-freeze.md", "845e886fb1b3443431e5e18a6afac1c98b06080f4456829b7f2802819b2597f7"],
  ["b0-product-access-freeze.md", "6624bebb7b9dd9972c574d1cf262d7adbc9080287463f3aa23e3832982b2371a"],
  ["b0-schema-physical-addendum.md", "34759fbca464e10d61cff03fcc2a2278bccbe8d50d47b35fbaa7b55d94f50f45"]
];
export const IDENTITY_COMMAND_FUNCTIONS = [
  "fn_party_identity_create_draft_cas",
  "fn_party_identity_update_draft_cas",
  "fn_party_identity_submit_cas",
  "fn_party_identity_withdraw_cas",
  "fn_party_identity_assignment_cas",
  "fn_party_identity_decision_cas"
];
export const IDENTITY_TRIGGER_FUNCTIONS = [
  "fn_guard_party_identity_assignment_audit_insert",
  "fn_guard_party_identity_decision_insert",
  "fn_guard_party_identity_draft_file_mutation",
  "fn_validate_party_identity_consistency"
];
export const ANOMALY_TRANSITION_FUNCTIONS = [
  "fn_transition_property_migration_anomaly"
];
export const IDENTITY_IMMEDIATE_TRIGGERS = [
  "trg_biz_party_identity_assignment_audit_insert_guard",
  "trg_biz_party_identity_decision_insert_guard",
  "trg_rel_party_identity_draft_file_mutation_guard"
];
export const IDENTITY_CONSTRAINT_TRIGGERS = [
  "trg_biz_party_identity_party_consistency",
  "trg_biz_party_identity_submission_consistency",
  "trg_biz_party_identity_assignment_consistency",
  "trg_biz_party_identity_decision_consistency"
];

function uniqueExact(values, expectedCount, label) {
  if (values.length !== expectedCount || new Set(values).size !== expectedCount) {
    throw new Error(`${label} signed exact-set mismatch`);
  }
  return values;
}

export function parseSignedDefinitionContract(entries) {
  const definitions = entries.find(({ filename }) => filename.startsWith("000189_"))?.sql;
  const controls = entries.find(({ filename }) => filename.startsWith("000190_"))?.sql;
  if (!definitions || !controls) throw new Error("signed definition migrations are unavailable");
  const permissionBlock = definitions.match(
    /signed_permission\([\s\S]+?\)\s+AS\s+\(\s+VALUES([\s\S]+?)\n\)\nINSERT INTO sys_permission/
  )?.[1] ?? "";
  const permissionCodes = [...permissionBlock.matchAll(/^\s*\('([^']+)'/gm)]
    .map((match) => match[1]);
  const signedPermissionCodeBlock = definitions.match(
    /INSERT INTO b0_signed_permission_code VALUES([\s\S]+?);\n\nWITH target_scope/
  )?.[1] ?? "";
  const materializedPermissionCodes = [
    ...signedPermissionCodeBlock.matchAll(/^\s*\('([^']+)'\)/gm)
  ].map((match) => match[1]);
  const bundleBlock = definitions.match(
    /INSERT INTO b0_signed_bundle VALUES([\s\S]+?);\n\nINSERT INTO b0_signed_bundle_member/
  )?.[1] ?? "";
  const bundles = [...bundleBlock.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)]
    .map((match) => ({ code: match[1], name: match[2] }));
  const memberBlock = definitions.match(
    /INSERT INTO b0_signed_bundle_member VALUES([\s\S]+?);\n\nWITH bundle_hash/
  )?.[1] ?? "";
  const bundleMembers = [...memberBlock.matchAll(
    /\('([^']+)',\s*(\d+),\s*'([^']+)'\)/g
  )].map((match) => ({
    bundleCode: match[1],
    ordinal: Number(match[2]),
    permissionCode: match[3]
  }));
  const controlBlock = controls.match(
    /INSERT INTO b0_signed_runtime_control VALUES([\s\S]+?);\n\nCREATE TEMP TABLE b0_business_target_scope/
  )?.[1] ?? "";
  const runtimeControls = [...controlBlock.matchAll(
    /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(NULL|\d+)\)/g
  )].map((match) => ({
    key: match[1],
    kind: match[2],
    target: match[3],
    adapterVersion: match[4] === "NULL" ? null : Number(match[4])
  }));
  uniqueExact(permissionCodes, 25, "permission");
  uniqueExact(materializedPermissionCodes, 25, "materialized permission");
  if (
    [...permissionCodes].sort().join("\n") !==
    [...materializedPermissionCodes].sort().join("\n")
  ) throw new Error("materialized permission code drift");
  uniqueExact(bundles.map(({ code }) => code), 16, "bundle");
  uniqueExact(
    bundleMembers.map(({ bundleCode, ordinal }) => `${bundleCode}\t${ordinal}`),
    125,
    "bundle member ordinal"
  );
  uniqueExact(
    bundleMembers.map(({ bundleCode, permissionCode }) =>
      `${bundleCode}\t${permissionCode}`
    ),
    125,
    "bundle member permission"
  );
  uniqueExact(runtimeControls.map(({ key }) => key), 12, "runtime control");
  return {
    permissionCodes,
    bundles,
    bundleMembers,
    runtimeControls,
    dependencies: [
      { moduleCode: "homestay", requiredModuleCode: "asset" },
      { moduleCode: "housing_rental", requiredModuleCode: "asset" }
    ]
  };
}

export function validateDefinitionFixture({
  scopes,
  permissions,
  controls,
  bundles,
  dependencies,
  definitionNames
}, signed) {
  const canonicalScopes = new Set();
  for (const scope of scopes) {
    const values = [
      scope.tenantKey, scope.parkKey, scope.tenantEntityUuid, scope.parkEntityUuid
    ];
    if (
      scope.active !== true || scope.deleted === true || scope.orphan === true ||
      scope.global === true || values.some((value) =>
        typeof value !== "string" || value.trim() === ""
      ) || [scope.tenantKey, scope.parkKey].some((value) =>
        ["0", "all", "global", "*", "00000000-0000-0000-0000-000000000000"]
          .includes(value.trim().toLowerCase())
      )
    ) throw new Error("definition-scope-preflight-failed");
    const canonical = `${scope.tenantKey.trim()}\t${scope.parkKey.trim()}`;
    if (canonicalScopes.has(canonical)) throw new Error("canonical-scope-duplicate");
    canonicalScopes.add(canonical);
  }
  const exact = (actual, expected, label) => {
    if (actual.length !== new Set(actual).size) throw new Error(`${label}-duplicate`);
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    if (
      actualSet.size !== expectedSet.size ||
      [...actualSet].some((value) => !expectedSet.has(value)) ||
      [...expectedSet].some((value) => !actualSet.has(value))
    ) throw new Error(`${label}-exact-set-drift`);
  };
  exact(permissions, signed.permissionCodes, "permission");
  exact(controls, signed.runtimeControls.map(({ key }) => key), "runtime-control");
  exact(bundles, signed.bundles.map(({ code }) => code), "bundle");
  exact(
    dependencies,
    signed.dependencies.map(({ moduleCode, requiredModuleCode }) =>
      `${moduleCode}\t${requiredModuleCode}`
    ),
    "dependency"
  );
  exact(definitionNames, definitionNames, "definition-name");
  return true;
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = resolve(rootDir, "database/migrations");
const researchDir = resolve(
  rootDir,
  ".trellis/tasks/07-30-pr192-property-productization-remediation/research"
);
const seedPath = resolve(rootDir, "database/seeds/000001_s1_production_core.sql");

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function contractManifestBytes(inputs = FROZEN_INPUTS) {
  return `b0-contract-v1\n${inputs
    .map(([filename, digest]) => `${filename}\t${digest}\n`)
    .join("")}`;
}

export function assertNoTrackBDatabaseOverrides(environment) {
  assertNoDatabaseUrlOverrides(environment);
  const forbidden = [
    "PROPERTY_TRACK_B_DATABASE_URL",
    "PROPERTY_B_SCHEMA_DATABASE_URL",
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD"
  ].filter((key) => environment[key]);
  if (forbidden.length) {
    throw new Error(`Track B database overrides are forbidden: ${forbidden.join(", ")}`);
  }
}

export function parseCatalogMarkers(sql, filename) {
  const markers = [...sql.matchAll(
    /^-- B0_CATALOG_OBJECT (table|column|constraint|index|function|trigger)\t(public\.[^\r\n]+)$/gm
  )].map((match) => ({ kind: match[1], name: match[2] }));
  if (markers.length === 0) throw new Error(`${filename} has no B0 catalog markers`);
  const keys = markers.map(({ kind, name }) => `${kind}\t${name}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${filename} has duplicate B0 catalog markers`);
  }
  return markers;
}

function assertMarkerCoverage(sql, markers, filename) {
  const keys = new Set(markers.map(({ kind, name }) => `${kind}\t${name}`));
  const requireExact = (kind, name) => {
    if (!keys.has(`${kind}\t${name}`)) {
      throw new Error(`${filename} missing ${kind} catalog marker for ${name}`);
    }
  };
  for (const match of sql.matchAll(
    /^CREATE TABLE (?:IF NOT EXISTS )?(?:(?:public)\.)?([a-z][a-z0-9_]*)/gmi
  )) requireExact("table", `public.${match[1]}`);
  for (const match of sql.matchAll(
    /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?([a-z][a-z0-9_]*)/gmi
  )) requireExact("index", `public.${match[1]}`);
  for (const match of sql.matchAll(
    /^CREATE (?:OR REPLACE )?FUNCTION (?:(?:public)\.)?([a-z][a-z0-9_]*)\s*\(/gmi
  )) {
    if (![...keys].some((key) => key.startsWith(`function\tpublic.${match[1]}(`))) {
      throw new Error(`${filename} missing function catalog marker for public.${match[1]}`);
    }
  }
  for (const match of sql.matchAll(
    /^CREATE (?:CONSTRAINT )?TRIGGER ([a-z][a-z0-9_]*)/gmi
  )) {
    if (![...keys].some((key) => key.endsWith(`.${match[1]}`) && key.startsWith("trigger\t"))) {
      throw new Error(`${filename} missing trigger catalog marker for ${match[1]}`);
    }
  }
  for (const match of sql.matchAll(/\bCONSTRAINT (?!TRIGGER\b)([a-z][a-z0-9_]*)/gmi)) {
    if (![...keys].some(
      (key) => key.endsWith(`.${match[1]}`) && key.startsWith("constraint\t")
    )) throw new Error(`${filename} missing constraint catalog marker for ${match[1]}`);
  }
}

export function validateStaticContract() {
  for (const [filename, expected] of FROZEN_INPUTS) {
    const bytes = readFileSync(resolve(researchDir, filename));
    if (sha256(bytes) !== expected) throw new Error(`${filename} raw SHA drift`);
    if (bytes.includes(13)) throw new Error(`${filename} is not LF-only`);
  }
  if (sha256(contractManifestBytes()) !== B_CONTRACT_SHA) {
    throw new Error("B-contract digest mismatch");
  }
  const sharedContract = readFileSync(
    resolve(rootDir, "packages/shared/src/property-business/track-b-contracts.ts"),
    "utf8"
  );
  const endpointAuthority = readFileSync(
    resolve(
      rootDir,
      "packages/shared/src/property-business/track-b-endpoint-permissions.ts"
    ),
    "utf8"
  );
  if (!sharedContract.includes(`"${B_CONTRACT_SHA}"`)) {
    throw new Error("shared Track B contract SHA does not match the frozen manifest");
  }
  if ((endpointAuthority.match(/\brow\("/g) ?? []).length !== 49) {
    throw new Error("shared Track B endpoint authority must contain exactly 49 rows");
  }
  if (sha256(Buffer.from(endpointAuthority)) !== B_ENDPOINT_AUTHORITY_RAW_SHA256) {
    throw new Error("shared Track B endpoint authority raw SHA drift");
  }
  if (!endpointAuthority.includes(
    '"3cff469fa092cdf6d254c86f275be194734a5eb4a1abe9591abaf4c1748f5adf"'
  )) {
    throw new Error("shared Track B endpoint authority SHA does not match the frozen manifest");
  }
  const files = readdirSync(migrationsDir).filter((name) => /^000(?:18[5-9]|190)_/.test(name));
  if (JSON.stringify(files.sort()) !== JSON.stringify([...B_MIGRATIONS].sort())) {
    throw new Error(`B migration exact set mismatch: ${files.join(",")}`);
  }
  const entries = B_MIGRATIONS.map((filename) => {
    const sql = readFileSync(resolve(migrationsDir, filename), "utf8");
    if (!/^BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';/.test(sql)) {
      throw new Error(`${filename} transaction header mismatch`);
    }
    if (!/\nCOMMIT;\s*$/.test(sql)) throw new Error(`${filename} transaction footer mismatch`);
    if (/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(sql)) {
      throw new Error(`${filename} uses a concurrent index`);
    }
    if (/\bINSERT\s+INTO\s+(?:public\.)?(rel_role_perm|rel_user_role|rel_tenant_module)\b/i.test(sql)) {
      throw new Error(`${filename} writes a forbidden grant/assignment table`);
    }
    const markers = parseCatalogMarkers(sql, filename);
    assertMarkerCoverage(sql, markers, filename);
    return { filename, sql, sha: sha256(Buffer.from(sql)), markers };
  });
  const markerKeys = entries.flatMap(({ markers }) =>
    markers.map(({ kind, name }) => `${kind}\t${name}`)
  );
  if (new Set(markerKeys).size !== markerKeys.length) {
    throw new Error("B migration catalog markers are not globally unique");
  }
  const definitions = entries.find(({ filename }) => filename.startsWith("000189_"))?.sql ?? "";
  for (const canonicalRoute of [
    "/api/v1/property/identity-submissions/:submissionId/decisions",
    "/api/v1/property/tasks/:taskId/start",
    "/api/v1/property/tasks/:taskId/unblock",
    "/api/v1/property/occupancies/:occupancyId/release"
  ]) {
    if (!definitions.includes(canonicalRoute)) {
      throw new Error(`000189 canonical route token missing: ${canonicalRoute}`);
    }
  }
  if (/\/api\/v1\/property\/(?:tasks|occupancies)\/:id(?:\/|')/.test(definitions)) {
    throw new Error("000189 legacy task/occupancy route token drift");
  }
  const controls = entries.find(({ filename }) => filename.startsWith("000190_"))?.sql ?? "";
  if (!controls.includes(B_CONTRACT_SHA)) {
    throw new Error("000190 contract hash drift");
  }
  parseSignedDefinitionContract(entries);
  return entries;
}

export function schemaManifestBytes(entries, catalogSha, securitySha) {
  if (!/^[a-f0-9]{64}$/.test(securitySha ?? "")) {
    throw new Error("schema manifest requires a signed security artifact SHA");
  }
  return `${B_SCHEMA_MANIFEST_GRAMMAR}\n${entries
    .map(({ filename, sha }) => `${filename}\t${sha}\n`)
    .join("")}catalog\t${catalogSha}\nsecurity\t${securitySha}\n`;
}

export function validateSecurityFixture(fixture) {
  if (fixture.ownerClass !== "schema-owner") throw new Error("security-owner-drift");
  if (fixture.ownerIsApplication !== false) {
    throw new Error("security-application-owner-drift");
  }
  if (fixture.language !== "plpgsql") throw new Error("security-language-drift");
  if (fixture.securityDefiner !== true) {
    throw new Error("security-definer-drift");
  }
  if (fixture.volatility !== "v") throw new Error("security-volatility-drift");
  if (
    JSON.stringify(fixture.functionConfig) !==
    JSON.stringify(["search_path=pg_catalog"])
  ) throw new Error("security-proconfig-drift");
  if (fixture.publicCreate !== false) throw new Error("security-public-create-drift");
  if (fixture.applicationCreateViolationCount !== 0) {
    throw new Error("security-application-create-drift");
  }
  if (fixture.ownerOnlyExecute !== true) throw new Error("security-execute-acl-drift");
  if (fixture.directDmlAllowed !== false) throw new Error("security-direct-dml-drift");
  if (fixture.anomalyUpdateDeleteAllowed !== false) {
    throw new Error("security-anomaly-dml-drift");
  }
  if (fixture.approvedCommandExecute !== true) {
    throw new Error("security-approved-execute-drift");
  }
  if (fixture.rowSetExact !== true) throw new Error("security-row-set-drift");
  if (fixture.factsExact !== true) throw new Error("security-facts-drift");
  if (fixture.ephemeralLeak !== false) throw new Error("security-ephemeral-leak");
  return true;
}

function migrationNumber(filename) {
  const match = filename.match(/^(\d{6})_.+\.sql$/);
  return match ? Number(match[1]) : null;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function docker(args, options = {}) {
  return runDocker(args, { cwd: rootDir, ...options });
}

export async function waitForFinalPostgres({
  readLogs,
  probeReady,
  readState,
  delay = (milliseconds) =>
    new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)),
  maxAttempts = 120,
  intervalMilliseconds = 500
}) {
  let lastLogs = "";
  let lastState = null;
  let initComplete = false;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lastLogs = await readLogs();
    lastState = await readState();
    if (lastState?.Running === false) {
      throw new Error(
        `ephemeral PostgreSQL stopped before init-complete marker: ` +
        `state=${JSON.stringify(lastState)} logs=${lastLogs.slice(-4000)}`
      );
    }
    if (lastLogs.includes(POSTGRES_INIT_COMPLETE_MARKER)) {
      initComplete = true;
      break;
    }
    await delay(intervalMilliseconds);
  }
  if (!initComplete) {
    throw new Error(
      `ephemeral PostgreSQL init-complete marker timeout: ` +
      `state=${JSON.stringify(lastState)} logs=${lastLogs.slice(-4000)}`
    );
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await probeReady()) return;
    lastState = await readState();
    if (lastState?.Running === false) {
      throw new Error(
        `ephemeral PostgreSQL stopped before final readiness: ` +
        `state=${JSON.stringify(lastState)} logs=${lastLogs.slice(-4000)}`
      );
    }
    await delay(intervalMilliseconds);
  }
  throw new Error(
    `ephemeral PostgreSQL final readiness timeout: ` +
    `state=${JSON.stringify(lastState)} logs=${lastLogs.slice(-4000)}`
  );
}

function createHarness(runId) {
  const containerName = `pr192_track_b_schema_${runId}_db`;
  const databaseName = "pr192_track_b_schema_expand";
  const postgresUser = "pr192_b_schema";
  const postgresPassword = `${runId}_local_only`;
  const fixtureLabel = "pr192-track-b-schema-expand";
  let containerId = null;
  let volumeName = null;

  function psql(input, { tuplesOnly = false, allowFailure = false } = {}) {
    if (!containerId) throw new Error("ephemeral PostgreSQL is unavailable");
    return docker([
      "exec", "-i", containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1",
      ...(tuplesOnly ? ["-qAt", "-F", "|"] : ["-q"]),
      "-U", postgresUser, "-d", databaseName
    ], { input, allowFailure });
  }
  function query(sql) {
    const result = psql(sql, { tuplesOnly: true });
    return result.stdout.trim();
  }
  function psqlAsync(input) {
    if (!containerId) throw new Error("ephemeral PostgreSQL is unavailable");
    return new Promise((resolveResult, rejectResult) => {
      const child = spawn("docker", [
        "exec", "-i", containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1",
        "-q", "-U", postgresUser, "-d", databaseName
      ], { cwd: rootDir, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", rejectResult);
      child.on("close", (status) => resolveResult({ status, stdout, stderr }));
      child.stdin.end(input);
    });
  }
  async function waitReady() {
    await waitForFinalPostgres({
      readLogs: async () => {
        const logs = docker(["logs", "--tail", "120", containerId], { allowFailure: true });
        if (logs.status !== 0) {
          throw new Error(
            `ephemeral PostgreSQL readiness logs failed: ` +
            `${(logs.stderr || logs.stdout).trim()}`
          );
        }
        return `${logs.stdout}${logs.stderr}`;
      },
      probeReady: async () => docker(
        ["exec", containerId, "pg_isready", "-U", postgresUser, "-d", databaseName],
        { allowFailure: true }
      ).status === 0,
      readState: async () => {
        const inspected = inspectContainer(containerName, { cwd: rootDir });
        return inspected?.State ?? { Running: false, Status: "absent" };
      }
    });
  }
  function start() {
    const existing = inspectContainer(containerName, { cwd: rootDir });
    if (existing) throw new Error(`fixture container already exists: ${containerName}`);
    const created = docker(buildEphemeralPostgresRunArgs({
      containerName, databaseName, fixtureLabel, runId, postgresUser, postgresPassword
    }));
    const inspected = inspectContainer(containerName, { cwd: rootDir });
    containerId = inspected?.Id ?? null;
    volumeName = inspected?.Mounts?.find(
      (mount) => mount.Destination === "/var/lib/postgresql/data"
    )?.Name ?? null;
    containerId = resolveCreatedContainerId(created.stdout, inspected, {
      containerName, databaseName, fixtureLabel, runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
    });
    const exact = assertExactEphemeralPostgresContainer(inspected, {
      containerName, databaseName, fixtureLabel, runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
    });
    volumeName = exact.volumeName;
  }
  function cleanup() {
    const errors = [];
    if (containerId) {
      const stopped = docker(["stop", "--timeout", "5", containerId], { allowFailure: true });
      if (stopped.status !== 0) errors.push((stopped.stderr || stopped.stdout).trim());
    }
    let containerAbsent = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const inspected = docker(
        ["inspect", "--type", "container", containerName],
        { allowFailure: true }
      );
      if (inspected.status !== 0) {
        if (/No such (object|container)/i.test(inspected.stderr)) {
          containerAbsent = true;
        } else {
          errors.push(
            `container absence inspect failed: ${(inspected.stderr || inspected.stdout).trim()}`
          );
        }
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    if (!containerAbsent) {
      errors.push(`container cleanup timeout: ${containerName}`);
    }
    let volumeAbsent = true;
    if (volumeName) {
      let inspected = docker(["volume", "inspect", volumeName], { allowFailure: true });
      if (inspected.status === 0) {
        const removed = docker(["volume", "rm", volumeName], { allowFailure: true });
        if (removed.status !== 0) errors.push((removed.stderr || removed.stdout).trim());
        for (let attempt = 0; attempt < 30; attempt += 1) {
          inspected = docker(["volume", "inspect", volumeName], { allowFailure: true });
          if (inspected.status !== 0) break;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
      }
      volumeAbsent = inspected.status !== 0 && /No such volume/i.test(inspected.stderr);
      if (!volumeAbsent) {
        errors.push(`anonymous volume cleanup timeout: ${volumeName}`);
      }
    }
    return { container_absent: containerAbsent, anonymous_volume_absent: volumeAbsent, errors };
  }
  function captureFailureDiagnostics() {
    const captureErrors = [];
    let containerState = null;
    let logsTail = "";
    const inspected = docker(
      ["inspect", "--type", "container", containerName],
      { allowFailure: true }
    );
    if (inspected.status === 0) {
      try {
        const state = JSON.parse(inspected.stdout)?.[0]?.State;
        containerState = state ? {
          Status: state.Status ?? null,
          OOMKilled: state.OOMKilled ?? null,
          ExitCode: state.ExitCode ?? null,
          Error: state.Error ?? null,
          StartedAt: state.StartedAt ?? null,
          FinishedAt: state.FinishedAt ?? null
        } : null;
      } catch {
        captureErrors.push("container diagnostic inspect returned invalid JSON");
      }
    } else if (!/No such (object|container)/i.test(inspected.stderr)) {
      captureErrors.push(
        `container diagnostic inspect failed: ${(inspected.stderr || inspected.stdout).trim()}`
      );
    }
    if (containerId) {
      const logs = docker(
        ["logs", "--tail", "120", "--since", "5m", containerId],
        { allowFailure: true }
      );
      if (logs.status === 0) {
        logsTail = `${logs.stdout}${logs.stderr}`.slice(-16000);
      } else {
        captureErrors.push(
          `container diagnostic logs failed: ${(logs.stderr || logs.stdout).trim()}`
        );
      }
    }
    return {
      container_state: containerState,
      logs_tail: logsTail,
      capture_errors: captureErrors
    };
  }
  return {
    start, waitReady, psql, psqlAsync, query, cleanup, captureFailureDiagnostics
  };
}

function baselineMigrations() {
  return readdirSync(migrationsDir)
    .filter((filename) => {
      const number = migrationNumber(filename);
      return number !== null && number <= 182 && number !== 175;
    })
    .sort();
}

function bootstrapBaseline(harness) {
  for (const filename of baselineMigrations()) {
    harness.psql(readFileSync(resolve(migrationsDir, filename), "utf8"));
  }
  harness.psql(readFileSync(seedPath, "utf8"));
  for (const filename of [
    "000183_property_business_granular_rbac.sql",
    "000184_property_workbench_read_permissions.sql"
  ]) harness.psql(readFileSync(resolve(migrationsDir, filename), "utf8"));
  harness.psql(`
    BEGIN;
    INSERT INTO asset_park (
      tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark
    ) VALUES (
      '10000001','20000001',
      'B0_SCHEMA_GATE','B0 schema gate isolated park','enabled',false,1,
      'B0 schema gate isolated qualifying scope'
    );
    COMMIT;
  `);
  harness.psql(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id BIGSERIAL PRIMARY KEY, filename varchar(255) NOT NULL UNIQUE,
      checksum varchar(64) NOT NULL,
      status varchar(16) NOT NULL CHECK (status IN ('running','succeeded','failed')),
      started_at timestamptz NOT NULL, finished_at timestamptz, error_message text,
      executed_by varchar(255) NOT NULL, batch_id varchar(32) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function writeHistory(harness, entry, status, errorMessage = null) {
  const finished = status === "running" ? "NULL" : "clock_timestamp()";
  const error = errorMessage ? sqlLiteral(errorMessage.slice(0, 2000)) : "NULL";
  for (const table of ["sys_schema_migration_history", "schema_migrations"]) {
    harness.psql(`
      INSERT INTO public.${table} (
        filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id
      ) VALUES (
        ${sqlLiteral(entry.filename)},${sqlLiteral(entry.sha)},${sqlLiteral(status)},
        clock_timestamp(),${finished},${error},'codex-b0-gate','b0-schema-gate'
      )
      ON CONFLICT (filename) DO UPDATE SET
        checksum=EXCLUDED.checksum,status=EXCLUDED.status,
        finished_at=EXCLUDED.finished_at,error_message=EXCLUDED.error_message,
        updated_at=clock_timestamp();
    `);
  }
}

function applyTrackB(harness, entries) {
  for (const entry of entries) {
    writeHistory(harness, entry, "running");
    const result = harness.psql(entry.sql, { allowFailure: true });
    if (result.status !== 0) {
      const message = (result.stderr || result.stdout).trim();
      writeHistory(harness, entry, "failed", message);
      throw new Error(`${entry.filename} failed: ${message}`);
    }
    writeHistory(harness, entry, "succeeded");
  }
}

function assertScalar(harness, sql, expected, label) {
  const actual = harness.query(sql);
  if (actual !== String(expected)) {
    throw new Error(`${label}: expected ${expected}, got ${actual || "<empty>"}`);
  }
}

function parseJsonLines(value, label) {
  if (!value) return [];
  return value.split("\n").map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`${label} row ${index + 1} is not JSON`);
    }
  });
}

function normalizeCatalogValue(value) {
  if (typeof value === "string") {
    return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
      .split("\n").map((line) => line.replace(/[ \t]+$/u, "")).join("\n");
  }
  if (Array.isArray(value)) return value.map(normalizeCatalogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeCatalogValue(item)])
    );
  }
  return value;
}

function verifyDefinitionPhysicalContract(harness, signed) {
  const permissionValues = signed.permissionCodes
    .map((code) => `(${sqlLiteral(code)})`).join(",");
  const controlValues = signed.runtimeControls.map(({ key, kind, target, adapterVersion }) =>
    `(${sqlLiteral(key)},${sqlLiteral(kind)},${sqlLiteral(target)},` +
    `${adapterVersion === null ? "NULL" : adapterVersion})`
  ).join(",");
  const bundleValues = signed.bundles.map(({ code, name }) =>
    `(${sqlLiteral(code)},${sqlLiteral(name)})`
  ).join(",");
  const memberValues = signed.bundleMembers.map(
    ({ bundleCode, ordinal, permissionCode }) =>
      `(${sqlLiteral(bundleCode)},${ordinal},${sqlLiteral(permissionCode)})`
  ).join(",");
  const dependencyValues = signed.dependencies.map(
    ({ moduleCode, requiredModuleCode }) =>
      `(${sqlLiteral(moduleCode)},${sqlLiteral(requiredModuleCode)})`
  ).join(",");

  assertScalar(harness, `
    WITH business_scope(tenant_key,park_key) AS (
      SELECT DISTINCT btrim(assignment.tenant_id),btrim(assignment.park_id)
      FROM public.rel_tenant_module assignment
      JOIN public.sys_module module ON module.id=assignment.module_id
       AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
      WHERE assignment.enabled=true AND assignment.status='enabled'
        AND assignment.is_deleted=false
        AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
        AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
    )
    SELECT count(*) FROM business_scope
    WHERE tenant_key IS NULL OR park_key IS NULL
       OR lower(tenant_key) IN (
         '','0','all','global','*','00000000-0000-0000-0000-000000000000')
       OR lower(park_key) IN (
         '','0','all','global','*','00000000-0000-0000-0000-000000000000')
  `, 0, "definition business scope null/empty/global");
  assertScalar(harness, `
    WITH business_scope(tenant_key,park_key) AS (
      SELECT DISTINCT btrim(assignment.tenant_id),btrim(assignment.park_id)
      FROM public.rel_tenant_module assignment
      JOIN public.sys_module module ON module.id=assignment.module_id
       AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
      WHERE assignment.enabled=true AND assignment.status='enabled'
        AND assignment.is_deleted=false
        AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
        AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
    )
    SELECT count(*) FROM business_scope scope
    WHERE (
      SELECT count(*)
      FROM public.sys_tenant tenant_scope
      WHERE btrim(tenant_scope.tenant_id)=scope.tenant_key
        AND tenant_scope.status=1 AND tenant_scope.is_deleted=false
        AND (tenant_scope.expire_time IS NULL OR tenant_scope.expire_time>clock_timestamp())
    ) <> 1 OR (
      SELECT count(*)
      FROM public.asset_park park_scope
      WHERE btrim(park_scope.tenant_id)=scope.tenant_key
        AND btrim(park_scope.park_id)=scope.park_key
        AND park_scope.status='enabled' AND park_scope.is_deleted=false
    ) <> 1
  `, 0, "definition business scope exact-one mapping");
  assertScalar(harness, `
    WITH business_scope(tenant_key,park_key) AS (
      SELECT btrim(assignment.tenant_id),btrim(assignment.park_id)
      FROM public.rel_tenant_module assignment
      JOIN public.sys_module module ON module.id=assignment.module_id
       AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
      WHERE assignment.enabled=true AND assignment.status='enabled'
        AND assignment.is_deleted=false
        AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
        AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
    )
    SELECT count(*) FROM (
      SELECT tenant_key,park_key
      FROM business_scope
      GROUP BY tenant_key,park_key
      HAVING count(*) < 1
    ) duplicate
  `, 0, "definition canonical business pair uniqueness");

  assertScalar(harness, `
    WITH signed(code) AS (VALUES ${permissionValues}),
    target_scope AS (
      SELECT DISTINCT btrim(assignment.tenant_id) tenant_key,
                      btrim(assignment.park_id) park_key
      FROM public.rel_tenant_module assignment
      JOIN public.sys_module module ON module.id=assignment.module_id
       AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
      WHERE assignment.enabled=true AND assignment.status='enabled'
        AND assignment.is_deleted=false
        AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
        AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
    ),
    permission_scope AS (
      SELECT tenant_key,park_key FROM (
        SELECT target_scope.*,
          row_number() OVER (
            PARTITION BY tenant_key ORDER BY convert_to(park_key,'UTF8')
          ) park_ordinal
        FROM target_scope
      ) ranked WHERE park_ordinal=1
    ),
    expected AS (
      SELECT scope.tenant_key,scope.park_key,signed.code
      FROM permission_scope scope CROSS JOIN signed
    ),
    actual AS (
      SELECT tenant_id,park_id,code
      FROM public.sys_permission
      WHERE remark='PR192 Track B frozen permission definition' AND is_deleted=false
    ),
    drift AS (
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    )
    SELECT count(*) FROM drift
  `, 0, "signed 25 permission bidirectional exact-set");

  assertScalar(harness, `
    WITH signed(control_key,control_kind,target,adapter_version) AS (
      VALUES ${controlValues}
    ),
    target_scope AS (
      SELECT DISTINCT btrim(assignment.tenant_id) tenant_id,
                      btrim(assignment.park_id) park_id
      FROM public.rel_tenant_module assignment
      JOIN public.sys_module module ON module.id=assignment.module_id
       AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
      WHERE assignment.enabled=true AND assignment.status='enabled'
        AND assignment.is_deleted=false
        AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
        AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
    ),
    expected AS (
      SELECT scope.tenant_id,scope.park_id,signed.control_key,
             signed.control_kind,signed.target,signed.adapter_version
      FROM target_scope scope CROSS JOIN signed
    ),
    actual AS (
      SELECT tenant_id,park_id,control_key,control_kind,target,adapter_version
      FROM public.sys_property_runtime_control
    ),
    drift AS (
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    )
    SELECT count(*) FROM drift
  `, 0, "signed 12 control bidirectional exact-set");

  assertScalar(harness, `
    WITH signed(bundle_code,bundle_name) AS (VALUES ${bundleValues}),
    actual AS (
      SELECT bundle_code,bundle_name FROM public.sys_property_permission_bundle
      WHERE is_deleted=false
    ),
    drift AS (
      (SELECT * FROM signed EXCEPT SELECT * FROM actual)
      UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM signed)
    ) SELECT count(*) FROM drift
  `, 0, "signed bundle bidirectional exact-set");
  assertScalar(harness, `
    WITH signed(bundle_code,member_ordinal,permission_code) AS (VALUES ${memberValues}),
    actual AS (
      SELECT bundle.bundle_code,member.member_ordinal::integer,member.permission_code
      FROM public.sys_property_permission_bundle bundle
      JOIN public.rel_property_permission_bundle_member member
        ON member.bundle_id=bundle.id AND member.is_deleted=false
      WHERE bundle.is_deleted=false
    ),
    drift AS (
      (SELECT * FROM signed EXCEPT SELECT * FROM actual)
      UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM signed)
    ) SELECT count(*) FROM drift
  `, 0, "signed bundle member bidirectional exact-set");
  assertScalar(harness, `
    WITH signed(module_code,required_code) AS (VALUES ${dependencyValues}),
    actual AS (
      SELECT module.module_code,required.module_code
      FROM public.sys_module_dependency dependency
      JOIN public.sys_module module ON module.id=dependency.module_id
      JOIN public.sys_module required ON required.id=dependency.required_module_id
      WHERE dependency.remark='PR192 Track B frozen hard dependency'
        AND dependency.dependency_kind='hard'
        AND dependency.is_enabled=true AND dependency.is_deleted=false
    ),
    drift AS (
      (SELECT * FROM signed EXCEPT SELECT * FROM actual)
      UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM signed)
    ) SELECT count(*) FROM drift
  `, 0, "signed dependency bidirectional exact-set");
}

function extractCatalog(harness, entries) {
  const markers = entries.flatMap((entry) => entry.markers);
  const markerValues = markers
    .map(({ kind, name }) => `(${sqlLiteral(kind)},${sqlLiteral(name)})`)
    .join(",");
  const structuralRows = parseJsonLines(harness.query(`
    WITH b0_catalog_target(kind,name) AS (VALUES ${markerValues}),
    catalog(kind,name,definition) AS (
      SELECT 'table',n.nspname||'.'||c.relname,
        jsonb_build_object('persistence',c.relpersistence::text,
          'partitionKey',coalesce(pg_get_partkeydef(c.oid),''),
          'rlsEnabled',c.relrowsecurity)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN b0_catalog_target t ON t.kind='table' AND t.name=n.nspname||'.'||c.relname
      UNION ALL
      SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,
        jsonb_build_object('dataType',format_type(a.atttypid,a.atttypmod),
          'default',coalesce(pg_get_expr(d.adbin,d.adrelid),''),
          'generated',a.attgenerated::text,'identity',a.attidentity::text,
          'notNull',a.attnotnull,'ordinal',a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      JOIN b0_catalog_target t ON t.kind='column'
        AND t.name=n.nspname||'.'||c.relname||'.'||a.attname
      WHERE a.attnum>0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'constraint',n.nspname||'.'||c.relname||'.'||x.conname,
        jsonb_build_object('deferrable',x.condeferrable,
          'definition',pg_get_constraintdef(x.oid,false),
          'initiallyDeferred',x.condeferred,'type',x.contype::text)
      FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN b0_catalog_target t ON t.kind='constraint'
        AND t.name=n.nspname||'.'||c.relname||'.'||x.conname
      UNION ALL
      SELECT 'index',ni.nspname||'.'||i.relname,
        jsonb_build_object('definition',pg_get_indexdef(i.oid),
          'primary',x.indisprimary,'unique',x.indisunique,'valid',x.indisvalid)
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
      JOIN pg_namespace ni ON ni.oid=i.relnamespace
      JOIN b0_catalog_target t ON t.kind='index' AND t.name=ni.nspname||'.'||i.relname
      UNION ALL
      SELECT 'function',n.nspname||'.'||p.proname||'('||
          pg_get_function_identity_arguments(p.oid)||')',
        jsonb_build_object('definition',pg_get_functiondef(p.oid),
          'language',l.lanname,'securityDefiner',p.prosecdef,
          'volatility',p.provolatile::text)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
      JOIN b0_catalog_target t ON t.kind='function'
        AND t.name=n.nspname||'.'||p.proname||'('||
          pg_get_function_identity_arguments(p.oid)||')'
      UNION ALL
      SELECT 'trigger',n.nspname||'.'||c.relname||'.'||g.tgname,
        jsonb_build_object('definition',pg_get_triggerdef(g.oid,false),
          'enabled',g.tgenabled::text)
      FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN b0_catalog_target t ON t.kind='trigger'
        AND t.name=n.nspname||'.'||c.relname||'.'||g.tgname
      WHERE NOT g.tgisinternal
    )
    SELECT json_build_object('kind',kind,'name',name,'definition',definition)::text
    FROM catalog ORDER BY kind COLLATE "C",name COLLATE "C";
  `), "catalog");
  if (structuralRows.length !== markers.length) {
    throw new Error(
      `catalog marker resolution: expected ${markers.length}, got ${structuralRows.length}`
    );
  }

  const definitionRows = parseJsonLines(harness.query(`
    BEGIN;
    CREATE TEMP TABLE b0_business_target_scope (
      tenant_key text,
      park_key text,
      UNIQUE NULLS NOT DISTINCT (tenant_key,park_key)
    ) ON COMMIT DROP;
    INSERT INTO b0_business_target_scope(tenant_key,park_key)
    SELECT DISTINCT btrim(assignment.tenant_id),btrim(assignment.park_id)
    FROM public.rel_tenant_module assignment
    JOIN public.sys_module module ON module.id=assignment.module_id
      AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
    WHERE assignment.enabled=true AND assignment.status='enabled'
      AND assignment.is_deleted=false
      AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
      AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp());

    CREATE TEMP TABLE b0_scope_canonical (
      tenant_key text NOT NULL,
      park_key text NOT NULL,
      tenant_canonical text NOT NULL,
      park_canonical text NOT NULL,
      tenant_entity_uuid uuid NOT NULL,
      park_entity_uuid uuid NOT NULL,
      PRIMARY KEY (tenant_key,park_key),
      UNIQUE (tenant_canonical,park_canonical),
      CHECK (tenant_key=btrim(tenant_key) AND park_key=btrim(park_key)),
      CHECK (tenant_canonical='tenant-id:'||tenant_key),
      CHECK (park_canonical='park-id:'||park_key)
    ) ON COMMIT DROP;
    INSERT INTO b0_scope_canonical(
      tenant_key,park_key,tenant_canonical,park_canonical,
      tenant_entity_uuid,park_entity_uuid
    )
    SELECT scope.tenant_key,scope.park_key,
      'tenant-id:'||scope.tenant_key,'park-id:'||scope.park_key,
      tenant.id,park.id
    FROM b0_business_target_scope scope
    JOIN public.sys_tenant tenant
      ON btrim(tenant.tenant_id)=scope.tenant_key
      AND tenant.status=1 AND tenant.is_deleted=false
      AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())
    JOIN public.asset_park park
      ON btrim(park.tenant_id)=scope.tenant_key
      AND btrim(park.park_id)=scope.park_key
      AND park.status='enabled' AND park.is_deleted=false;
    DO $scope$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM b0_business_target_scope
        WHERE tenant_key IS NULL OR park_key IS NULL
           OR lower(tenant_key) IN (
          '','0','all','global','*','00000000-0000-0000-0000-000000000000'
        )
           OR lower(park_key) IN (
          '','0','all','global','*','00000000-0000-0000-0000-000000000000'
        )
      ) OR
        (SELECT count(*) FROM b0_business_target_scope) <>
        (SELECT count(*) FROM b0_scope_canonical)
      THEN
        RAISE EXCEPTION 'b0-scope-canonical-preflight-failed'
          USING ERRCODE='23514';
      END IF;
    END
    $scope$;

    CREATE TEMP TABLE b0_permission_scope_canonical (
      tenant_key text NOT NULL,
      park_key text NOT NULL,
      PRIMARY KEY (tenant_key),
      UNIQUE (tenant_key,park_key)
    ) ON COMMIT DROP;
    INSERT INTO b0_permission_scope_canonical(tenant_key,park_key)
      SELECT tenant_key,park_key FROM (
        SELECT tenant_key,park_key,
          row_number() OVER (
            PARTITION BY tenant_key ORDER BY convert_to(park_key,'UTF8')
          ) park_ordinal
        FROM b0_scope_canonical
      ) ranked WHERE park_ordinal=1;

    WITH rows(kind,name,definition) AS (
      SELECT 'definition-row'::text,
        'definition.module-dependency.'||m.module_code||'.'||r.module_code,
        jsonb_build_object('rowType','module-dependency','values',jsonb_build_object(
          'moduleCode',m.module_code,'requiredModuleCode',r.module_code,
          'dependencyKind',d.dependency_kind,'isEnabled',d.is_enabled))
      FROM sys_module_dependency d
      JOIN sys_module m ON m.id=d.module_id
      JOIN sys_module r ON r.id=d.required_module_id
      WHERE d.is_deleted=false
      UNION ALL
      SELECT 'definition-row',
        'definition.permission.'||canonical_scope.tenant_canonical||'.'||p.code,
        jsonb_build_object('rowType','permission','values',jsonb_build_object(
          'tenantId',canonical_scope.tenant_key,
          'parkId',canonical_scope.park_key,
          'code',p.code,'name',p.name,'parentCode',parent.code,
          'resource',p.resource,'action',p.action,
          'permissionPath',p.permission_path,'permPath',p.perm_path,
          'permissionLevel',p.permission_level,'level',p.level,'sortNo',p.sort_no,
          'permissionType',p.permission_type,'permType',p.perm_type,
          'apiMethod',p.api_method,'apiPath',p.api_path,
          'frontendRoute',p.frontend_route,'visible',p.visible,
          'keepAlive',p.keep_alive,'alwaysShow',p.always_show,
          'isSystem',p.is_system,'isBuiltin',p.is_builtin,
          'isTenantCustom',p.is_tenant_custom,'isEnabled',p.is_enabled,'status',p.status))
      FROM sys_permission p
      JOIN b0_permission_scope_canonical permission_scope
        ON permission_scope.tenant_key=p.tenant_id
       AND permission_scope.park_key=p.park_id
      JOIN b0_scope_canonical canonical_scope
        ON canonical_scope.tenant_key=permission_scope.tenant_key
       AND canonical_scope.park_key=permission_scope.park_key
      LEFT JOIN sys_permission parent ON parent.id=p.parent_id
      WHERE p.is_deleted=false AND p.remark='PR192 Track B frozen permission definition'
      UNION ALL
      SELECT 'definition-row','definition.bundle.'||b.bundle_code,
        jsonb_build_object('rowType','bundle','values',jsonb_build_object(
          'bundleCode',b.bundle_code,'bundleName',b.bundle_name,
          'definitionVersion',b.definition_version,
          'definitionHash',b.definition_hash,'status',b.status))
      FROM sys_property_permission_bundle b WHERE b.is_deleted=false
      UNION ALL
      SELECT 'definition-row','definition.bundle-member.'||b.bundle_code||'.'||
          lpad(m.member_ordinal::text,4,'0'),
        jsonb_build_object('rowType','bundle-member','values',jsonb_build_object(
          'bundleCode',b.bundle_code,'memberOrdinal',m.member_ordinal,
          'permissionCode',m.permission_code))
      FROM rel_property_permission_bundle_member m
      JOIN sys_property_permission_bundle b ON b.id=m.bundle_id
      WHERE b.is_deleted=false AND m.is_deleted=false
      UNION ALL
      SELECT 'definition-row','definition.runtime-control.'||
          canonical_scope.tenant_canonical||'.'||
          canonical_scope.park_canonical||'.'||c.control_key,
        jsonb_build_object('rowType','runtime-control','values',jsonb_build_object(
          'tenantId',canonical_scope.tenant_key,
          'parkId',canonical_scope.park_key,
          'controlKey',c.control_key,
          'controlKind',c.control_kind,'target',c.target,
          'adapterVersion',c.adapter_version,'contractHash',c.contract_hash,
          'enabled',c.enabled,'controlMode',c.control_mode,
          'disabledReason',c.disabled_reason))
      FROM sys_property_runtime_control c
      JOIN b0_scope_canonical canonical_scope
        ON canonical_scope.tenant_key=c.tenant_id
       AND canonical_scope.park_key=c.park_id
    )
    SELECT json_build_object('kind',kind,'name',name,'definition',definition)::text
    FROM rows ORDER BY kind COLLATE "C",name COLLATE "C";
    COMMIT;
  `), "definition catalog");
  const permissionScopeCount = Number(harness.query(`
    SELECT count(DISTINCT tenant_id) FROM sys_permission
    WHERE remark='PR192 Track B frozen permission definition' AND is_deleted=false
  `));
  const controlScopeCount = Number(harness.query(`
    SELECT count(DISTINCT tenant_id||E'\\t'||park_id) FROM sys_property_runtime_control
  `));
  const expectedDefinitionCount =
    2 + permissionScopeCount * 25 + 16 + 125 + controlScopeCount * 12;
  if (definitionRows.length !== expectedDefinitionCount) {
    throw new Error(
      `definition catalog exact count: expected ${expectedDefinitionCount}, got ${definitionRows.length}`
    );
  }

  const allRows = [...structuralRows, ...definitionRows].map((row) => ({
    ...row,
    definition: normalizeCatalogValue(row.definition)
  })).sort((left, right) =>
    Buffer.compare(
      Buffer.from(`${left.kind}\t${left.name}`),
      Buffer.from(`${right.kind}\t${right.name}`)
    )
  );
  const canonicalNames = allRows.map(({ kind, name }) => `${kind}\t${name}`);
  if (new Set(canonicalNames).size !== canonicalNames.length) {
    throw new Error("catalog canonical definition target duplicate");
  }
  const unqualifiedCanonicalNames = allRows.map(({ name }) => name);
  if (new Set(unqualifiedCanonicalNames).size !== unqualifiedCanonicalNames.length) {
    throw new Error("catalog canonical name duplicate across kinds");
  }
  const fixture = `${B_SCHEMA_CATALOG_GRAMMAR}\n` + canonicalize({
    definition: {
      dataType: "uuid", default: "uuid_generate_v4()", generated: "",
      identity: "", notNull: true, ordinal: 1
    },
    kind: "column",
    name: "public.example.id"
  }) + "\n";
  if (sha256(fixture) !== "39d3638f9ddc76c07232d5707ef73c040319590cf807fd68098c6b19733dbd02") {
    throw new Error("RFC 8785 exporter golden fixture mismatch");
  }
  const bytes = `${B_SCHEMA_CATALOG_GRAMMAR}\n${allRows.map((row) => canonicalize({
    definition: row.definition, kind: row.kind, name: row.name
  })).join("\n")}\n`;
  return {
    bytes,
    sha: sha256(bytes),
    markerCount: markers.length,
    definitionRowCount: definitionRows.length
  };
}

function verifyIdentityRuntimeAcl(harness, entries) {
  const tenantId = harness.query(`
    SELECT lower(id::text) FROM public.sys_tenant
    WHERE tenant_id='10000001' AND status=1 AND is_deleted=false LIMIT 1
  `);
  if (!/^[0-9a-f-]{36}$/.test(tenantId)) {
    throw new Error("identity ACL fixture tenant is unavailable");
  }
  const commandSignatures = entries
    .flatMap(({ markers }) => markers)
    .filter(({ kind, name }) =>
      kind === "function" &&
      IDENTITY_COMMAND_FUNCTIONS.some((functionName) =>
        name.startsWith(`public.${functionName}(`)
      )
    )
    .map(({ name }) => name);
  if (commandSignatures.length !== 6) {
    throw new Error(`identity command marker exact count: expected 6, got ${commandSignatures.length}`);
  }
  harness.psql(`
    CREATE ROLE b0_identity_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    GRANT USAGE ON SCHEMA public TO b0_identity_runtime;
    ${commandSignatures.map((signature) =>
      `GRANT EXECUTE ON FUNCTION ${signature} TO b0_identity_runtime;`
    ).join("\n")}
    INSERT INTO public.biz_party (
      id,tenant_id,park_id,party_type,display_name,source_domain,
      verification_status,consent_status,version
    ) VALUES (
      'ba000000-0000-4000-8000-000000000101',
      ${sqlLiteral(tenantId)},
      'ba000000-0000-4000-8000-000000000001',
      'person','B0 identity ACL fixture','homestay','unverified','granted',1
    );
  `);
  assertScalar(harness, `
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (${IDENTITY_COMMAND_FUNCTIONS.map(sqlLiteral).join(",")})
      AND has_function_privilege('b0_identity_runtime',p.oid,'EXECUTE')
  `, 6, "approved runtime role command EXECUTE");
  const directDml = harness.psql(`
    SET ROLE b0_identity_runtime;
    UPDATE public.biz_party
    SET identity_version=identity_version+1
    WHERE id='ba000000-0000-4000-8000-000000000101';
  `, { allowFailure: true });
  if (
    directDml.status === 0 ||
    !/permission denied for table biz_party/i.test(directDml.stderr || directDml.stdout)
  ) {
    throw new Error("identity runtime direct Party identity DML was not denied");
  }
  harness.psql(`
    BEGIN;
    SET LOCAL ROLE b0_identity_runtime;
    SELECT (public.fn_party_identity_create_draft_cas(
      ${sqlLiteral(tenantId)},
      'ba000000-0000-4000-8000-000000000001',
      'ba000000-0000-4000-8000-000000000101',
      'ba000000-0000-4000-8000-000000000102',
      0,NULL,NULL,NULL
    )).id;
    COMMIT;
  `);
  assertScalar(harness, `
    SELECT count(*) FROM public.biz_party_identity_submission
    WHERE party_id='ba000000-0000-4000-8000-000000000101'
      AND status='draft' AND identity_version=1 AND submission_attempt=1
  `, 1, "SECURITY DEFINER create draft command");
  harness.psql(`
    ${commandSignatures.map((signature) =>
      `REVOKE EXECUTE ON FUNCTION ${signature} FROM b0_identity_runtime;`
    ).join("\n")}
    REVOKE USAGE ON SCHEMA public FROM b0_identity_runtime;
    DROP ROLE b0_identity_runtime;
  `);
  return {
    approved_command_execute_count: 6,
    direct_party_identity_dml_denied: true,
    security_definer_command_succeeded: true,
    temporary_role_removed: true
  };
}

function buildSecurityArtifact(harness, functionRows, runtimeAcl) {
  const identityAuthorityTables = [
    "biz_party_identity_submission",
    "biz_party_identity_snapshot",
    "biz_party_identity_decision",
    "biz_party_identity_assignment_audit",
    "rel_party_identity_snapshot_file",
    "rel_party_identity_draft_file"
  ];
  const anomalyAuthorityTables = [
    "biz_property_migration_anomaly",
    "biz_property_migration_anomaly_audit"
  ];
  const authorityTables = [...identityAuthorityTables, ...anomalyAuthorityTables];
  const relationRows = parseJsonLines(harness.query(`
    SELECT json_build_object(
      'name','public.'||relation.relname,
      'applicationInsertViolationCount',count(*) FILTER (
        WHERE acl.grantee NOT IN (0,relation.relowner) AND acl.privilege_type='INSERT'),
      'applicationUpdateViolationCount',count(*) FILTER (
        WHERE acl.grantee NOT IN (0,relation.relowner) AND acl.privilege_type='UPDATE'),
      'applicationDeleteViolationCount',count(*) FILTER (
        WHERE acl.grantee NOT IN (0,relation.relowner) AND acl.privilege_type='DELETE'),
      'publicInsert',count(*) FILTER (
        WHERE acl.grantee=0 AND acl.privilege_type='INSERT')>0,
      'publicUpdate',count(*) FILTER (
        WHERE acl.grantee=0 AND acl.privilege_type='UPDATE')>0,
      'publicDelete',count(*) FILTER (
        WHERE acl.grantee=0 AND acl.privilege_type='DELETE')>0
    )::text
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl,acldefault('r',relation.relowner))
    ) acl
    WHERE namespace.nspname='public'
      AND relation.relname IN (${authorityTables.map(sqlLiteral).join(",")})
    GROUP BY relation.relname
    ORDER BY relation.relname COLLATE "C"
  `), "relation security");
  if (relationRows.length !== 8) throw new Error("relation security exact count mismatch");
  const identityColumnApplicationUpdateViolationCount = Number(harness.query(`
    SELECT count(*)
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid=attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
    WHERE namespace.nspname='public' AND relation.relname='biz_party'
      AND attribute.attname IN (
        'identity_version','current_identity_submission_id',
        'current_verified_submission_id','identity_document_type',
        'identity_number_encrypted','identity_number_hash','identity_number_masked'
      )
      AND acl.grantee NOT IN (0,relation.relowner) AND acl.privilege_type='UPDATE'
  `));
  const tableWideApplicationUpdateViolationCount = Number(harness.query(`
    SELECT count(*)
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl,acldefault('r',relation.relowner))
    ) acl
    WHERE namespace.nspname='public' AND relation.relname='biz_party'
      AND acl.grantee NOT IN (0,relation.relowner) AND acl.privilege_type='UPDATE'
  `));
  const applicationCreateViolationCount = Number(harness.query(`
    SELECT count(*)
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(namespace.nspacl,acldefault('n',namespace.nspowner))
    ) acl
    WHERE namespace.nspname='public' AND acl.grantee NOT IN (0,namespace.nspowner)
      AND acl.privilege_type='CREATE'
  `));
  const publicCreate = harness.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_namespace namespace
      CROSS JOIN LATERAL aclexplode(
        coalesce(namespace.nspacl,acldefault('n',namespace.nspowner))
      ) acl
      WHERE namespace.nspname='public' AND acl.grantee=0
        AND acl.privilege_type='CREATE'
    )
  `) === "t";
  const rows = [
    ...functionRows.map((row) => ({
      kind: "function-security",
      name: row.name,
      facts: {
        language: row.language,
        ownerApproved: row.owner === "pr192_b_schema",
        ownerIsApplication: false,
        proconfig: row.config,
        publicExecute: row.publicExecute,
        securityDefiner: row.securityDefiner,
        unexpectedExecuteGrantCount: row.unexpectedExecuteGrantCount,
        volatility: row.volatility
      }
    })),
    ...relationRows
      .filter(({ name }) =>
        identityAuthorityTables.includes(name.replace(/^public\./, ""))
      )
      .map((row) => ({
      kind: "relation-security",
      name: row.name,
      facts: {
        applicationDeleteViolationCount: row.applicationDeleteViolationCount,
        applicationInsertViolationCount: row.applicationInsertViolationCount,
        applicationUpdateViolationCount: row.applicationUpdateViolationCount,
        publicDelete: row.publicDelete,
        publicInsert: row.publicInsert,
        publicUpdate: row.publicUpdate
      }
    })),
    ...relationRows
      .filter(({ name }) =>
        anomalyAuthorityTables.includes(name.replace(/^public\./, ""))
      )
      .map((row) => ({
        kind: "anomaly-relation-security",
        name: row.name,
        facts: {
          applicationDeleteViolationCount: row.applicationDeleteViolationCount,
          applicationUpdateViolationCount: row.applicationUpdateViolationCount,
          publicDelete: row.publicDelete,
          publicUpdate: row.publicUpdate
        }
      })),
    {
      kind: "column-security",
      name: "public.biz_party#identity-columns",
      facts: {
        identityColumnApplicationUpdateViolationCount,
        tableWideApplicationUpdateViolationCount
      }
    },
    {
      kind: "schema-security",
      name: "public",
      facts: { applicationCreateViolationCount, publicCreate }
    },
    {
      kind: "runtime-probe",
      name: "identity-command-authority",
      facts: {
        approvedCommandExecuteCount: runtimeAcl.approved_command_execute_count,
        directPartyIdentityDmlDenied: runtimeAcl.direct_party_identity_dml_denied,
        securityDefinerCommandSucceeded: runtimeAcl.security_definer_command_succeeded,
        temporaryRoleRemoved: runtimeAcl.temporary_role_removed
      }
    }
  ];
  const keys = rows.map(({ kind, name }) => `${kind}\t${name}`);
  if (rows.length !== 22 || new Set(keys).size !== rows.length ||
      new Set(rows.map(({ name }) => name)).size !== rows.length) {
    throw new Error("security artifact target exact-set or duplicate mismatch");
  }
  rows.sort((left, right) => Buffer.compare(
    Buffer.from(`${left.kind}\t${left.name}`),
    Buffer.from(`${right.kind}\t${right.name}`)
  ));
  validateSecurityFixture({
    ownerClass: functionRows.every(({ owner }) =>
      owner === "pr192_b_schema"
    ) ? "schema-owner" : "invalid",
    ownerIsApplication: false,
    language: functionRows.every(({ language }) => language === "plpgsql")
      ? "plpgsql" : "invalid",
    securityDefiner: functionRows.every(({ securityDefiner }) => securityDefiner),
    volatility: functionRows.every(({ volatility }) => volatility === "v")
      ? "v" : "invalid",
    functionConfig: functionRows.every(({ config }) =>
      JSON.stringify(config) === JSON.stringify(["search_path=pg_catalog"])
    ) ? ["search_path=pg_catalog"] : [],
    publicCreate,
    applicationCreateViolationCount,
    ownerOnlyExecute: functionRows.every(({ publicExecute, unexpectedExecuteGrantCount }) =>
      !publicExecute && unexpectedExecuteGrantCount === 0),
    directDmlAllowed:
      relationRows.some((row) =>
        identityAuthorityTables.includes(row.name.replace(/^public\./, ""))
          ? row.applicationInsertViolationCount !== 0 ||
            row.applicationUpdateViolationCount !== 0 ||
            row.applicationDeleteViolationCount !== 0 ||
            row.publicInsert || row.publicUpdate || row.publicDelete
          : row.applicationUpdateViolationCount !== 0 ||
            row.applicationDeleteViolationCount !== 0 ||
            row.publicUpdate || row.publicDelete
      ) ||
      identityColumnApplicationUpdateViolationCount !== 0 ||
      tableWideApplicationUpdateViolationCount !== 0 ||
      !runtimeAcl.direct_party_identity_dml_denied,
    anomalyUpdateDeleteAllowed: relationRows.some((row) =>
      anomalyAuthorityTables.includes(row.name.replace(/^public\./, "")) &&
      (
        row.applicationUpdateViolationCount !== 0 ||
        row.applicationDeleteViolationCount !== 0 ||
        row.publicUpdate || row.publicDelete
      )
    ),
    approvedCommandExecute:
      runtimeAcl.approved_command_execute_count === 6 &&
      runtimeAcl.security_definer_command_succeeded,
    rowSetExact: rows.length === 22,
    factsExact: true,
    ephemeralLeak: false
  });
  const fixture = `${B_SCHEMA_SECURITY_GRAMMAR}\n${canonicalize({
    facts: {
      applicationDeleteViolationCount: 0,
      applicationUpdateViolationCount: 0,
      publicDelete: false,
      publicUpdate: false
    },
    kind: "anomaly-relation-security",
    name: "public.example_anomaly"
  })}\n${canonicalize({
    facts: {
      publicExecute: false,
      searchPath: ["pg_catalog"],
      securityDefiner: true
    },
    kind: "function-security",
    name: "public.example()"
  })}\n`;
  if (sha256(fixture) !== "ecd0c793f1687d6e531c3879c4fa903c5cbcaf752c8c8a477b4702b6c80054b9") {
    throw new Error("security artifact RFC 8785 exporter golden fixture mismatch");
  }
  const bytes = `${B_SCHEMA_SECURITY_GRAMMAR}\n${
    rows.map((row) => canonicalize({
      facts: row.facts, kind: row.kind, name: row.name
    })).join("\n")
  }\n`;
  if (/(pr192_b_schema|b0_security_drift|container|volume|run_id|timestamp|oid)/i.test(bytes)) {
    throw new Error("security artifact leaked an ephemeral identity");
  }
  return { artifact: rows, bytes, sha: sha256(bytes) };
}

function signedSecurityDriftCount(harness) {
  const functionNames = [
    ...IDENTITY_COMMAND_FUNCTIONS,
    ...IDENTITY_TRIGGER_FUNCTIONS,
    ...ANOMALY_TRANSITION_FUNCTIONS
  ];
  const authorityTables = [
    "biz_party_identity_submission",
    "biz_party_identity_snapshot",
    "biz_party_identity_decision",
    "biz_party_identity_assignment_audit",
    "rel_party_identity_snapshot_file",
    "rel_party_identity_draft_file",
    "biz_property_migration_anomaly",
    "biz_property_migration_anomaly_audit"
  ];
  return Number(harness.query(`
    WITH function_drift AS (
      SELECT count(*) AS value
      FROM pg_proc function
      JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
      JOIN pg_language language ON language.oid=function.prolang
      WHERE namespace.nspname='public'
        AND function.proname IN (${functionNames.map(sqlLiteral).join(",")})
        AND (
          pg_get_userbyid(function.proowner)<>'pr192_b_schema'
          OR function.prosecdef<>true OR function.provolatile<>'v'
          OR language.lanname<>'plpgsql'
          OR function.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
        )
    ),
    function_count_drift AS (
      SELECT abs(11-count(*)) AS value
      FROM pg_proc function JOIN pg_namespace namespace
        ON namespace.oid=function.pronamespace
      WHERE namespace.nspname='public'
        AND function.proname IN (${functionNames.map(sqlLiteral).join(",")})
    ),
    execute_drift AS (
      SELECT count(*) AS value
      FROM pg_proc function
      JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
      CROSS JOIN LATERAL aclexplode(
        coalesce(function.proacl,acldefault('f',function.proowner))
      ) acl
      WHERE namespace.nspname='public'
        AND function.proname IN (${functionNames.map(sqlLiteral).join(",")})
        AND acl.grantee<>function.proowner
        AND acl.privilege_type='EXECUTE'
    ),
    schema_drift AS (
      SELECT count(*) AS value
      FROM pg_namespace namespace
      CROSS JOIN LATERAL aclexplode(
        coalesce(namespace.nspacl,acldefault('n',namespace.nspowner))
      ) acl
      WHERE namespace.nspname='public' AND acl.grantee<>namespace.nspowner
        AND acl.privilege_type='CREATE'
    ),
    table_drift AS (
      SELECT count(*) AS value
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      CROSS JOIN LATERAL aclexplode(
        coalesce(relation.relacl,acldefault('r',relation.relowner))
      ) acl
      WHERE namespace.nspname='public'
        AND relation.relname IN (${authorityTables.map(sqlLiteral).join(",")})
        AND acl.grantee<>relation.relowner
        AND (
          (
            relation.relname IN (
              'biz_party_identity_submission','biz_party_identity_snapshot',
              'biz_party_identity_decision','biz_party_identity_assignment_audit',
              'rel_party_identity_snapshot_file','rel_party_identity_draft_file'
            )
            AND acl.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
          )
          OR (
            relation.relname IN (
              'biz_property_migration_anomaly',
              'biz_property_migration_anomaly_audit'
            )
            AND acl.privilege_type IN ('UPDATE','DELETE')
          )
        )
    ),
    column_drift AS (
      SELECT count(*) AS value
      FROM pg_attribute attribute
      JOIN pg_class relation ON relation.oid=attribute.attrelid
      JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
      WHERE namespace.nspname='public' AND relation.relname='biz_party'
        AND attribute.attname IN (
          'identity_version','current_identity_submission_id',
          'current_verified_submission_id','identity_document_type',
          'identity_number_encrypted','identity_number_hash','identity_number_masked'
        )
        AND acl.grantee<>relation.relowner
        AND acl.privilege_type IN ('INSERT','UPDATE')
    )
    SELECT
      (SELECT value FROM function_drift)
      +(SELECT value FROM function_count_drift)
      +(SELECT value FROM execute_drift)
      +(SELECT value FROM schema_drift)
      +(SELECT value FROM table_drift)
      +(SELECT value FROM column_drift)
  `));
}

function verifySecurityDriftRejection(harness) {
  if (signedSecurityDriftCount(harness) !== 0) {
    throw new Error("security baseline drift before negative tests");
  }
  harness.psql(`CREATE ROLE b0_security_drift NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;`);
  const cases = [
    {
      label: "owner",
      apply: `ALTER FUNCTION public.fn_validate_party_identity_consistency()
        OWNER TO b0_security_drift;`,
      restore: `ALTER FUNCTION public.fn_validate_party_identity_consistency()
        OWNER TO pr192_b_schema;`
    },
    {
      label: "proconfig",
      apply: `ALTER FUNCTION public.fn_validate_party_identity_consistency()
        SET search_path=public;`,
      restore: `ALTER FUNCTION public.fn_validate_party_identity_consistency()
        SET search_path=pg_catalog;`
    },
    {
      label: "public-create",
      apply: `GRANT CREATE ON SCHEMA public TO PUBLIC;`,
      restore: `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`
    },
    {
      label: "execute",
      apply: `GRANT EXECUTE ON FUNCTION public.fn_validate_party_identity_consistency()
        TO b0_security_drift;`,
      restore: `REVOKE EXECUTE ON FUNCTION public.fn_validate_party_identity_consistency()
        FROM b0_security_drift;`
    },
    {
      label: "anomaly-owner",
      apply: `ALTER FUNCTION public.fn_transition_property_migration_anomaly(
        varchar,varchar,uuid,integer,varchar,uuid,varchar,varchar
      ) OWNER TO b0_security_drift;`,
      restore: `ALTER FUNCTION public.fn_transition_property_migration_anomaly(
        varchar,varchar,uuid,integer,varchar,uuid,varchar,varchar
      ) OWNER TO pr192_b_schema;`
    },
    {
      label: "anomaly-execute",
      apply: `GRANT EXECUTE ON FUNCTION public.fn_transition_property_migration_anomaly(
        varchar,varchar,uuid,integer,varchar,uuid,varchar,varchar
      ) TO b0_security_drift;`,
      restore: `REVOKE EXECUTE ON FUNCTION public.fn_transition_property_migration_anomaly(
        varchar,varchar,uuid,integer,varchar,uuid,varchar,varchar
      ) FROM b0_security_drift;`
    },
    {
      label: "anomaly-proconfig",
      apply: `ALTER FUNCTION public.fn_transition_property_migration_anomaly(
        varchar,varchar,uuid,integer,varchar,uuid,varchar,varchar
      ) SET search_path=public;`,
      restore: `ALTER FUNCTION public.fn_transition_property_migration_anomaly(
        varchar,varchar,uuid,integer,varchar,uuid,varchar,varchar
      ) SET search_path=pg_catalog;`
    },
    {
      label: "application-create",
      apply: `GRANT CREATE ON SCHEMA public TO b0_security_drift;`,
      restore: `REVOKE CREATE ON SCHEMA public FROM b0_security_drift;`
    },
    {
      label: "direct-dml",
      apply: `GRANT UPDATE ON public.biz_party_identity_submission
        TO b0_security_drift;`,
      restore: `REVOKE UPDATE ON public.biz_party_identity_submission
        FROM b0_security_drift;`
    },
    {
      label: "anomaly-update",
      apply: `GRANT UPDATE ON public.biz_property_migration_anomaly
        TO b0_security_drift;`,
      restore: `REVOKE UPDATE ON public.biz_property_migration_anomaly
        FROM b0_security_drift;`
    },
    {
      label: "anomaly-audit-delete",
      apply: `GRANT DELETE ON public.biz_property_migration_anomaly_audit
        TO b0_security_drift;`,
      restore: `REVOKE DELETE ON public.biz_property_migration_anomaly_audit
        FROM b0_security_drift;`
    }
  ];
  const passed = [];
  for (const testCase of cases) {
    harness.psql(testCase.apply);
    const drift = signedSecurityDriftCount(harness);
    harness.psql(testCase.restore);
    if (drift === 0) throw new Error(`security ${testCase.label} drift was accepted`);
    if (signedSecurityDriftCount(harness) !== 0) {
      throw new Error(`security ${testCase.label} drift restore failed`);
    }
    passed.push(testCase.label);
  }
  harness.psql(`DROP ROLE b0_security_drift;`);
  return passed;
}

function identityCommand(harness, sql) {
  harness.psql(`BEGIN;\nSET CONSTRAINTS ALL IMMEDIATE;\n${sql}\nCOMMIT;\n`);
}

function expectIdentitySqlState(harness, sql, sqlState, label) {
  const result = harness.psql(
    `\\set VERBOSITY verbose\nBEGIN;\n${sql}\nSET CONSTRAINTS ALL IMMEDIATE;\nCOMMIT;\n`,
    { allowFailure: true }
  );
  if (
    result.status === 0 ||
    !new RegExp(`\\b${sqlState}\\b`).test(result.stderr || result.stdout)
  ) {
    throw new Error(`${label}: expected SQLSTATE ${sqlState}`);
  }
}

async function verifyIdentityBehavior(harness) {
  const tenantId = harness.query(`
    SELECT lower(id::text) FROM public.sys_tenant
    WHERE tenant_id='10000001' AND status=1 AND is_deleted=false LIMIT 1
  `);
  const parkId = "ba000000-0000-4000-8000-000000000001";
  const makerId = "ba000000-0000-4000-8000-000000000211";
  const verifierId = "ba000000-0000-4000-8000-000000000212";
  const queueId = "ba000000-0000-4000-8000-000000000213";
  const policyHash = "a".repeat(64);
  const identityHash = "b".repeat(64);
  const parties = [
    ["ba000000-0000-4000-8000-000000000201", "verified"],
    ["ba000000-0000-4000-8000-000000000202", "rejected"],
    ["ba000000-0000-4000-8000-000000000203", "withdrawn"]
  ];
  harness.psql(`
    INSERT INTO public.biz_party_identity_verification_queue (
      id,tenant_id,park_id,queue_code,display_name,status,
      eligibility_policy_version,eligibility_policy_snapshot,eligibility_policy_hash
    ) VALUES (
      ${sqlLiteral(queueId)},${sqlLiteral(tenantId)},${sqlLiteral(parkId)},
      'b0-gate-queue','B0 gate queue','active',1,'{}'::jsonb,${sqlLiteral(policyHash)}
    );
    INSERT INTO public.biz_party (
      id,tenant_id,park_id,party_type,display_name,source_domain,
      verification_status,consent_status,version
    )
    SELECT value.id::uuid,${sqlLiteral(tenantId)},${sqlLiteral(parkId)},
      'person','B0 identity behavior '||value.terminal,'homestay',
      'unverified','granted',1
    FROM (VALUES
      ${parties.map(([id, terminal]) =>
        `(${sqlLiteral(id)},${sqlLiteral(terminal)})`
      ).join(",")}
    ) value(id,terminal);
  `);
  for (const [partyId, terminal] of parties) {
    identityCommand(harness, `
      SELECT public.fn_party_identity_create_draft_cas(
        ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(partyId)},
        ${sqlLiteral(makerId)},0,NULL,NULL,NULL);
    `);
    const submissionId = harness.query(`
      SELECT current_identity_submission_id::text FROM public.biz_party
      WHERE id=${sqlLiteral(partyId)}
    `);
    identityCommand(harness, `
      SELECT public.fn_party_identity_update_draft_cas(
        ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(submissionId)},
        ${sqlLiteral(makerId)},1,'id_card','ciphertext',
        ${sqlLiteral(identityHash)},'***0001','hmac-sha256',1,'test-key-v1',1,
        ARRAY[]::uuid[]);
    `);
    identityCommand(harness, `
      SELECT public.fn_party_identity_submit_cas(
        ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(submissionId)},
        ${sqlLiteral(makerId)},2,${sqlLiteral(queueId)},'{}'::jsonb,
        ${sqlLiteral(policyHash)});
    `);
    if (terminal === "withdrawn") {
      identityCommand(harness, `
        SELECT public.fn_party_identity_withdraw_cas(
          ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(submissionId)},
          ${sqlLiteral(makerId)},'gate withdraw','gate-withdraw',3);
      `);
    } else {
      identityCommand(harness, `
        SELECT public.fn_party_identity_assignment_cas(
          ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(submissionId)},
          ${sqlLiteral(verifierId)},'claim',${sqlLiteral(verifierId)},NULL,
          'gate-claim',3,0);
      `);
      identityCommand(harness, `
        SELECT public.fn_party_identity_decision_cas(
          ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(submissionId)},
          ${sqlLiteral(verifierId)},${sqlLiteral(terminal)},
          ${terminal === "rejected" ? "'gate rejected'" : "NULL"},4,1);
      `);
    }
    const terminalVersion = terminal === "withdrawn" ? 4 : 5;
    identityCommand(harness, `
      SELECT public.fn_party_identity_create_draft_cas(
        ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(partyId)},
        ${sqlLiteral(makerId)},1,${sqlLiteral(submissionId)},
        ${sqlLiteral(terminal)},${terminalVersion});
    `);
    const expectedIdentityVersion = terminal === "verified" ? 2 : 1;
    const expectedAttempt = terminal === "verified" ? 1 : 2;
    assertScalar(harness, `
      SELECT count(*) FROM public.biz_party_identity_submission
      WHERE party_id=${sqlLiteral(partyId)} AND status='draft'
        AND identity_version=${expectedIdentityVersion}
        AND submission_attempt=${expectedAttempt}
        AND supersedes_submission_id=${sqlLiteral(submissionId)}
    `, 1, `${terminal} successor branch`);
  }

  const verifiedParty = parties[0][0];
  const verifiedDraft = harness.query(`
    SELECT current_identity_submission_id::text FROM public.biz_party
    WHERE id=${sqlLiteral(verifiedParty)}
  `);
  const before = harness.query(`
    SELECT version||':'||identity_version||':'||current_identity_submission_id
    FROM public.biz_party WHERE id=${sqlLiteral(verifiedParty)}
  `);
  expectIdentitySqlState(harness, `
    UPDATE public.biz_party SET current_verified_submission_id=${sqlLiteral(verifiedDraft)}
    WHERE id=${sqlLiteral(verifiedParty)};
  `, "23514", "four-way verified pointer mismatch");
  const after = harness.query(`
    SELECT version||':'||identity_version||':'||current_identity_submission_id
    FROM public.biz_party WHERE id=${sqlLiteral(verifiedParty)}
  `);
  if (before !== after) throw new Error("four-way mismatch rollback left residual Party state");

  const raceParty = "ba000000-0000-4000-8000-000000000204";
  harness.psql(`
    INSERT INTO public.biz_party (
      id,tenant_id,park_id,party_type,display_name,source_domain,
      verification_status,consent_status,version
    ) VALUES (
      ${sqlLiteral(raceParty)},${sqlLiteral(tenantId)},${sqlLiteral(parkId)},
      'person','B0 identity CAS race','homestay','unverified','granted',1
    );
  `);
  identityCommand(harness, `
    SELECT public.fn_party_identity_create_draft_cas(
      ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(raceParty)},
      ${sqlLiteral(makerId)},0,NULL,NULL,NULL);
  `);
  const raceSubmission = harness.query(`
    SELECT current_identity_submission_id::text FROM public.biz_party
    WHERE id=${sqlLiteral(raceParty)}
  `);
  const raceSql = (hash) => `\\set VERBOSITY verbose
BEGIN;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT public.fn_party_identity_update_draft_cas(
  ${sqlLiteral(tenantId)},${sqlLiteral(parkId)},${sqlLiteral(raceSubmission)},
  ${sqlLiteral(makerId)},1,'id_card','ciphertext',${sqlLiteral(hash)},
  '***0001','hmac-sha256',1,'test-key-v1',1,ARRAY[]::uuid[]);
COMMIT;
`;
  const raceResults = await Promise.all([
    harness.psqlAsync(raceSql("c".repeat(64))),
    harness.psqlAsync(raceSql("d".repeat(64)))
  ]);
  const raceWinners = raceResults.filter(({ status }) => status === 0);
  const raceLosers = raceResults.filter(({ status, stderr, stdout }) =>
    status !== 0 && /\b40001\b/.test(stderr || stdout)
  );
  if (raceWinners.length !== 1 || raceLosers.length !== 1) {
    throw new Error(`identity CAS race mismatch: ${JSON.stringify(raceResults)}`);
  }
  assertScalar(harness, `
    SELECT version FROM public.biz_party_identity_submission
    WHERE id=${sqlLiteral(raceSubmission)}
  `, 2, "identity CAS race winner exact version");

  return {
    supersedes_verified_version_increment: true,
    supersedes_rejected_same_version_attempt_increment: true,
    supersedes_withdrawn_same_version_attempt_increment: true,
    four_way_pointer_mismatch_sqlstate: "23514",
    rollback_residual_zero: true,
    cas_race_winners: 1,
    cas_race_losers_sqlstate_40001: 1
  };
}

async function verifyDatabase(harness, entries) {
  const signedDefinitions = parseSignedDefinitionContract(entries);
  verifyDefinitionPhysicalContract(harness, signedDefinitions);
  assertScalar(harness, `
    SELECT count(*) FROM (
      SELECT filename,checksum,status FROM public.sys_schema_migration_history
      WHERE filename >= '000185'
      EXCEPT
      SELECT filename,checksum,status FROM public.schema_migrations
      WHERE filename >= '000185'
    ) drift
  `, 0, "dual history forward drift");
  assertScalar(harness, `
    SELECT count(*) FROM (
      SELECT filename,checksum,status FROM public.schema_migrations
      WHERE filename >= '000185'
      EXCEPT
      SELECT filename,checksum,status FROM public.sys_schema_migration_history
      WHERE filename >= '000185'
    ) drift
  `, 0, "dual history reverse drift");
  assertScalar(harness, `
    SELECT count(*) FROM public.sys_schema_migration_history
    WHERE filename >= '000185' AND status <> 'succeeded'
  `, 0, "successful B history");
  assertScalar(harness, `
    SELECT count(*) FROM sys_module_dependency d
    JOIN sys_module m ON m.id=d.module_id
    JOIN sys_module r ON r.id=d.required_module_id
    WHERE d.is_deleted=false
      AND (m.module_code,r.module_code,d.dependency_kind,d.is_enabled)
          IN (('homestay','asset','hard',true),('housing_rental','asset','hard',true))
  `, 2, "module dependency exact rows");
  assertScalar(harness, `SELECT count(*) FROM sys_property_permission_bundle WHERE is_deleted=false`, 16, "bundle count");
  assertScalar(harness, `SELECT count(*) FROM rel_property_permission_bundle_member WHERE is_deleted=false`, 125, "bundle member count");
  assertScalar(harness, `
    SELECT count(*) FROM rel_role_perm rp
    WHERE rp.create_time >= (
      SELECT min(started_at) FROM sys_schema_migration_history WHERE filename >= '000185'
    )
  `, 0, "zero role grants");
  assertScalar(harness, `
    SELECT count(*) FROM sys_property_runtime_control
    WHERE enabled OR control_mode <> 'disabled' OR enabled_by IS NOT NULL
       OR enabled_at IS NOT NULL OR approval_reference IS NOT NULL
       OR disabled_reason <> 'expand-only' OR contract_hash <> ${sqlLiteral(B_CONTRACT_SHA)}
  `, 0, "controls default disabled");
  assertScalar(harness, `
    SELECT
      (SELECT count(*) FROM biz_property_runtime_checkpoint)
      +(SELECT count(*) FROM biz_property_migration_anomaly)
      +(SELECT count(*) FROM biz_property_migration_anomaly_audit)
      +(SELECT count(*) FROM biz_property_migration_evidence)
  `, 0, "runtime data remains empty");

  assertScalar(harness, `
    SELECT count(*) FROM (
      SELECT c.relname,coalesce(array_to_string(c.relacl,','),'') acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND (
        c.relname LIKE 'biz_property_%' OR c.relname LIKE 'biz_party_identity_%'
        OR c.relname LIKE 'rel_party_identity_%' OR c.relname LIKE 'sys_property_%'
        OR c.relname='sys_module_dependency')
    ) objects WHERE acl ~ '(api|web|runtime)='
  `, 0, "no runtime role ACL");

  const functionNames = [
    ...IDENTITY_COMMAND_FUNCTIONS,
    ...IDENTITY_TRIGGER_FUNCTIONS,
    ...ANOMALY_TRANSITION_FUNCTIONS
  ];
  const functionRows = parseJsonLines(harness.query(`
    SELECT json_build_object(
      'name',n.nspname||'.'||p.proname||'('||
        pg_get_function_identity_arguments(p.oid)||')',
      'owner',pg_get_userbyid(p.proowner),
      'securityDefiner',p.prosecdef,
      'volatility',p.provolatile,
      'language',l.lanname,
      'config',coalesce(to_json(p.proconfig),'[]'::json),
      'publicExecute',EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
      ),
      'unexpectedExecuteGrantCount',(
        SELECT count(*)
        FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        WHERE acl.grantee NOT IN (0,p.proowner)
          AND acl.privilege_type='EXECUTE'
      )
    )::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public'
      AND p.proname IN (${functionNames.map(sqlLiteral).join(",")})
    ORDER BY (
      n.nspname||'.'||p.proname||'('||
      pg_get_function_identity_arguments(p.oid)||')'
    ) COLLATE "C";
  `), "identity function security");
  if (functionRows.length !== 11) {
    throw new Error(`security function exact count: expected 11, got ${functionRows.length}`);
  }
  for (const row of functionRows) {
    if (
      row.owner !== "pr192_b_schema" || row.securityDefiner !== true ||
      row.volatility !== "v" || row.language !== "plpgsql" ||
      JSON.stringify(row.config) !== JSON.stringify(["search_path=pg_catalog"])
    ) {
      throw new Error(`identity function security mismatch: ${JSON.stringify(row)}`);
    }
  }
  assertScalar(harness, `
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE n.nspname='public'
      AND p.proname IN (${functionNames.map(sqlLiteral).join(",")})
      AND (acl.grantee <> p.proowner OR acl.privilege_type <> 'EXECUTE')
  `, 0, "identity functions owner-only EXECUTE");
  assertScalar(harness, `
    SELECT count(*)
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
    WHERE n.nspname='public' AND acl.grantee=0 AND acl.privilege_type='CREATE'
  `, 0, "PUBLIC cannot CREATE in public schema");

  const triggerNames = [...IDENTITY_IMMEDIATE_TRIGGERS, ...IDENTITY_CONSTRAINT_TRIGGERS];
  const triggerRows = parseJsonLines(harness.query(`
    SELECT json_build_object(
      'name',g.tgname,
      'constraint',g.tgconstraint<>0,
      'deferrable',coalesce(x.condeferrable,false),
      'initiallyDeferred',coalesce(x.condeferred,false),
      'enabled',g.tgenabled
    )::text
    FROM pg_trigger g
    JOIN pg_class c ON c.oid=g.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_constraint x ON x.oid=g.tgconstraint
    WHERE n.nspname='public'
      AND NOT g.tgisinternal
      AND g.tgname IN (${triggerNames.map(sqlLiteral).join(",")})
    ORDER BY g.tgname COLLATE "C";
  `), "identity trigger security");
  if (triggerRows.length !== 7) {
    throw new Error(`identity trigger exact count: expected 7, got ${triggerRows.length}`);
  }
  for (const row of triggerRows) {
    const isConstraint = IDENTITY_CONSTRAINT_TRIGGERS.includes(row.name);
    if (
      row.constraint !== isConstraint || row.enabled !== "O" ||
      row.deferrable !== isConstraint || row.initiallyDeferred !== isConstraint
    ) throw new Error(`identity trigger signature mismatch: ${JSON.stringify(row)}`);
  }

  const runtimeAcl = verifyIdentityRuntimeAcl(harness, entries);
  const security = buildSecurityArtifact(harness, functionRows, runtimeAcl);
  const securityDriftRejections = verifySecurityDriftRejection(harness);
  const identityBehavior = await verifyIdentityBehavior(harness);
  const catalog = extractCatalog(harness, entries);
  return {
    catalog_sha256: catalog.sha,
    security_sha256: security.sha,
    migration_set_hash: sha256(schemaManifestBytes(entries, catalog.sha, security.sha)),
    marker_count: catalog.markerCount,
    definition_row_count: catalog.definitionRowCount,
    identity_security: {
      functions: functionRows,
      triggers: triggerRows,
      public_schema_create_grants: 0,
      runtime_handoff: runtimeAcl,
      behavior: identityBehavior
    },
    security_artifact: security.artifact,
    security_drift_rejections: securityDriftRejections
  };
}

function verifyFailureStopAndRetry(harness, entries) {
  const first = entries[0];
  writeHistory(harness, first, "running");
  const injected = first.sql.replace(
    /\nCOMMIT;\s*$/,
    "\nSELECT 1 / 0;\nCOMMIT;\n"
  );
  if (injected === first.sql) throw new Error("failure injection did not bind to 000185");
  const failed = harness.psql(injected, { allowFailure: true });
  if (failed.status === 0) throw new Error("injected 000185 failure unexpectedly succeeded");
  writeHistory(harness, first, "failed", (failed.stderr || failed.stdout).trim());
  assertScalar(harness, `SELECT to_regclass('public.biz_party_identity_submission') IS NULL`, "t", "failed file rollback");
  assertScalar(harness, `
    SELECT count(*) FROM sys_schema_migration_history WHERE filename >= '000186'
  `, 0, "failure stop did not continue");
}

function verifyRerunAndFailureStop(harness, entries) {
  const before = harness.query(`
    SELECT string_agg(filename||':'||checksum||':'||status,E'\\n' ORDER BY filename)
    FROM sys_schema_migration_history WHERE filename >= '000185'
  `);
  applyTrackB(harness, entries);
  const after = harness.query(`
    SELECT string_agg(filename||':'||checksum||':'||status,E'\\n' ORDER BY filename)
    FROM sys_schema_migration_history WHERE filename >= '000185'
  `);
  if (before !== after) throw new Error("same-schema rerun changed migration history contract");

  const definitions = entries.find(({ filename }) => filename.startsWith("000189_"));
  harness.psql(`
    UPDATE sys_permission
    SET api_path='/api/v1/property/occupancies/:id/release',
        update_time=clock_timestamp(),
        version=version+1
    WHERE code='property_occupancy:force_release' AND is_deleted=false;
  `);
  const routeDrift = harness.psql(definitions.sql, { allowFailure: true });
  if (routeDrift.status === 0) {
    throw new Error("000189 accepted occupancy route-token drift on rerun");
  }
  assertScalar(harness, `
    SELECT count(*) FROM sys_permission
    WHERE code='property_occupancy:force_release'
      AND api_path='/api/v1/property/occupancies/:id/release'
      AND is_deleted=false
  `, 1, "failure preserves occupancy route-token drift");

  const tail = entries.at(-1);
  harness.psql(`
    UPDATE sys_property_runtime_control
    SET enabled=true,control_mode='observe',enabled_by=uuid_generate_v4(),
        enabled_at=clock_timestamp(),approval_reference='gate-drift',version=version+1
    WHERE id=(SELECT id FROM sys_property_runtime_control ORDER BY id LIMIT 1);
  `);
  const result = harness.psql(tail.sql, { allowFailure: true });
  if (result.status === 0) throw new Error("000190 accepted enabled-control drift on rerun");
  assertScalar(harness, `
    SELECT count(*) FROM sys_property_runtime_control
    WHERE approval_reference='gate-drift' AND enabled=true AND control_mode='observe'
  `, 1, "failure preserves enabled drift");
  assertScalar(harness, `
    SELECT count(*) FROM biz_property_migration_evidence
  `, 0, "failure stop prevents later evidence");
}

export async function runGate(environment = process.env) {
  assertNoTrackBDatabaseOverrides(environment);
  const runId = environment.PROPERTY_B_SCHEMA_RUN_ID ??
    `bschema${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${randomBytes(4).toString("hex")}`;
  validateRunId(runId);
  let entries = [];
  let harness = null;
  let cleanup = { container_absent: true, anonymous_volume_absent: true, errors: [] };
  let failure = null;
  let schema = null;
  let failureDiagnostics = null;
  let finalLiveness = { checked: false, passed: false };
  try {
    entries = validateStaticContract();
    harness = createHarness(runId);
    harness.start();
    await harness.waitReady();
    bootstrapBaseline(harness);
    verifyFailureStopAndRetry(harness, entries);
    applyTrackB(harness, entries);
    schema = await verifyDatabase(harness, entries);
    verifyRerunAndFailureStop(harness, entries);
    assertScalar(harness, "SELECT 1", 1, "final database liveness");
    finalLiveness = { checked: true, passed: true };
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    if (harness) {
      try {
        failureDiagnostics = harness.captureFailureDiagnostics();
      } catch (diagnosticError) {
        failureDiagnostics = {
          container_state: null,
          logs_tail: "",
          capture_errors: [
            `failure diagnostic capture threw: ${
              diagnosticError instanceof Error
                ? diagnosticError.message
                : String(diagnosticError)
            }`
          ]
        };
      }
    }
  } finally {
    if (harness) cleanup = harness.cleanup();
    if (!cleanup.container_absent || !cleanup.anonymous_volume_absent || cleanup.errors.length) {
      failure ??= new Error(`cleanup failed: ${JSON.stringify(cleanup)}`);
    }
  }
  return {
    schema_version: "property-remediation-track-b-schema-expand-evidence-v2",
    run_id: runId,
    status: failure ? "failed" : "passed",
    contract_sha256: B_CONTRACT_SHA,
    requested_fresh_run_count: 1,
    completed_fresh_run_count: 1,
    catalog_contract: B_SCHEMA_CATALOG_V2_POLICY,
    migrations: entries.map(({ filename, sha }) => ({ filename, sha256: sha })),
    schema,
    final_liveness: finalLiveness,
    failure_diagnostics: failureDiagnostics,
    cleanup,
    open_P0_P1: failure ? [`P1: ${failure.message}`] : [],
    error: failure?.message ?? null
  };
}

export async function runDeterminismGate(
  environment = process.env,
  freshRuns = 3,
  runOne = runGate
) {
  if (!Number.isInteger(freshRuns) || freshRuns < 3 || freshRuns > 5) {
    throw new Error("Track B deterministic Gate requires 3 to 5 fresh PostgreSQL runs");
  }
  assertNoTrackBDatabaseOverrides(environment);
  const baseRunId = environment.PROPERTY_B_SCHEMA_RUN_ID ??
    `bschemav2${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${randomBytes(3).toString("hex")}`;
  validateRunId(baseRunId);
  const runs = [];
  for (let index = 1; index <= freshRuns; index += 1) {
    const runId = `${baseRunId}r${index}`;
    validateRunId(runId);
    const run = await runOne({ ...environment, PROPERTY_B_SCHEMA_RUN_ID: runId });
    runs.push(run);
    if (environment.PROPERTY_B_SCHEMA_REPORT_PROGRESS === "1") {
      process.stderr.write(
        `[track-b-schema] run ${index}/${freshRuns} ${run.status} ` +
        `catalog=${run.schema?.catalog_sha256 ?? "none"} ` +
        `security=${run.schema?.security_sha256 ?? "none"} ` +
        `schema=${run.schema?.migration_set_hash ?? "none"} ` +
        `cleanup=${run.cleanup.container_absent &&
          run.cleanup.anonymous_volume_absent &&
          run.cleanup.errors.length === 0 ? "passed" : "failed"} ` +
        `error=${run.error ?? "none"}\n`
      );
    }
    if (run.status !== "passed") break;
  }
  const successful = runs.filter(({ status }) => status === "passed");
  const catalogHashes = new Set(successful.map(({ schema }) => schema?.catalog_sha256));
  const securityHashes = new Set(successful.map(({ schema }) => schema?.security_sha256));
  const schemaHashes = new Set(successful.map(({ schema }) => schema?.migration_set_hash));
  const migrationSets = new Set(successful.map(({ migrations }) => JSON.stringify(migrations)));
  const cleanupPassed = runs.every(({ cleanup }) =>
    cleanup.container_absent && cleanup.anonymous_volume_absent && cleanup.errors.length === 0
  );
  const deterministic =
    successful.length === freshRuns &&
    catalogHashes.size === 1 &&
    securityHashes.size === 1 &&
    schemaHashes.size === 1 &&
    migrationSets.size === 1 &&
    cleanupPassed;
  const mismatch = deterministic ? null :
    `fresh-run mismatch: passed=${successful.length}/${freshRuns}, ` +
    `completed=${runs.length}/${freshRuns}, ` +
    `catalog=${catalogHashes.size}, schema=${schemaHashes.size}, ` +
    `security=${securityHashes.size}, migration=${migrationSets.size}, cleanup=${cleanupPassed}`;
  return {
    schema_version: "property-remediation-track-b-schema-determinism-evidence-v2",
    run_id: baseRunId,
    status: deterministic ? "passed" : "failed",
    contract_sha256: B_CONTRACT_SHA,
    catalog_grammar: B_SCHEMA_CATALOG_GRAMMAR,
    security_grammar: B_SCHEMA_SECURITY_GRAMMAR,
    schema_grammar: B_SCHEMA_MANIFEST_GRAMMAR,
    fresh_run_count: freshRuns,
    requested_fresh_run_count: freshRuns,
    completed_fresh_run_count: runs.length,
    deterministic,
    catalog_sha256: deterministic ? [...catalogHashes][0] : null,
    security_sha256: deterministic ? [...securityHashes][0] : null,
    migration_set_hash: deterministic ? [...schemaHashes][0] : null,
    migrations: deterministic ? successful[0].migrations : [],
    runs,
    cleanup: {
      all_containers_absent: runs.every(({ cleanup }) => cleanup.container_absent),
      all_anonymous_volumes_absent: runs.every(
        ({ cleanup }) => cleanup.anonymous_volume_absent
      ),
      errors: runs.flatMap(({ cleanup }) => cleanup.errors)
    },
    open_P0_P1: deterministic ? [] : [`P1: ${mismatch}`],
    error: mismatch
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requestedFreshRuns = Number(process.env.PROPERTY_B_SCHEMA_FRESH_RUNS ?? "1");
  if (
    !Number.isInteger(requestedFreshRuns) ||
    (requestedFreshRuns !== 1 && (requestedFreshRuns < 3 || requestedFreshRuns > 5))
  ) {
    throw new Error("PROPERTY_B_SCHEMA_FRESH_RUNS must be 1 or an integer from 3 to 5");
  }
  const evidence = requestedFreshRuns === 1
    ? await runGate()
    : await runDeterminismGate(process.env, requestedFreshRuns);
  const evidencePath = process.env.PROPERTY_B_SCHEMA_EVIDENCE_PATH;
  if (evidencePath) {
    const resolvedEvidencePath = resolve(evidencePath);
    if (!resolvedEvidencePath.startsWith("/tmp/")) {
      throw new Error("Track B schema evidence path must be under /tmp");
    }
    writeFileSync(resolvedEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if (evidence.status !== "passed") process.exitCode = 1;
}
