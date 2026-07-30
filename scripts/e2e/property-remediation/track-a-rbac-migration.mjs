import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertExactEphemeralPostgresContainer,
  inspectContainer,
  validateRunId
} from "./bootstrap/ephemeral-postgres.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationPath = resolve(
  rootDir,
  "database/migrations/000183_property_business_granular_rbac.sql"
);
const migrationSql = readFileSync(migrationPath, "utf8");
const databaseUrl = process.env.PROPERTY_RBAC_FIXTURE_DATABASE_URL;
const allowWrite = process.env.PROPERTY_RBAC_FIXTURE_ALLOW_WRITE === "yes";
const fixtureContainer = process.env.PROPERTY_RBAC_FIXTURE_PSQL_CONTAINER;
const fixtureContainerRunId =
  process.env.PROPERTY_RBAC_FIXTURE_CONTAINER_RUN_ID;
const fixtureLabel = "pr192-track-a-rbac";

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function skip(message) {
  console.log(`[SKIP] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertSafeFixtureContainer(databaseName) {
  try {
    validateRunId(fixtureContainerRunId);
  } catch {
    fail("PROPERTY_RBAC_FIXTURE_CONTAINER_RUN_ID is invalid");
  }
  const expectedContainer =
    `pr192_track_a_rbac_fixture_${fixtureContainerRunId}_db`;
  if (fixtureContainer !== expectedContainer) {
    fail(
      `PROPERTY_RBAC_FIXTURE_PSQL_CONTAINER must exactly equal ${expectedContainer}`
    );
  }
  try {
    assertExactEphemeralPostgresContainer(
      inspectContainer(fixtureContainer, { cwd: rootDir }),
      {
        containerName: expectedContainer,
        databaseName,
        fixtureLabel,
        runId: fixtureContainerRunId
      }
    );
  } catch (error) {
    fail(
      `isolated fixture container rejected: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function assertSafeDatabaseTarget() {
  if (!databaseUrl) {
    skip(
      "PROPERTY_RBAC_FIXTURE_DATABASE_URL is not set; DB migration fixture was not executed"
    );
    return false;
  }
  if (!allowWrite) {
    fail("PROPERTY_RBAC_FIXTURE_ALLOW_WRITE=yes is required for the isolated DB fixture");
  }
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    fail("PROPERTY_RBAC_FIXTURE_DATABASE_URL must use postgres:// or postgresql://");
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    fail("property RBAC fixture only accepts a loopback PostgreSQL host");
  }
  if (parsed.search || parsed.hash) {
    fail("property RBAC fixture database URL must not contain connection overrides");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/^[a-zA-Z0-9_-]+$/.test(databaseName)) {
    fail("property RBAC fixture database name contains unsupported characters");
  }
  if (!/(test|fixture|ci)/i.test(databaseName)) {
    fail("property RBAC fixture database name must contain test, fixture or ci");
  }
  if (/(^|[._-])(prod|production)([._-]|$)/i.test(databaseName)) {
    fail("property RBAC fixture refuses a production-like database URL");
  }
  if (fixtureContainer) {
    assertSafeFixtureContainer(databaseName);
  } else if (fixtureContainerRunId) {
    fail(
      "PROPERTY_RBAC_FIXTURE_CONTAINER_RUN_ID is only valid with PROPERTY_RBAC_FIXTURE_PSQL_CONTAINER"
    );
  }
  return true;
}

function psql(input, { tuplesOnly = false } = {}) {
  const parsed = new URL(databaseUrl);
  const psqlArgs = [
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    ...(tuplesOnly ? ["-qAt", "-F", "|"] : ["-q"])
  ];
  const command = fixtureContainer ? "docker" : "psql";
  const args = fixtureContainer
    ? [
        "exec",
        "-i",
        fixtureContainer,
        "psql",
        ...psqlArgs,
        "-U",
        decodeURIComponent(parsed.username),
        "-d",
        decodeURIComponent(parsed.pathname.replace(/^\//, ""))
      ]
    : [databaseUrl, ...psqlArgs];
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    input,
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error?.code === "ENOENT") {
    fail(
      fixtureContainer
        ? "docker is not installed; containerized DB migration fixture cannot run"
        : "psql is not installed; DB migration fixture cannot run"
    );
  }
  if (result.status !== 0) {
    fail(`psql failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function query(sql) {
  return psql(sql, { tuplesOnly: true });
}

function assertScalar(sql, expected, label) {
  const actual = query(sql);
  if (actual !== String(expected)) {
    fail(`${label}: expected ${expected}, got ${actual || "<empty>"}`);
  }
  pass(label);
}

function markedRows(start, end) {
  const block = migrationSql.match(new RegExp(`${start}([\\s\\S]*?)${end}`))?.[1];
  if (!block) fail(`missing migration marker ${start}`);
  return [...block.matchAll(/^\s*\((.+)\),?\s*$/gm)].map((match) =>
    [...match[1].matchAll(/'(?:''|[^'])*'|NULL|true|false|-?\d+/g)].map((token) => {
      const value = token[0];
      return value.startsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : value;
    })
  );
}

function expectedRoleGrantCodes(roleCode, moduleCode) {
  const roleBundles = markedRows(
    "PROPERTY_ROLE_BUNDLES_START",
    "PROPERTY_ROLE_BUNDLES_END"
  )
    .filter((row) => row[0] === roleCode && row[1] === moduleCode)
    .map((row) => row[2]);
  const bundleRows = markedRows(
    "PROPERTY_BUNDLE_PERMISSIONS_START",
    "PROPERTY_BUNDLE_PERMISSIONS_END"
  );
  const rootCode = moduleCode === "homestay" ? "homestay" : "housing_rental";
  return [
    ...new Set([
      rootCode,
      ...bundleRows
        .filter((row) => roleBundles.includes(row[0]))
        .map((row) => row[1])
    ])
  ].sort();
}

function quotedList(values) {
  return values.map(sqlLiteral).join(", ");
}

function assertGrantSet(tenantId, parkId, roleCode, expectedCodes) {
  const actual = query(`
    SELECT permission.code
    FROM rel_role_perm role_permission
    JOIN sys_role role
      ON role.id = role_permission.role_id
     AND role.tenant_id = role_permission.tenant_id
    JOIN sys_permission permission
      ON permission.id = role_permission.permission_id
     AND permission.tenant_id = role_permission.tenant_id
    WHERE role_permission.tenant_id = ${sqlLiteral(tenantId)}
      AND role_permission.park_id = ${sqlLiteral(parkId)}
      AND role.code = ${sqlLiteral(roleCode)}
      AND role_permission.is_deleted = false
    ORDER BY permission.code;
  `);
  const actualCodes = actual ? actual.split("\n") : [];
  if (JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes)) {
    fail(
      `${roleCode}@${parkId} grant set mismatch\nexpected=${JSON.stringify(expectedCodes)}\nactual=${JSON.stringify(actualCodes)}`
    );
  }
  pass(`${roleCode}@${parkId} exact grant set`);
}

if (assertSafeDatabaseTarget()) {
const ids = {
  singleTenant: randomUUID(),
  singlePark: randomUUID(),
  multiTenant: randomUUID(),
  multiHomestayPark: randomUUID(),
  multiHousingPark: randomUUID(),
  disabledTenant: randomUUID(),
  disabledPark: randomUUID(),
  expiredTenant: randomUUID(),
  expiredPark: randomUUID(),
  missingTenant: randomUUID(),
  missingPark: randomUUID(),
  statusDisabledTenant: randomUUID(),
  statusDisabledPark: randomUUID()
};
const fixtureTenants = [
  ids.singleTenant,
  ids.multiTenant,
  ids.disabledTenant,
  ids.expiredTenant,
  ids.missingTenant,
  ids.statusDisabledTenant
];
const tenantList = quotedList(fixtureTenants);

function cleanup() {
  psql(`
    BEGIN;
    DELETE FROM rel_role_perm WHERE tenant_id IN (${tenantList});
    DELETE FROM sys_role WHERE tenant_id IN (${tenantList});
    DELETE FROM sys_permission WHERE tenant_id IN (${tenantList});
    DELETE FROM rel_tenant_module WHERE tenant_id IN (${tenantList});
    COMMIT;
  `);
}

try {
  const schemaProbe = query(`
    SELECT
      to_regclass('public.sys_permission') IS NOT NULL
      AND to_regclass('public.sys_role') IS NOT NULL
      AND to_regclass('public.rel_role_perm') IS NOT NULL
      AND to_regclass('public.rel_tenant_module') IS NOT NULL;
  `);
  if (schemaProbe !== "t") fail("target database is missing the required RBAC schema");

  const modules = query(`
    SELECT module_code, id
    FROM sys_module
    WHERE module_code IN ('homestay', 'housing_rental')
      AND status = 1
      AND is_deleted = false
    ORDER BY module_code;
  `);
  const moduleIds = new Map(
    modules.split("\n").filter(Boolean).map((row) => {
      const [code, id] = row.split("|");
      return [code, id];
    })
  );
  if (!moduleIds.get("homestay") || !moduleIds.get("housing_rental")) {
    fail("target database must contain active homestay and housing_rental sys_module rows");
  }

  cleanup();
  psql(`
    BEGIN;
    INSERT INTO rel_tenant_module (
      id, tenant_id, park_id, module_id, enabled, status,
      start_time, expire_time, is_deleted, version, remark
    ) VALUES
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.singleTenant)}, ${sqlLiteral(ids.singlePark)}, ${sqlLiteral(moduleIds.get("homestay"))}::uuid, true, 'enabled', now(), NULL, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.multiTenant)}, ${sqlLiteral(ids.multiHomestayPark)}, ${sqlLiteral(moduleIds.get("homestay"))}::uuid, true, 'enabled', now(), NULL, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.multiTenant)}, ${sqlLiteral(ids.multiHousingPark)}, ${sqlLiteral(moduleIds.get("housing_rental"))}::uuid, true, 'enabled', now(), NULL, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.disabledTenant)}, ${sqlLiteral(ids.disabledPark)}, ${sqlLiteral(moduleIds.get("homestay"))}::uuid, false, 'enabled', now(), NULL, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.expiredTenant)}, ${sqlLiteral(ids.expiredPark)}, ${sqlLiteral(moduleIds.get("homestay"))}::uuid, true, 'enabled', now() - interval '2 days', now() - interval '1 day', false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.statusDisabledTenant)}, ${sqlLiteral(ids.statusDisabledPark)}, ${sqlLiteral(moduleIds.get("homestay"))}::uuid, true, 'disabled', now(), NULL, false, 1, 'Track A RBAC fixture');

    INSERT INTO sys_role (
      id, tenant_id, park_id, code, name, is_enabled, is_system,
      is_builtin, is_super, is_deleted, version, remark
    ) VALUES
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.singleTenant)}, ${sqlLiteral(ids.singlePark)}, 'PROPERTY_STAFF', 'Fixture property staff', true, true, true, false, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.singleTenant)}, ${sqlLiteral(ids.singlePark)}, 'CUSTOM_PROPERTY_FIXTURE', 'Fixture custom role', true, false, false, false, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.multiTenant)}, ${sqlLiteral(ids.multiHomestayPark)}, 'PROPERTY_MANAGER', 'Fixture property manager', true, true, true, false, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.multiTenant)}, ${sqlLiteral(ids.multiHousingPark)}, 'FINANCE_MANAGER', 'Fixture finance manager', true, true, true, false, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.disabledTenant)}, ${sqlLiteral(ids.disabledPark)}, 'PROPERTY_STAFF', 'Fixture disabled staff', true, true, true, false, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.expiredTenant)}, ${sqlLiteral(ids.expiredPark)}, 'PROPERTY_STAFF', 'Fixture expired staff', true, true, true, false, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.missingTenant)}, ${sqlLiteral(ids.missingPark)}, 'PROPERTY_STAFF', 'Fixture missing staff', true, true, true, false, false, 1, 'Track A RBAC fixture'),
      (${sqlLiteral(randomUUID())}::uuid, ${sqlLiteral(ids.statusDisabledTenant)}, ${sqlLiteral(ids.statusDisabledPark)}, 'PROPERTY_STAFF', 'Fixture status-disabled staff', true, true, true, false, false, 1, 'Track A RBAC fixture');
    COMMIT;
  `);

  info("Executing 000183 directly for the first fixture pass");
  psql(migrationSql);

  assertScalar(
    `SELECT count(*) FROM sys_permission WHERE tenant_id = ${sqlLiteral(ids.singleTenant)} AND is_deleted = false;`,
    37,
    "single-module tenant has the exact homestay/property definition set"
  );
  assertScalar(
    `SELECT count(*) FROM sys_permission WHERE tenant_id = ${sqlLiteral(ids.multiTenant)} AND is_deleted = false;`,
    65,
    "multi-park tenant has one exact 65-code definition set"
  );
  assertScalar(
    `SELECT count(*) FROM sys_permission WHERE tenant_id IN (${sqlLiteral(ids.disabledTenant)}, ${sqlLiteral(ids.expiredTenant)}, ${sqlLiteral(ids.missingTenant)}, ${sqlLiteral(ids.statusDisabledTenant)});`,
    0,
    "disabled, expired, missing and status-disabled assignments create no definitions"
  );
  assertScalar(
    `SELECT count(*) FROM (
       SELECT code FROM sys_permission
       WHERE tenant_id = ${sqlLiteral(ids.multiTenant)} AND is_deleted = false
       GROUP BY code HAVING count(*) <> 1
     ) duplicate_codes;`,
    0,
    "multi-park permission definitions remain tenant-unique"
  );
  assertScalar(
    `SELECT count(*) FROM sys_permission child
     LEFT JOIN sys_permission parent ON parent.id = child.parent_id
     WHERE child.tenant_id IN (${sqlLiteral(ids.singleTenant)}, ${sqlLiteral(ids.multiTenant)})
       AND child.perm_type = 20 AND child.is_deleted = false
       AND (parent.id IS NULL OR parent.tenant_id <> child.tenant_id);`,
    0,
    "all canonical and compatibility pages have a same-tenant parent"
  );

  assertGrantSet(
    ids.singleTenant,
    ids.singlePark,
    "PROPERTY_STAFF",
    expectedRoleGrantCodes("PROPERTY_STAFF", "homestay")
  );
  assertGrantSet(
    ids.multiTenant,
    ids.multiHomestayPark,
    "PROPERTY_MANAGER",
    expectedRoleGrantCodes("PROPERTY_MANAGER", "homestay")
  );
  assertGrantSet(
    ids.multiTenant,
    ids.multiHousingPark,
    "FINANCE_MANAGER",
    expectedRoleGrantCodes("FINANCE_MANAGER", "housing_rental")
  );

  psql(`
    BEGIN;
    INSERT INTO sys_permission (
      id, tenant_id, park_id, code, name, resource, action,
      permission_type, perm_type, is_system, is_builtin, is_tenant_custom,
      visible, is_enabled, status, is_deleted, version, remark
    ) VALUES (
      ${sqlLiteral(randomUUID())}::uuid,
      ${sqlLiteral(ids.singleTenant)},
      ${sqlLiteral(ids.singlePark)},
      '*', 'Fixture wildcard', 'fixture', 'fixture',
      'custom', 90, false, false, true,
      false, true, 'enabled', false, 1, 'Track A RBAC fixture'
    );
    INSERT INTO rel_role_perm (
      tenant_id, park_id, role_id, permission_id,
      is_deleted, version, remark
    )
    SELECT
      role.tenant_id, role.park_id, role.id, permission.id,
      false, 1, 'Track A RBAC custom negative fixture'
    FROM sys_role role
    JOIN sys_permission permission ON permission.tenant_id = role.tenant_id
    WHERE role.tenant_id = ${sqlLiteral(ids.singleTenant)}
      AND role.code = 'CUSTOM_PROPERTY_FIXTURE'
      AND permission.code IN ('*', 'homestay:operations', 'homestay:booking:read')
      AND role.is_deleted = false
      AND permission.is_deleted = false;
    COMMIT;
  `);

  const permissionTimestampSnapshot = query(`
    SELECT code, update_time::text
    FROM sys_permission
    WHERE tenant_id IN (${sqlLiteral(ids.singleTenant)}, ${sqlLiteral(ids.multiTenant)})
      AND remark = 'PR192 Track A granular property RBAC'
      AND is_deleted = false
    ORDER BY tenant_id, code;
  `);
  const grantTimestampSnapshot = query(`
    SELECT role_id, permission_id, create_time::text, update_time::text
    FROM rel_role_perm
    WHERE tenant_id IN (${sqlLiteral(ids.singleTenant)}, ${sqlLiteral(ids.multiTenant)})
      AND remark = 'PR192 Track A explicit property bundle grant'
      AND is_deleted = false
    ORDER BY tenant_id, park_id, role_id, permission_id;
  `);

  info("Executing 000183 directly for the second fixture pass");
  psql(migrationSql);

  const secondPermissionTimestampSnapshot = query(`
    SELECT code, update_time::text
    FROM sys_permission
    WHERE tenant_id IN (${sqlLiteral(ids.singleTenant)}, ${sqlLiteral(ids.multiTenant)})
      AND remark = 'PR192 Track A granular property RBAC'
      AND is_deleted = false
    ORDER BY tenant_id, code;
  `);
  const secondGrantTimestampSnapshot = query(`
    SELECT role_id, permission_id, create_time::text, update_time::text
    FROM rel_role_perm
    WHERE tenant_id IN (${sqlLiteral(ids.singleTenant)}, ${sqlLiteral(ids.multiTenant)})
      AND remark = 'PR192 Track A explicit property bundle grant'
      AND is_deleted = false
    ORDER BY tenant_id, park_id, role_id, permission_id;
  `);
  if (permissionTimestampSnapshot !== secondPermissionTimestampSnapshot) {
    fail("permission timestamps changed on the second direct migration run");
  }
  pass("permission timestamps are stable on rerun");
  if (grantTimestampSnapshot !== secondGrantTimestampSnapshot) {
    fail("role grant timestamps changed on the second direct migration run");
  }
  pass("role grant timestamps are stable on rerun");

  assertGrantSet(ids.singleTenant, ids.singlePark, "CUSTOM_PROPERTY_FIXTURE", [
    "*",
    "homestay:booking:read",
    "homestay:operations"
  ]);
  assertScalar(
    `SELECT count(*)
     FROM rel_role_perm role_permission
     JOIN sys_role role ON role.id = role_permission.role_id
     JOIN sys_permission permission ON permission.id = role_permission.permission_id
     WHERE role_permission.tenant_id = ${sqlLiteral(ids.multiTenant)}
       AND role_permission.is_deleted = false
       AND (
         role.tenant_id <> role_permission.tenant_id
         OR permission.tenant_id <> role_permission.tenant_id
         OR
         role_permission.park_id <> role.park_id
         OR (
           role.park_id = ${sqlLiteral(ids.multiHomestayPark)}
           AND permission.code IN (${quotedList(markedRows("PROPERTY_PERMISSION_DEFINITIONS_START", "PROPERTY_PERMISSION_DEFINITIONS_END").filter((row) => row[0] === "housing_rental").map((row) => row[1]))})
         )
         OR (
           role.park_id = ${sqlLiteral(ids.multiHousingPark)}
           AND permission.code IN (${quotedList(markedRows("PROPERTY_PERMISSION_DEFINITIONS_START", "PROPERTY_PERMISSION_DEFINITIONS_END").filter((row) => row[0] === "homestay").map((row) => row[1]))})
         )
       );`,
    0,
    "no cross-tenant, cross-park or cross-module built-in grant is created"
  );

  pass("Track A RBAC migration DB fixture completed");
} finally {
  cleanup();
  info("Track A RBAC fixture rows cleaned up");
}
}
