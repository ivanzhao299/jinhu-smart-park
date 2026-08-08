import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
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

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = resolve(rootDir, "database/migrations");
const seedPath = resolve(rootDir, "database/seeds/000001_s1_production_core.sql");
const migration183Path = resolve(
  migrationsDir,
  "000183_property_business_granular_rbac.sql"
);
const migration184Path = resolve(
  migrationsDir,
  "000184_property_workbench_read_permissions.sql"
);
const migration183Sql = readFileSync(migration183Path, "utf8");
const migration184Sql = readFileSync(migration184Path, "utf8");
const productionSeedSql = readFileSync(seedPath, "utf8");
const runId = process.env.PROPERTY_RBAC_FIXTURE_RUN_ID ?? "";
const containerName = `pr192_track_a_rbac_fixture_${runId}_db`;
const fixtureLabel = "pr192-track-a-rbac";
const databaseName = "pr192_track_a_rbac_fixture";
const postgresUser = "pr192_rbac";
const postgresPassword = `${runId}_local_only`;
const evidenceSchema = "property-remediation-a25-rbac-evidence-v1";

let containerId = null;
let volumeName = null;
let cleanupResult = {
  container_absent: true,
  anonymous_volume_absent: true,
  errors: []
};
const checks = {};

function log(message) {
  process.stderr.write(`[A-2.5 RBAC] ${message}\n`);
}

function pass(key, details = true) {
  checks[key] = details;
  log(`PASS ${key}`);
}

function fail(message) {
  throw new Error(message);
}

function sorted(values) {
  return [...values].sort();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function markedRows(source, start, end) {
  const block = source.match(new RegExp(`${start}([\\s\\S]*?)${end}`))?.[1];
  if (!block) fail(`missing SQL marker ${start}`);
  return [...block.matchAll(/^\s*\((.+)\),?\s*$/gm)].map((match) =>
    [...match[1].matchAll(/'(?:''|[^'])*'|NULL|true|false|-?\d+/g)].map(
      (token) => {
        const value = token[0];
        return value.startsWith("'")
          ? value.slice(1, -1).replace(/''/g, "'")
          : value;
      }
    )
  );
}

function validateStaticContract() {
  const baseDefinitions = markedRows(
    migration183Sql,
    "PROPERTY_PERMISSION_DEFINITIONS_START",
    "PROPERTY_PERMISSION_DEFINITIONS_END"
  );
  const deltaDefinitions = markedRows(
    migration184Sql,
    "PROPERTY_WORKBENCH_READ_DEFINITIONS_START",
    "PROPERTY_WORKBENCH_READ_DEFINITIONS_END"
  );
  const baseBundles = markedRows(
    migration183Sql,
    "PROPERTY_BUNDLE_PERMISSIONS_START",
    "PROPERTY_BUNDLE_PERMISSIONS_END"
  );
  const deltaBundles = markedRows(
    migration184Sql,
    "PROPERTY_WORKBENCH_READ_BUNDLE_PERMISSIONS_START",
    "PROPERTY_WORKBENCH_READ_BUNDLE_PERMISSIONS_END"
  );
  const baseRoles = markedRows(
    migration183Sql,
    "PROPERTY_ROLE_BUNDLES_START",
    "PROPERTY_ROLE_BUNDLES_END"
  );
  const deltaRoles = markedRows(
    migration184Sql,
    "PROPERTY_WORKBENCH_READ_ROLE_BUNDLES_START",
    "PROPERTY_WORKBENCH_READ_ROLE_BUNDLES_END"
  );
  const deltaBundleCodes = new Set(deltaBundles.map((row) => row[0]));
  const expectedDeltaRoles = baseRoles.filter((row) =>
    deltaBundleCodes.has(row[2])
  );

  if (baseDefinitions.length !== 65) fail("000183 must define exactly 65 permissions");
  if (deltaDefinitions.length !== 7) fail("000184 must define exactly 7 read permissions");
  if (new Set([...baseDefinitions, ...deltaDefinitions].map((row) => row[1])).size !== 72) {
    fail("000183 + 000184 must define exactly 72 unique property permissions");
  }
  const bundlePairs = [...baseBundles, ...deltaBundles].map((row) =>
    `${row[0]}\u0000${row[1]}`
  );
  if (bundlePairs.length !== 59 || new Set(bundlePairs).size !== 59) {
    fail("14 property bundles must contain exactly 59 unique permission pairs");
  }
  if (
    deltaBundles.length !== 7 ||
    new Set(deltaBundles.map((row) => row[1])).size !== 7
  ) {
    fail("each A-2.5 read permission must have exactly one bundle owner");
  }
  if (
    JSON.stringify(sorted(deltaRoles.map((row) => row.join("\u0000")))) !==
    JSON.stringify(sorted(expectedDeltaRoles.map((row) => row.join("\u0000"))))
  ) {
    fail("000184 role grants do not match the literal 000183 role-bundle matrix");
  }
  pass("static_contract", {
    baseline_permissions: 65,
    delta_permissions: 7,
    combined_permissions: 72,
    bundle_count: new Set(bundlePairs.map((pair) => pair.split("\u0000")[0])).size,
    bundle_pairs: 59,
    delta_single_owner: true,
    literal_role_matrix: true
  });

  return {
    baseCodes: baseDefinitions.map((row) => row[1]),
    deltaCodes: deltaDefinitions.map((row) => row[1]),
    homestayCodes: [...baseDefinitions, ...deltaDefinitions]
      .filter((row) => row[0] === "homestay")
      .map((row) => row[1]),
    housingCodes: [...baseDefinitions, ...deltaDefinitions]
      .filter((row) => row[0] === "housing_rental")
      .map((row) => row[1])
  };
}

function docker(args, { input, allowFailure = false } = {}) {
  return runDocker(args, { cwd: rootDir, input, allowFailure });
}

function psql(input, { tuplesOnly = false } = {}) {
  if (!containerId) fail("ephemeral PostgreSQL container is not available");
  const result = docker([
    "exec",
    "-i",
    containerId,
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    ...(tuplesOnly ? ["-qAt", "-F", "|"] : ["-q"]),
    "-U",
    postgresUser,
    "-d",
    databaseName
  ], { input });
  return result.stdout.trim();
}

function query(sql) {
  return psql(sql, { tuplesOnly: true });
}

function assertScalar(sql, expected, key) {
  const actual = query(sql);
  if (actual !== String(expected)) {
    fail(`${key}: expected ${expected}, got ${actual || "<empty>"}`);
  }
  pass(key, actual);
}

async function waitForPostgres() {
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    const ready = docker(
      ["exec", containerId, "pg_isready", "-U", postgresUser, "-d", databaseName],
      { allowFailure: true }
    );
    if (ready.status === 0) {
      const probe = docker(
        [
          "exec", containerId, "psql", "-X", "-qAt",
          "-U", postgresUser, "-d", databaseName, "-c", "SELECT 1"
        ],
        { allowFailure: true }
      );
      if (probe.status === 0 && probe.stdout.trim() === "1") return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  fail("ephemeral PostgreSQL did not become ready within 60 seconds");
}

function migrationNumber(filename) {
  const match = filename.match(/^(\d{6})_.+\.sql$/);
  return match ? Number(match[1]) : null;
}

function applyBaselineMigrations() {
  const files = readdirSync(migrationsDir)
    .filter((filename) => {
      const number = migrationNumber(filename);
      return number !== null && number <= 182 && number !== 175;
    })
    .sort();
  for (const filename of files) {
    psql(readFileSync(resolve(migrationsDir, filename), "utf8"));
  }
  pass("baseline_migrations", {
    applied: files.length,
    skipped: ["000175_2026_responsibility_user_role_queue.sql"],
    through: "000182"
  });
}

function insertFixture(contract) {
  const ids = {
    tenant: randomUUID(),
    homestayPark: randomUUID(),
    housingPark: randomUUID(),
    disabledTenant: randomUUID(),
    disabledPark: randomUUID(),
    expiredTenant: randomUUID(),
    expiredPark: randomUUID(),
    statusDisabledTenant: randomUUID(),
    statusDisabledPark: randomUUID(),
    missingTenant: randomUUID(),
    missingPark: randomUUID()
  };
  psql(`
    BEGIN;
    INSERT INTO sys_module (
      id, module_code, module_name, module_group, description,
      route_prefix, icon, status, sort_no, is_deleted, version, remark
    ) VALUES (
      uuid_generate_v4(), 'asset', '资产管理', 'core',
      'A-2.5 isolated RBAC fixture', '/assets', 'building',
      1, 20, false, 1, 'A-2.5 isolated RBAC fixture'
    )
    ON CONFLICT (module_code) WHERE is_deleted = false DO NOTHING;

    INSERT INTO rel_tenant_module (
      id, tenant_id, park_id, module_id, enabled, status,
      start_time, expire_time, is_deleted, version, remark
    )
    SELECT
      uuid_generate_v4(), fixture.tenant_id, fixture.park_id,
      module.id, fixture.enabled, fixture.assignment_status,
      now(), fixture.expire_time, false, 1, 'A-2.5 isolated RBAC fixture'
    FROM (VALUES
      (${sqlLiteral(ids.tenant)}, ${sqlLiteral(ids.homestayPark)}, 'homestay', true, 'enabled', NULL::timestamptz),
      (${sqlLiteral(ids.tenant)}, ${sqlLiteral(ids.housingPark)}, 'housing_rental', true, 'enabled', NULL::timestamptz),
      (${sqlLiteral(ids.tenant)}, ${sqlLiteral(ids.homestayPark)}, 'asset', true, 'enabled', NULL::timestamptz),
      ('10000001', '20000001', 'asset', true, 'enabled', NULL::timestamptz),
      (${sqlLiteral(ids.disabledTenant)}, ${sqlLiteral(ids.disabledPark)}, 'homestay', false, 'enabled', NULL::timestamptz),
      (${sqlLiteral(ids.expiredTenant)}, ${sqlLiteral(ids.expiredPark)}, 'housing_rental', true, 'enabled', now() - interval '1 day'),
      (${sqlLiteral(ids.statusDisabledTenant)}, ${sqlLiteral(ids.statusDisabledPark)}, 'asset', true, 'disabled', NULL::timestamptz)
    ) fixture(tenant_id, park_id, module_code, enabled, assignment_status, expire_time)
    JOIN sys_module module
      ON module.module_code = fixture.module_code
     AND module.status = 1
     AND module.is_deleted = false;

    INSERT INTO sys_permission (
      id, tenant_id, park_id, code, name, resource, action,
      permission_path, perm_path, permission_level, level, sort_no,
      permission_type, perm_type, is_system, is_builtin, is_tenant_custom,
      visible, keep_alive, always_show, is_enabled, status,
      is_deleted, version, remark
    ) VALUES
      (uuid_generate_v4(), ${sqlLiteral(ids.tenant)}, ${sqlLiteral(ids.homestayPark)},
       'asset', '资产管理', 'asset', 'menu', 'asset', 'asset', 1, 1, 20,
       'menu', 10, true, true, false, true, true, true, true, 'enabled',
       false, 1, 'A-2.5 isolated RBAC fixture'),
      (uuid_generate_v4(), ${sqlLiteral(ids.statusDisabledTenant)}, ${sqlLiteral(ids.statusDisabledPark)},
       'asset', '资产管理', 'asset', 'menu', 'asset', 'asset', 1, 1, 20,
       'menu', 10, true, true, false, true, true, true, true, 'enabled',
       false, 1, 'A-2.5 isolated RBAC fixture'),
      (uuid_generate_v4(), '10000001', '20000001',
       'asset', '资产管理', 'asset', 'menu', 'asset', 'asset', 1, 1, 20,
       'menu', 10, true, true, false, true, true, true, true, 'enabled',
       false, 1, 'A-2.5 seed compatibility fixture');

    INSERT INTO sys_role (
      id, tenant_id, park_id, code, name, is_enabled, is_system,
      is_builtin, is_super, is_deleted, version, remark
    ) VALUES
      (uuid_generate_v4(), ${sqlLiteral(ids.tenant)}, ${sqlLiteral(ids.homestayPark)},
       'PROPERTY_MANAGER', 'Fixture property manager', true, true, true, false, false, 1, 'A-2.5 isolated RBAC fixture'),
      (uuid_generate_v4(), ${sqlLiteral(ids.tenant)}, ${sqlLiteral(ids.housingPark)},
       'FINANCE_MANAGER', 'Fixture finance manager', true, true, true, false, false, 1, 'A-2.5 isolated RBAC fixture'),
      (uuid_generate_v4(), ${sqlLiteral(ids.tenant)}, ${sqlLiteral(ids.homestayPark)},
       'CUSTOM_A25', 'Fixture custom role', true, false, false, false, false, 1, 'A-2.5 isolated RBAC fixture'),
      (uuid_generate_v4(), ${sqlLiteral(ids.disabledTenant)}, ${sqlLiteral(ids.disabledPark)},
       'PROPERTY_STAFF', 'Fixture disabled role', true, true, true, false, false, 1, 'A-2.5 isolated RBAC fixture'),
      (uuid_generate_v4(), ${sqlLiteral(ids.expiredTenant)}, ${sqlLiteral(ids.expiredPark)},
       'FINANCE_MANAGER', 'Fixture expired role', true, true, true, false, false, 1, 'A-2.5 isolated RBAC fixture'),
      (uuid_generate_v4(), ${sqlLiteral(ids.statusDisabledTenant)}, ${sqlLiteral(ids.statusDisabledPark)},
       'PROPERTY_STAFF', 'Fixture status-disabled role', true, true, true, false, false, 1, 'A-2.5 isolated RBAC fixture'),
      (uuid_generate_v4(), ${sqlLiteral(ids.missingTenant)}, ${sqlLiteral(ids.missingPark)},
       'PROPERTY_STAFF', 'Fixture missing-module role', true, true, true, false, false, 1, 'A-2.5 isolated RBAC fixture');
    COMMIT;
  `);

  psql(migration183Sql);
  assertScalar(
    `SELECT count(*) FROM sys_permission
     WHERE tenant_id = ${sqlLiteral(ids.tenant)}
       AND code IN (${contract.baseCodes.map(sqlLiteral).join(",")})
       AND is_deleted = false;`,
    65,
    "migration_183_exact_65"
  );

  psql(`
    BEGIN;
    INSERT INTO sys_permission (
      id, tenant_id, park_id, code, name, resource, action,
      permission_type, perm_type, is_system, is_builtin, is_tenant_custom,
      visible, is_enabled, status, is_deleted, version, remark
    ) VALUES (
      uuid_generate_v4(), ${sqlLiteral(ids.tenant)}, ${sqlLiteral(ids.homestayPark)},
      '*', 'Fixture wildcard', 'fixture', 'fixture', 'custom', 90,
      false, false, true, false, true, 'enabled', false, 1,
      'A-2.5 isolated RBAC fixture'
    );
    INSERT INTO rel_role_perm (
      tenant_id, park_id, role_id, permission_id,
      is_deleted, version, remark
    )
    SELECT role.tenant_id, role.park_id, role.id, permission.id,
           false, 1, 'A-2.5 custom negative fixture'
    FROM sys_role role
    JOIN sys_permission permission ON permission.tenant_id = role.tenant_id
    WHERE role.tenant_id = ${sqlLiteral(ids.tenant)}
      AND role.code = 'CUSTOM_A25'
      AND permission.code IN ('*', 'homestay:operations', 'homestay:booking:read')
      AND role.is_deleted = false
      AND permission.is_deleted = false;
    COMMIT;
  `);

  psql(migration184Sql);
  assertScalar(
    `SELECT count(*) FROM sys_permission
     WHERE tenant_id = ${sqlLiteral(ids.tenant)}
       AND code IN (${[...contract.baseCodes, ...contract.deltaCodes].map(sqlLiteral).join(",")})
       AND is_deleted = false;`,
    72,
    "migration_184_exact_72"
  );
  assertScalar(
    `SELECT count(*) FROM sys_permission
     WHERE tenant_id IN (
       ${sqlLiteral(ids.disabledTenant)}, ${sqlLiteral(ids.expiredTenant)},
       ${sqlLiteral(ids.statusDisabledTenant)}, ${sqlLiteral(ids.missingTenant)}
     )
       AND code IN (${[...contract.deltaCodes, "asset:party"].map(sqlLiteral).join(",")})
       AND is_deleted = false;`,
    0,
    "inactive_module_definitions"
  );
  assertScalar(
    `SELECT count(*) FROM sys_permission child
     JOIN sys_permission parent ON parent.id = child.parent_id
     WHERE child.tenant_id = ${sqlLiteral(ids.tenant)}
       AND child.code = 'asset:party'
       AND child.name = '业务相对方页面'
       AND child.resource = 'asset.party'
       AND child.action = 'page'
       AND child.frontend_route = '/assets/parties'
       AND child.visible = false
       AND child.keep_alive = false
       AND child.always_show = false
       AND parent.tenant_id = child.tenant_id
       AND parent.code = 'asset'
       AND child.is_deleted = false;`,
    1,
    "asset_party_parent_hidden"
  );
  assertScalar(
    `SELECT count(*) FROM rel_role_perm role_permission
     JOIN sys_permission permission
       ON permission.id = role_permission.permission_id
      AND permission.tenant_id = role_permission.tenant_id
     WHERE permission.code = 'asset:party'
       AND role_permission.is_deleted = false;`,
    0,
    "asset_party_zero_grants"
  );
  const actualDeltaGrants = query(`
    SELECT role.code, permission.code
    FROM rel_role_perm role_permission
    JOIN sys_role role
      ON role.id = role_permission.role_id
     AND role.tenant_id = role_permission.tenant_id
    JOIN sys_permission permission
      ON permission.id = role_permission.permission_id
     AND permission.tenant_id = role_permission.tenant_id
    WHERE role_permission.tenant_id = ${sqlLiteral(ids.tenant)}
      AND role_permission.remark = 'PR192 A-2.5 explicit property bundle grant'
      AND role_permission.is_deleted = false
    ORDER BY role.code, permission.code;
  `);
  const expectedDeltaGrants = [
    "FINANCE_MANAGER|housing:billing:read",
    "PROPERTY_MANAGER|homestay:stay:read",
    "PROPERTY_MANAGER|homestay:task:read"
  ].join("\n");
  if (actualDeltaGrants !== expectedDeltaGrants) {
    fail(
      `A-2.5 built-in grant exact set mismatch: ${
        actualDeltaGrants || "<empty>"
      }`
    );
  }
  pass("built_in_delta_grants_exact", {
    count: 3,
    grants: expectedDeltaGrants.split("\n")
  });

  const permissionSnapshot = query(`
    SELECT id, code, create_time::text, update_time::text
    FROM sys_permission
    WHERE tenant_id = ${sqlLiteral(ids.tenant)}
      AND remark IN (
        'PR192 A-2.5 property workbench read permission',
        'PR192 A-2.5 hidden Party workbench target'
      )
    ORDER BY code;
  `);
  const grantSnapshot = query(`
    SELECT role_id, permission_id, create_time::text, update_time::text
    FROM rel_role_perm
    WHERE tenant_id = ${sqlLiteral(ids.tenant)}
      AND remark = 'PR192 A-2.5 explicit property bundle grant'
      AND is_deleted = false
    ORDER BY park_id, role_id, permission_id;
  `);
  psql(migration184Sql);
  if (permissionSnapshot !== query(`
    SELECT id, code, create_time::text, update_time::text
    FROM sys_permission
    WHERE tenant_id = ${sqlLiteral(ids.tenant)}
      AND remark IN (
        'PR192 A-2.5 property workbench read permission',
        'PR192 A-2.5 hidden Party workbench target'
      )
    ORDER BY code;
  `)) fail("000184 permission timestamps changed on rerun");
  if (grantSnapshot !== query(`
    SELECT role_id, permission_id, create_time::text, update_time::text
    FROM rel_role_perm
    WHERE tenant_id = ${sqlLiteral(ids.tenant)}
      AND remark = 'PR192 A-2.5 explicit property bundle grant'
      AND is_deleted = false
    ORDER BY park_id, role_id, permission_id;
  `)) fail("000184 grant timestamps changed on rerun");
  pass("migration_184_rerun_timestamps", {
    definition_diff: 0,
    grant_diff: 0
  });

  const customCodes = query(`
    SELECT permission.code
    FROM rel_role_perm role_permission
    JOIN sys_role role ON role.id = role_permission.role_id
    JOIN sys_permission permission ON permission.id = role_permission.permission_id
    WHERE role_permission.tenant_id = ${sqlLiteral(ids.tenant)}
      AND role.code = 'CUSTOM_A25'
      AND role_permission.is_deleted = false
    ORDER BY permission.code;
  `);
  if (customCodes !== "*\nhomestay:booking:read\nhomestay:operations") {
    fail(`custom/legacy/wildcard grants changed: ${customCodes}`);
  }
  pass("custom_legacy_wildcard_unchanged");
  assertScalar(
    `SELECT count(*)
     FROM rel_role_perm role_permission
     JOIN sys_role role ON role.id = role_permission.role_id
     JOIN sys_permission permission ON permission.id = role_permission.permission_id
     WHERE role_permission.tenant_id = ${sqlLiteral(ids.tenant)}
       AND role_permission.remark = 'PR192 A-2.5 explicit property bundle grant'
       AND (
         role.tenant_id <> role_permission.tenant_id
         OR permission.tenant_id <> role_permission.tenant_id
         OR role.park_id <> role_permission.park_id
         OR (
           role.park_id = ${sqlLiteral(ids.homestayPark)}
           AND permission.code IN (${contract.housingCodes.map(sqlLiteral).join(",")})
         )
         OR (
           role.park_id = ${sqlLiteral(ids.housingPark)}
           AND permission.code IN (${contract.homestayCodes.map(sqlLiteral).join(",")})
         )
       );`,
    0,
    "cross_tenant_park_module_grants"
  );
  const seedPartySnapshot = query(`
    SELECT child.id, child.tenant_id, child.park_id, child.code, child.name,
           child.resource, child.action, child.frontend_route, child.sort_no,
           parent.id, parent.code, child.visible, child.keep_alive,
           child.always_show
    FROM sys_permission child
    JOIN sys_permission parent ON parent.id = child.parent_id
    WHERE child.tenant_id = '10000001'
      AND child.park_id = '20000001'
      AND child.code = 'asset:party'
      AND child.is_deleted = false;
  `);
  if (!seedPartySnapshot) {
    fail("000184 did not create asset:party in the fixed production seed scope");
  }
  assertScalar(
    `SELECT count(*) FROM rel_role_perm role_permission
     JOIN sys_permission permission
       ON permission.id = role_permission.permission_id
      AND permission.tenant_id = role_permission.tenant_id
     WHERE permission.tenant_id = '10000001'
       AND permission.code = 'asset:party'
       AND role_permission.is_deleted = false;`,
    0,
    "pre_seed_asset_party_zero_grants"
  );
  pass("pre_seed_asset_party_snapshot", {
    created_by: "000184",
    fixed_tenant: "10000001",
    fixed_park: "20000001",
    same_record_tracking: true
  });
  return seedPartySnapshot;
}

function verifyProductionSeedCompatibility(seedPartySnapshot) {
  psql(productionSeedSql);
  const first = query(`
    SELECT child.id, child.tenant_id, child.park_id, child.code, child.name,
           child.resource, child.action, child.frontend_route, child.sort_no,
           parent.id, parent.code, child.visible, child.keep_alive, child.always_show
    FROM sys_permission child
    JOIN sys_permission parent ON parent.id = child.parent_id
    WHERE child.tenant_id = '10000001'
      AND child.code = 'asset:party'
      AND child.is_deleted = false;
  `);
  if (first !== seedPartySnapshot) {
    fail("first production seed run changed the 000184-created asset:party row");
  }
  assertScalar(
    `SELECT count(*) FROM rel_role_perm role_permission
     JOIN sys_permission permission
       ON permission.id = role_permission.permission_id
      AND permission.tenant_id = role_permission.tenant_id
     WHERE permission.tenant_id = '10000001'
       AND permission.code = 'asset:party'
       AND role_permission.is_deleted = false;`,
    0,
    "production_seed_first_asset_party_zero_grants"
  );
  psql(productionSeedSql);
  const second = query(`
    SELECT child.id, child.tenant_id, child.park_id, child.code, child.name,
           child.resource, child.action, child.frontend_route, child.sort_no,
           parent.id, parent.code, child.visible, child.keep_alive, child.always_show
    FROM sys_permission child
    JOIN sys_permission parent ON parent.id = child.parent_id
    WHERE child.tenant_id = '10000001'
      AND child.code = 'asset:party'
      AND child.is_deleted = false;
  `);
  if (second !== seedPartySnapshot) {
    fail("second production seed run changed the 000184-created asset:party row");
  }
  assertScalar(
    `SELECT count(*) FROM rel_role_perm role_permission
     JOIN sys_permission permission
       ON permission.id = role_permission.permission_id
      AND permission.tenant_id = role_permission.tenant_id
     WHERE permission.tenant_id = '10000001'
       AND permission.code = 'asset:party'
       AND role_permission.is_deleted = false;`,
    0,
    "production_seed_asset_party_zero_grants"
  );
  pass("production_seed_rerun", {
    same_id_content_parent_hidden_diff: 0,
    active_rows: 1,
    grants: 0,
    update_time: "existing whole-seed refresh semantics excluded"
  });
}

function createContainer() {
  validateRunId(runId);
  assertNoDatabaseUrlOverrides(process.env);
  const existing = inspectContainer(containerName, { cwd: rootDir });
  if (existing) fail(`fixture container already exists: ${containerName}`);
  const created = docker(buildEphemeralPostgresRunArgs({
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    postgresUser,
    postgresPassword
  }));
  const inspected = inspectContainer(containerName, { cwd: rootDir });
  // Capture the exact just-created target before validating it so the finally
  // path can still remove it when validation itself fails.
  containerId = inspected?.Id ?? null;
  volumeName = (inspected?.Mounts ?? []).find(
    (mount) => mount.Destination === "/var/lib/postgresql/data"
  )?.Name ?? null;
  containerId = resolveCreatedContainerId(created.stdout, inspected, {
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE,
    requireLoopbackPort: true
  });
  const exact = assertExactEphemeralPostgresContainer(inspected, {
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE,
    requireLoopbackPort: true
  });
  volumeName = exact.volumeName;
  pass("ephemeral_target", {
    image: OFFICIAL_POSTGRES_IMAGE,
    auto_remove: true,
    explicit_database: databaseName,
    loopback_random_port: true,
    anonymous_volume: true,
    exact_labels: true
  });
}

function cleanup() {
  const errors = [];
  if (containerId) {
    const stop = docker(["stop", "--timeout", "5", containerId], {
      allowFailure: true
    });
    if (stop.status !== 0) errors.push((stop.stderr || stop.stdout).trim());
  }
  const containerAbsent = inspectContainer(containerName, { cwd: rootDir }) === null;
  let volumeAbsent = true;
  if (volumeName) {
    const volume = docker(["volume", "inspect", volumeName], {
      allowFailure: true
    });
    volumeAbsent = volume.status !== 0 && /No such volume/i.test(volume.stderr);
    if (!volumeAbsent) {
      const remove = docker(["volume", "rm", volumeName], { allowFailure: true });
      if (remove.status !== 0) errors.push((remove.stderr || remove.stdout).trim());
      const finalVolume = docker(["volume", "inspect", volumeName], {
        allowFailure: true
      });
      volumeAbsent =
        finalVolume.status !== 0 && /No such volume/i.test(finalVolume.stderr);
    }
  }
  cleanupResult = {
    container_absent: containerAbsent,
    anonymous_volume_absent: volumeAbsent,
    errors
  };
  if (!containerAbsent || !volumeAbsent || errors.length > 0) {
    throw new Error(`fixture cleanup failed: ${JSON.stringify(cleanupResult)}`);
  }
}

async function main() {
  const contract = validateStaticContract();
  createContainer();
  await waitForPostgres();
  applyBaselineMigrations();
  const seedPartySnapshot = insertFixture(contract);
  verifyProductionSeedCompatibility(seedPartySnapshot);
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
} finally {
  try {
    cleanup();
  } catch (cleanupError) {
    failure ??= cleanupError instanceof Error
      ? cleanupError
      : new Error(String(cleanupError));
  }
}

const evidence = {
  schema: evidenceSchema,
  run_id: runId,
  status: failure ? "failed" : "passed",
  checks,
  cleanup: cleanupResult,
  open_P0_P1: failure ? ["P1: reproducible RBAC fixture failed"] : []
};
process.stdout.write(`${JSON.stringify(evidence)}\n`);
if (failure) {
  process.stderr.write(`[A-2.5 RBAC] FAIL ${failure.message}\n`);
  process.exitCode = 1;
}
