import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = process.env.COMPOSE_FILE ?? resolve(rootDir, "infra/docker/docker-compose.yml");
const allowedEnvironments = new Set(["local", "test", "ci"]);
const environment = process.env.SAFETY_FIXTURE_ENVIRONMENT;
const allowWrite = process.env.SAFETY_FIXTURE_ALLOW_WRITE === "yes";
const tenantId = process.env.SAFETY_FIXTURE_TENANT_ID ?? process.env.E2E_TENANT_ID ?? "10000001";
const parkId = process.env.SAFETY_FIXTURE_PARK_ID ?? process.env.E2E_PARK_ID ?? "20000001";
const apiBase = process.env.SAFETY_FIXTURE_API_BASE_URL ?? process.env.SAFETY_SMOKE_API_BASE_URL ?? process.env.E2E_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const dbMode = process.env.SAFETY_FIXTURE_DB_MODE ?? (process.env.DATABASE_URL || process.env.POSTGRES_HOST ? "direct" : "docker");
const postgresUser = process.env.POSTGRES_USER ?? "jinhu";
const postgresDb = process.env.POSTGRES_DB ?? "jinhu_smart_park";
const postgresHost = process.env.POSTGRES_HOST ?? "localhost";
const postgresPort = process.env.POSTGRES_PORT ?? "5432";
const smokeRemark = "SAFETY_SMOKE fixture for local/test access smoke";

const requiredMigrations = [
  "000144_safety_full_open_permission_menu_patch.sql",
  "000145_safety_phase1_review_followup.sql"
];

const accountKinds = ["ADMIN", "NORMAL", "UNAUTHORIZED", "ENTERPRISE", "OVERDUE_HAZARD", "DUAL_STATISTICS", "SINGLE_STATISTICS"];

const highRiskPermissions = [
  "safety_inspect_point:delete",
  "safety_inspect_template:delete",
  "safety_inspect_item:delete",
  "safety_inspect_plan:delete",
  "safety_inspect_task:manage_all",
  "safety_hazard:delete",
  "safety_hazard:reject_rectify",
  "safety_hazard:close",
  "safety_hazard:force_close",
  "safety_hazard:manage_all",
  "safety_emergency_contact:delete",
  "safety_emergency_plan:delete",
  "safety_emergency:delete",
  "safety_emergency:review",
  "safety_emergency:close",
  "safety_work_permit:delete",
  "safety_work_permit:override_conflict",
  "safety_work_permit:approve_property",
  "safety_work_permit:approve_safety",
  "safety_work_permit:approve_operation",
  "safety_work_permit:reject",
  "safety_work_permit:void",
  "safety_work_permit:stop",
  "safety_work_permit:close",
  "safety_work_permit:create_hazard",
  "video_alert:process",
  "video_alert:close",
  "video_alert:create_inspection",
  "video_alert:create_hazard",
  "video_camera:delete",
  "video_camera:capture_snapshot",
  "video_camera:create_inspection_issue",
  "video_platform_config:create",
  "video_platform_config:update",
  "video_platform_config:delete",
  "video_evidence:create",
  "video_evidence:delete"
];

const roleSpecs = {
  ADMIN: {
    code: "SAFETY_SMOKE_ADMIN_ROLE",
    name: "Safety smoke admin role",
    dataScope: "all",
    isSuper: true,
    permissions: []
  },
  NORMAL: {
    code: "SAFETY_SMOKE_NORMAL_ROLE",
    name: "Safety smoke normal role",
    dataScope: "self",
    isSuper: false,
    permissions: ["safety:operations-terminal", "safety:my-inspect-tasks", "safety_inspect_task:my"]
  },
  UNAUTHORIZED: {
    code: "SAFETY_SMOKE_UNAUTHORIZED_ROLE",
    name: "Safety smoke unauthorized role",
    dataScope: "self",
    isSuper: false,
    permissions: []
  },
  ENTERPRISE: {
    code: "SAFETY_SMOKE_ENTERPRISE_ROLE",
    name: "Safety smoke enterprise role",
    dataScope: "60",
    isSuper: false,
    permissions: ["safety:hazards", "safety_hazard:read"]
  },
  OVERDUE_HAZARD: {
    code: "SAFETY_SMOKE_OVERDUE_HAZARD_ROLE",
    name: "Safety smoke overdue hazard role",
    dataScope: "park",
    isSuper: false,
    permissions: ["safety:hazards-overdue", "safety_hazard:overdue"]
  },
  DUAL_STATISTICS: {
    code: "SAFETY_SMOKE_DUAL_STATISTICS_ROLE",
    name: "Safety smoke dual statistics role",
    dataScope: "park",
    isSuper: false,
    permissions: ["safety:emergency-dashboard", "safety_emergency_statistics:read", "safety_work_permit_statistics:read"]
  },
  SINGLE_STATISTICS: {
    code: "SAFETY_SMOKE_SINGLE_STATISTICS_ROLE",
    name: "Safety smoke single statistics role",
    dataScope: "park",
    isSuper: false,
    permissions: ["safety_emergency_statistics:read"]
  }
};

const userSpecs = Object.fromEntries(
  accountKinds.map((kind) => [
    kind,
    {
      kind,
      username: `SAFETY_SMOKE_${kind}`,
      displayName: `Safety smoke ${kind.toLowerCase().replaceAll("_", " ")}`
    }
  ])
);

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlBool(value) {
  return value ? "true" : "false";
}

function sqlJson(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function requireSafeScopeValue(name, value) {
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) {
    fail(`${name} contains unsupported characters`);
  }
}

function assertEnvironmentGuard() {
  if (!environment || !allowedEnvironments.has(environment)) {
    fail(`SAFETY_FIXTURE_ENVIRONMENT must be one of ${[...allowedEnvironments].join(", ")}`);
  }
  if (!allowWrite) {
    fail("SAFETY_FIXTURE_ALLOW_WRITE=yes is required before fixture data can be written");
  }
  for (const [name, value] of Object.entries({
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
    SAFETY_FIXTURE_ENVIRONMENT: environment
  })) {
    if (value && isProductionLike(value)) fail(`${name} is production-like and fixture writes are forbidden`);
  }
  requireSafeScopeValue("SAFETY_FIXTURE_TENANT_ID", tenantId);
  requireSafeScopeValue("SAFETY_FIXTURE_PARK_ID", parkId);
  assertSafeApiBase();
  assertSafeDatabaseTarget();
}

function isProductionLike(value) {
  return /(^|[._:/-])(prod|production)([._:/-]|$)/i.test(String(value));
}

function assertSafeApiBase() {
  let parsed;
  try {
    parsed = new URL(apiBase);
  } catch {
    fail(`SAFETY_FIXTURE_API_BASE_URL is not a valid URL: ${apiBase}`);
  }
  assertSafeHost(parsed.hostname, "SAFETY_FIXTURE_API_BASE_URL");
  if (isProductionLike(parsed.href)) fail(`SAFETY_FIXTURE_API_BASE_URL is production-like: ${parsed.origin}`);
}

function assertSafeDatabaseTarget() {
  if (!["docker", "direct"].includes(dbMode)) {
    fail("SAFETY_FIXTURE_DB_MODE must be docker or direct");
  }
  if (isProductionLike(postgresDb)) fail(`POSTGRES_DB is production-like: ${postgresDb}`);
  if (process.env.DATABASE_URL) {
    const parsed = new URL(process.env.DATABASE_URL);
    assertSafeHost(parsed.hostname, "DATABASE_URL");
    if (isProductionLike(process.env.DATABASE_URL)) fail("DATABASE_URL is production-like");
  }
  if (dbMode === "direct") {
    assertSafeHost(postgresHost, "POSTGRES_HOST");
    if (isProductionLike(postgresHost)) fail(`POSTGRES_HOST is production-like: ${postgresHost}`);
  }
  if (dbMode === "docker") {
    if (!existsSync(composeFile)) fail(`Docker compose file not found: ${composeFile}`);
    if (isProductionLike(composeFile) || composeFile.endsWith("docker-compose.prod.yml")) {
      fail(`Docker compose file is production-like: ${composeFile}`);
    }
  }
}

function assertSafeHost(host, label) {
  const normalized = host.toLowerCase();
  if (["localhost", "127.0.0.1", "::1"].includes(normalized)) return;
  if (normalized.endsWith(".local")) return;
  if (/^10\./.test(normalized)) return;
  if (/^192\.168\./.test(normalized)) return;
  const private172 = normalized.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return;
  if (/(^|[.-])(dev|test|testing|stage|staging|ci|qa|uat)([.-]|$)/.test(normalized)) return;
  fail(`${label} host is not clearly local/test/ci: ${host}`);
}

function psqlBaseArgs() {
  if (dbMode === "docker") {
    return ["compose", "-f", composeFile, "exec", "-T", "postgres", "psql", "-U", postgresUser, "-d", postgresDb];
  }
  if (process.env.DATABASE_URL) return ["psql", process.env.DATABASE_URL];
  return ["psql", "-h", postgresHost, "-p", postgresPort, "-U", postgresUser, "-d", postgresDb];
}

async function dbScalar(sql) {
  const baseArgs = psqlBaseArgs();
  const command = dbMode === "docker" ? "docker" : baseArgs[0];
  const args = dbMode === "docker"
    ? [...baseArgs, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql]
    : [...baseArgs.slice(1), "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql];
  const env = { ...process.env };
  if (process.env.POSTGRES_PASSWORD && !env.PGPASSWORD) env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
  const { stdout } = await execFileAsync(command, args, { env, maxBuffer: 1024 * 1024 * 10 });
  return stdout.trim();
}

async function dbExec(sql) {
  await dbScalar(sql);
}

async function generatePasswordHash(password) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "-e",
      `
const bcrypt = require("bcrypt");
const password = process.env.SAFETY_FIXTURE_PASSWORD;
const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || "12");
bcrypt.hash(password, rounds).then((hash) => process.stdout.write(hash)).catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
`
    ],
    {
      cwd: resolve(rootDir, "apps/api"),
      env: { ...process.env, SAFETY_FIXTURE_PASSWORD: password },
      maxBuffer: 1024 * 1024
    }
  );
  return stdout.trim();
}

function generatePassword() {
  return `SafetySmoke_${randomBytes(12).toString("base64url")}!9`;
}

async function assertRequiredMigrations() {
  const rows = await dbScalar(`
SELECT filename || ':' || status
FROM sys_schema_migration_history
WHERE filename IN (${requiredMigrations.map(sqlLiteral).join(", ")})
ORDER BY filename;`);
  const states = new Map(rows.split("\n").filter(Boolean).map((row) => row.split(":")));
  for (const migration of requiredMigrations) {
    if (states.get(migration) !== "succeeded") {
      fail(`${migration} must be succeeded in sys_schema_migration_history`);
    }
  }
  pass("required safety permission migrations are succeeded");
}

async function assertTablesAndPermissions() {
  const requiredTables = [
    "sys_user",
    "sys_role",
    "sys_permission",
    "rel_user_role",
    "rel_role_perm",
    "rel_user_park",
    "sys_tenant",
    "biz_park",
    "biz_park_tenant",
    "biz_safety_hazard",
    "sys_data_scope_rule",
    "rel_role_data_scope",
    "sys_schema_migration_history"
  ];
  const missingTables = await dbScalar(`
SELECT table_name
FROM unnest(ARRAY[${requiredTables.map(sqlLiteral).join(", ")}]) AS required(table_name)
WHERE to_regclass('public.' || required.table_name) IS NULL
ORDER BY table_name;`);
  if (missingTables) fail(`required table(s) missing: ${missingTables.replaceAll("\n", ", ")}`);

  const requiredPermissions = [...new Set(Object.values(roleSpecs).flatMap((spec) => spec.permissions))];
  const missingPermissions = await dbScalar(`
SELECT code
FROM unnest(ARRAY[${requiredPermissions.map(sqlLiteral).join(", ")}]) AS required(code)
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_permission permission
  WHERE permission.tenant_id = ${sqlLiteral(tenantId)}
    AND permission.code = required.code
    AND permission.is_deleted = false
    AND permission.is_enabled = true
)
ORDER BY code;`);
  if (missingPermissions) fail(`required permission(s) missing: ${missingPermissions.replaceAll("\n", ", ")}`);
  pass("required tables and permissions are present");
}

async function ensureTenantAndPark() {
  const tenantCount = Number(await dbScalar(`
SELECT count(*)
FROM sys_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND is_deleted = false;`));
  if (tenantCount < 1) fail(`tenant ${tenantId} is missing; run production-safe baseline seed first`);
  const parkCount = Number(await dbScalar(`
SELECT count(*)
FROM biz_park
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND is_deleted = false;`));
  if (parkCount < 1) fail(`park ${parkId} is missing; run production-safe baseline seed first`);
  pass(`tenant ${tenantId} and park ${parkId} are present`);
}

async function cleanupDuplicateFixtureRows() {
  await dbExec(`
WITH ranked_users AS (
  SELECT id, row_number() OVER (PARTITION BY username ORDER BY create_time ASC, id ASC) AS rn
  FROM sys_user
  WHERE tenant_id = ${sqlLiteral(tenantId)}
    AND park_id = ${sqlLiteral(parkId)}
    AND username LIKE 'SAFETY_SMOKE_%'
    AND is_deleted = false
)
UPDATE sys_user
SET is_deleted = true, update_time = now(), remark = ${sqlLiteral(`${smokeRemark}; duplicate disabled`)}
WHERE id IN (SELECT id FROM ranked_users WHERE rn > 1);

WITH ranked_roles AS (
  SELECT id, row_number() OVER (PARTITION BY code ORDER BY create_time ASC, id ASC) AS rn
  FROM sys_role
  WHERE tenant_id = ${sqlLiteral(tenantId)}
    AND code LIKE 'SAFETY_SMOKE_%'
    AND is_deleted = false
)
UPDATE sys_role
SET is_deleted = true, update_time = now(), remark = ${sqlLiteral(`${smokeRemark}; duplicate disabled`)}
WHERE id IN (SELECT id FROM ranked_roles WHERE rn > 1);`);
}

async function ensureRole(kind) {
  const spec = roleSpecs[kind];
  const roleId = randomUUID();
  const existingId = await dbScalar(`
SELECT id::text
FROM sys_role
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND code = ${sqlLiteral(spec.code)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  if (existingId) {
    await dbExec(`
UPDATE sys_role
SET name = ${sqlLiteral(spec.name)},
    park_id = ${sqlLiteral(parkId)},
    role_type = 'custom',
    role_scope = 'park',
    data_scope = ${sqlLiteral(spec.dataScope)},
    data_scope_config = '{}'::jsonb,
    is_system = false,
    is_builtin = false,
    is_super = ${sqlBool(spec.isSuper)},
    status = 'enabled',
    is_enabled = true,
    editable = true,
    is_editable = true,
    is_deletable = true,
    update_time = now(),
    remark = ${sqlLiteral(smokeRemark)}
WHERE id = ${sqlLiteral(existingId)};`);
    return existingId;
  }
  await dbExec(`
INSERT INTO sys_role (
  id, tenant_id, park_id, code, name, role_type, role_scope, data_scope, data_scope_config,
  is_system, is_builtin, is_super, status, is_enabled, editable, is_editable, is_deletable, remark
) VALUES (
  ${sqlLiteral(roleId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(spec.code)}, ${sqlLiteral(spec.name)},
  'custom', 'park', ${sqlLiteral(spec.dataScope)}, '{}'::jsonb, false, false, ${sqlBool(spec.isSuper)},
  'enabled', true, true, true, true, ${sqlLiteral(smokeRemark)}
);`);
  return roleId;
}

async function replaceRolePermissions(roleId, permissions) {
  await dbExec(`
UPDATE rel_role_perm
SET is_deleted = true,
    update_time = now(),
    remark = ${sqlLiteral(`${smokeRemark}; replaced`)}
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND role_id = ${sqlLiteral(roleId)}
  AND is_deleted = false;`);
  if (permissions.length === 0) return;
  await dbExec(`
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, remark)
SELECT ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(roleId)}, permission.id, ${sqlLiteral(smokeRemark)}
FROM sys_permission permission
WHERE permission.tenant_id = ${sqlLiteral(tenantId)}
  AND permission.code IN (${permissions.map(sqlLiteral).join(", ")})
  AND permission.is_deleted = false
  AND permission.is_enabled = true;`);
  const granted = Number(await dbScalar(`
SELECT count(*)
FROM rel_role_perm link
JOIN sys_permission permission ON permission.id = link.permission_id
WHERE link.tenant_id = ${sqlLiteral(tenantId)}
  AND link.role_id = ${sqlLiteral(roleId)}
  AND link.is_deleted = false
  AND permission.code IN (${permissions.map(sqlLiteral).join(", ")});`));
  if (granted !== permissions.length) {
    fail(`role ${roleId} expected ${permissions.length} permission(s), got ${granted}`);
  }
}

async function ensureUser(kind, passwordHash) {
  const spec = userSpecs[kind];
  const userId = randomUUID();
  const existingId = await dbScalar(`
SELECT id::text
FROM sys_user
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND username = ${sqlLiteral(spec.username)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  if (existingId) {
    await dbExec(`
UPDATE sys_user
SET display_name = ${sqlLiteral(spec.displayName)},
    password_hash = ${sqlLiteral(passwordHash)},
    is_enabled = true,
    status = 'enabled',
    update_time = now(),
    remark = ${sqlLiteral(smokeRemark)}
WHERE id = ${sqlLiteral(existingId)};`);
    return existingId;
  }
  await dbExec(`
INSERT INTO sys_user (
  id, tenant_id, park_id, username, display_name, password_hash, is_enabled, status, remark
) VALUES (
  ${sqlLiteral(userId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(spec.username)},
  ${sqlLiteral(spec.displayName)}, ${sqlLiteral(passwordHash)}, true, 'enabled', ${sqlLiteral(smokeRemark)}
);`);
  return userId;
}

async function bindUserToRole(userId, roleId) {
  await dbExec(`
UPDATE rel_user_role
SET is_deleted = true,
    update_time = now(),
    remark = ${sqlLiteral(`${smokeRemark}; replaced`)}
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND user_id = ${sqlLiteral(userId)}
  AND is_deleted = false;`);
  await dbExec(`
INSERT INTO rel_user_role (tenant_id, park_id, user_id, role_id, remark)
VALUES (${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(userId)}, ${sqlLiteral(roleId)}, ${sqlLiteral(smokeRemark)});`);
  await dbExec(`
WITH existing AS (
  SELECT id
  FROM rel_user_park
  WHERE tenant_id = ${sqlLiteral(tenantId)}
    AND user_id = ${sqlLiteral(userId)}
    AND park_id = ${sqlLiteral(parkId)}
  ORDER BY create_time ASC
  LIMIT 1
), updated AS (
  UPDATE rel_user_park
  SET is_default = true,
      status = 'enabled',
      is_deleted = false,
      update_time = now(),
      remark = ${sqlLiteral(smokeRemark)}
  WHERE id IN (SELECT id FROM existing)
  RETURNING id
)
INSERT INTO rel_user_park (tenant_id, user_id, park_id, is_default, status, remark)
SELECT ${sqlLiteral(tenantId)}, ${sqlLiteral(userId)}, ${sqlLiteral(parkId)}, true, 'enabled', ${sqlLiteral(smokeRemark)}
WHERE NOT EXISTS (SELECT 1 FROM updated);`);
}

async function ensureEnterpriseFixture() {
  const inScopeEnterpriseId = await ensureParkTenant(
    "SAFETY_SMOKE_ENTERPRISE_IN",
    "Safety Smoke In Scope Enterprise",
    "SAFETY-SMOKE-IN"
  );
  const outOfScopeEnterpriseId = await ensureParkTenant(
    "SAFETY_SMOKE_ENTERPRISE_OUT",
    "Safety Smoke Out Of Scope Enterprise",
    "SAFETY-SMOKE-OUT"
  );
  await ensureHazard("SAFETY_SMOKE_HAZARD_IN", "Safety smoke in-scope hazard", inScopeEnterpriseId, true);
  await ensureHazard("SAFETY_SMOKE_HAZARD_OUT", "Safety smoke out-of-scope hazard", outOfScopeEnterpriseId, true);
  await assertEnterpriseHazardsVerifiable(inScopeEnterpriseId, outOfScopeEnterpriseId);
  return { inScopeEnterpriseId, outOfScopeEnterpriseId };
}

async function ensureParkTenant(code, companyName, creditCode) {
  const existingId = await dbScalar(`
SELECT id::text
FROM biz_park_tenant
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND park_tenant_code = ${sqlLiteral(code)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  if (existingId) {
    await dbExec(`
UPDATE biz_park_tenant
SET company_name = ${sqlLiteral(companyName)},
    unified_credit_code = ${sqlLiteral(creditCode)},
    status = '10',
    source_type = 'manual',
    risk_level = 'low',
    update_time = now(),
    remark = ${sqlLiteral(smokeRemark)}
WHERE id = ${sqlLiteral(existingId)};`);
    return existingId;
  }
  const id = randomUUID();
  await dbExec(`
INSERT INTO biz_park_tenant (
  id, tenant_id, park_id, code, park_tenant_code, company_name, unified_credit_code,
  contact_name, contact_mobile, tenant_type, risk_level, risk_tags, status, source_type, remark
) VALUES (
  ${sqlLiteral(id)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(code)}, ${sqlLiteral(code)},
  ${sqlLiteral(companyName)}, ${sqlLiteral(creditCode)}, 'Safety Smoke', NULL, 'smoke', 'low',
  '[]'::jsonb, '10', 'manual', ${sqlLiteral(smokeRemark)}
);`);
  return id;
}

async function ensureHazard(hazardCode, title, parkTenantId, overdue) {
  const existingId = await dbScalar(`
SELECT id::text
FROM biz_safety_hazard
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND hazard_code = ${sqlLiteral(hazardCode)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  const status = overdue ? "70" : "10";
  if (existingId) {
    await dbExec(`
UPDATE biz_safety_hazard
SET code = ${sqlLiteral(hazardCode)},
    hazard_title = ${sqlLiteral(title)},
    title = ${sqlLiteral(title)},
    hazard_type = 'other',
    risk_level = 'low',
    source_type = 'manual',
    park_tenant_id = ${sqlLiteral(parkTenantId)},
    description = ${sqlLiteral(`${title} fixture record`)},
    status = ${sqlLiteral(status)},
    location = 'Safety smoke fixture location',
    overdue_flag = ${sqlBool(overdue)},
    upgrade_flag = false,
    update_time = now(),
    remark = ${sqlLiteral(smokeRemark)}
WHERE id = ${sqlLiteral(existingId)};`);
    return existingId;
  }
  const id = randomUUID();
  await dbExec(`
INSERT INTO biz_safety_hazard (
  id, tenant_id, park_id, code, hazard_code, hazard_title, title, hazard_type, risk_level,
  source_type, park_tenant_id, description, photo_file_ids, status, location,
  before_photo_file_ids, after_photo_file_ids, overdue_flag, upgrade_flag, remark
) VALUES (
  ${sqlLiteral(id)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(hazardCode)},
  ${sqlLiteral(hazardCode)}, ${sqlLiteral(title)}, ${sqlLiteral(title)}, 'other', 'low',
  'manual', ${sqlLiteral(parkTenantId)}, ${sqlLiteral(`${title} fixture record`)}, ARRAY[]::uuid[],
  ${sqlLiteral(status)}, 'Safety smoke fixture location', ARRAY[]::uuid[], ARRAY[]::uuid[],
  ${sqlBool(overdue)}, false, ${sqlLiteral(smokeRemark)}
);`);
  return id;
}

async function assertEnterpriseHazardsVerifiable(inScopeEnterpriseId, outOfScopeEnterpriseId) {
  const row = await dbScalar(`
SELECT
  count(*) FILTER (WHERE park_tenant_id = ${sqlLiteral(inScopeEnterpriseId)})::text || '|' ||
  count(*) FILTER (WHERE park_tenant_id = ${sqlLiteral(outOfScopeEnterpriseId)})::text || '|' ||
  count(*) FILTER (WHERE tenant_id IS NULL OR park_id IS NULL OR park_tenant_id IS NULL)::text
FROM biz_safety_hazard
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND park_id = ${sqlLiteral(parkId)}
  AND hazard_code IN ('SAFETY_SMOKE_HAZARD_IN', 'SAFETY_SMOKE_HAZARD_OUT')
  AND is_deleted = false;`);
  const [inCount, outCount, missingScopeCount] = row.split("|").map(Number);
  if (inCount < 1 || outCount < 1) fail("enterprise scoped hazards are incomplete");
  if (missingScopeCount > 0) fail("enterprise scoped hazards are missing tenant, park, or enterprise fields");
}

async function ensureEnterpriseDataScope(roleId, enterpriseId) {
  const ruleId = await ensureDataScopeRule(enterpriseId);
  await dbExec(`
UPDATE rel_role_data_scope
SET is_deleted = true,
    update_time = now(),
    remark = ${sqlLiteral(`${smokeRemark}; replaced`)}
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND role_id = ${sqlLiteral(roleId)}
  AND is_deleted = false;`);
  await dbExec(`
INSERT INTO rel_role_data_scope (tenant_id, park_id, role_id, rule_id, remark)
VALUES (${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(roleId)}, ${sqlLiteral(ruleId)}, ${sqlLiteral(smokeRemark)});`);
}

async function ensureDataScopeRule(enterpriseId) {
  const ruleCode = "SAFETY_SMOKE_ENTERPRISE_SCOPE";
  const config = { tenantCompanyIds: [enterpriseId], ids: [enterpriseId] };
  const existingRule = await dbScalar(`
SELECT jsonb_build_object(
  'id', id::text,
  'parkId', park_id,
  'scopeConfig', scope_config
)::text
FROM sys_data_scope_rule
WHERE tenant_id = ${sqlLiteral(tenantId)}
  AND rule_code = ${sqlLiteral(ruleCode)}
  AND is_deleted = false
ORDER BY create_time ASC
LIMIT 1;`);
  if (existingRule) {
    const parsed = JSON.parse(existingRule);
    const existingParkId = parsed.parkId === null || parsed.parkId === undefined ? null : String(parsed.parkId);
    const existingEnterpriseIds = extractScopeEnterpriseIds(parsed.scopeConfig);
    const expectedEnterpriseIds = extractScopeEnterpriseIds(config);
    const samePark = existingParkId === String(parkId);
    const sameEnterpriseScope = sameStringSet(existingEnterpriseIds, expectedEnterpriseIds);

    if (!samePark || !sameEnterpriseScope) {
      fail(
        `BLOCKED: ${ruleCode} already exists for tenant ${tenantId} with park=${existingParkId ?? "NULL"} ` +
          `enterpriseScope=${[...existingEnterpriseIds].join(",") || "EMPTY"}; current fixture requests ` +
          `park=${parkId} enterpriseScope=${[...expectedEnterpriseIds].join(",")}. ` +
          "Tenant-wide enterprise scope rules cannot be retargeted across parks. Use the original fixture park or create a separate fixture design."
      );
    }

    return parsed.id;
  }
  const id = randomUUID();
  await dbExec(`
INSERT INTO sys_data_scope_rule (
  id, tenant_id, park_id, rule_code, rule_name, dimension, scope_type, scope_config, status, remark
) VALUES (
  ${sqlLiteral(id)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(ruleCode)},
  'Safety smoke enterprise scope', 'tenant_company', 'custom', ${sqlJson(config)}, 'enabled', ${sqlLiteral(smokeRemark)}
);`);
  return id;
}

function extractScopeEnterpriseIds(scopeConfig) {
  const ids = new Set();
  for (const key of ["tenantCompanyIds", "ids"]) {
    const value = scopeConfig && scopeConfig[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined && String(item).trim()) ids.add(String(item));
      }
    }
  }
  return ids;
}

function sameStringSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

async function assertNoHighRiskForNonAdmin() {
  const rows = await dbScalar(`
SELECT user_account.username || ':' || string_agg(permission.code, ',' ORDER BY permission.code)
FROM sys_user user_account
JOIN rel_user_role user_role ON user_role.user_id = user_account.id AND user_role.is_deleted = false
JOIN sys_role role ON role.id = user_role.role_id AND role.is_deleted = false
JOIN rel_role_perm role_perm ON role_perm.role_id = role.id AND role_perm.is_deleted = false
JOIN sys_permission permission ON permission.id = role_perm.permission_id AND permission.is_deleted = false
WHERE user_account.tenant_id = ${sqlLiteral(tenantId)}
  AND user_account.park_id = ${sqlLiteral(parkId)}
  AND user_account.username LIKE 'SAFETY_SMOKE_%'
  AND user_account.username <> 'SAFETY_SMOKE_ADMIN'
  AND user_account.is_deleted = false
  AND permission.code IN (${highRiskPermissions.map(sqlLiteral).join(", ")})
GROUP BY user_account.username
ORDER BY user_account.username;`);
  if (rows) fail(`non-admin smoke user has high-risk permission(s): ${rows.replaceAll("\n", "; ")}`);
  pass("non-admin smoke users have no checked high-risk permissions");
}

async function assertSpecializedNegativePermissions() {
  const rows = await dbScalar(`
SELECT user_account.username || ':' || permission.code
FROM sys_user user_account
JOIN rel_user_role user_role ON user_role.user_id = user_account.id AND user_role.is_deleted = false
JOIN sys_role role ON role.id = user_role.role_id AND role.is_deleted = false
JOIN rel_role_perm role_perm ON role_perm.role_id = role.id AND role_perm.is_deleted = false
JOIN sys_permission permission ON permission.id = role_perm.permission_id AND permission.is_deleted = false
WHERE user_account.tenant_id = ${sqlLiteral(tenantId)}
  AND user_account.park_id = ${sqlLiteral(parkId)}
  AND user_account.is_deleted = false
  AND (
    (user_account.username = 'SAFETY_SMOKE_OVERDUE_HAZARD' AND permission.code IN ('safety_hazard:read', 'safety:hazards'))
    OR (user_account.username = 'SAFETY_SMOKE_SINGLE_STATISTICS' AND permission.code IN ('safety_work_permit_statistics:read', 'safety:emergency-dashboard'))
    OR (user_account.username = 'SAFETY_SMOKE_UNAUTHORIZED' AND (permission.code LIKE 'safety%' OR permission.code LIKE 'video%'))
  )
ORDER BY user_account.username, permission.code;`);
  if (rows) fail(`specialized smoke user has forbidden permission(s): ${rows.replaceAll("\n", "; ")}`);
  pass("specialized negative permission boundaries are clean");
}

async function prepareFixtures() {
  assertEnvironmentGuard();
  info(`Preparing safety access smoke fixtures for tenant=${tenantId} park=${parkId} dbMode=${dbMode}`);
  await assertRequiredMigrations();
  await assertTablesAndPermissions();
  await ensureTenantAndPark();
  await cleanupDuplicateFixtureRows();

  const enterpriseFixture = await ensureEnterpriseFixture();
  const prepared = {};

  for (const kind of accountKinds) {
    const password = generatePassword();
    const passwordHash = await generatePasswordHash(password);
    const roleId = await ensureRole(kind);
    await replaceRolePermissions(roleId, roleSpecs[kind].permissions);
    if (kind === "ENTERPRISE") await ensureEnterpriseDataScope(roleId, enterpriseFixture.inScopeEnterpriseId);
    const userId = await ensureUser(kind, passwordHash);
    await bindUserToRole(userId, roleId);
    prepared[kind] = { ...userSpecs[kind], password, userId, roleId };
  }

  await assertNoHighRiskForNonAdmin();
  await assertSpecializedNegativePermissions();

  printSummary(prepared, enterpriseFixture);
}

function printSummary(prepared, enterpriseFixture) {
  console.log("");
  pass("safety access smoke fixtures prepared");
  console.log("[INFO] Created or updated users:");
  for (const kind of accountKinds) {
    console.log(`  - ${kind}: ${prepared[kind].username}`);
  }
  console.log(`[INFO] In-scope enterprise id: ${enterpriseFixture.inScopeEnterpriseId}`);
  console.log(`[INFO] Out-of-scope enterprise id: ${enterpriseFixture.outOfScopeEnterpriseId}`);
  console.log("");
  console.log("# Local/test-only exports for the current shell. Do not commit these values.");
  console.log(`export SAFETY_SMOKE_ENVIRONMENT=${shellQuote(environment)}`);
  console.log(`export SAFETY_SMOKE_API_BASE_URL=${shellQuote(apiBase)}`);
  console.log(`export SAFETY_SMOKE_TENANT_ID=${shellQuote(tenantId)}`);
  console.log(`export SAFETY_SMOKE_PARK_ID=${shellQuote(parkId)}`);
  for (const kind of accountKinds) {
    console.log(`export SAFETY_SMOKE_${kind}_USERNAME=${shellQuote(prepared[kind].username)}`);
    console.log(`export SAFETY_SMOKE_${kind}_PASSWORD=${shellQuote(prepared[kind].password)}`);
  }
  console.log(`export SAFETY_SMOKE_ENTERPRISE_EXPECTED_TENANT_ID=${shellQuote(tenantId)}`);
  console.log(`export SAFETY_SMOKE_ENTERPRISE_EXPECTED_PARK_ID=${shellQuote(parkId)}`);
  console.log(`export SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID=${shellQuote(enterpriseFixture.inScopeEnterpriseId)}`);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

prepareFixtures().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
