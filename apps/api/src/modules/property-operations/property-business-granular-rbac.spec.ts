import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import test from "node:test";
import {
  ASSET_PARTY_WORKBENCH_SURFACE,
  PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS,
  PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS,
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_BUSINESS_SURFACES,
  PROPERTY_PERMISSION_BUNDLES,
  SYSTEM_PERMISSIONS
} from "@jinhu/shared";

const baseMigrationPath = resolve(
  __dirname,
  "../../../../../database/migrations/000183_property_business_granular_rbac.sql"
);
const extensionMigrationPath = resolve(
  __dirname,
  "../../../../../database/migrations/000184_property_workbench_read_permissions.sql"
);
const migrationsDir = resolve(__dirname, "../../../../../database/migrations");
const baseSql = readFileSync(baseMigrationPath, "utf8");
const extensionSql = readFileSync(extensionMigrationPath, "utf8");
const sql = `${baseSql}\n${extensionSql}`;

function markedRows(source: string, start: string, end: string): string[][] {
  const block = source.match(new RegExp(`${start}([\\s\\S]*?)${end}`))?.[1];
  assert.ok(block, `missing SQL marker block ${start}`);
  return [...block.matchAll(/^\s*\((.+)\),?\s*$/gm)].map((match) =>
    [...match[1]!.matchAll(/'(?:''|[^'])*'|NULL|true|false|-?\d+/g)].map((token) => {
      const value = token[0]!;
      return value.startsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : value;
    })
  );
}

function cell(row: string[], index: number): string {
  const value = row[index];
  assert.notEqual(value, undefined, `missing SQL tuple column ${index}`);
  return value!;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

test("000184 is the next reservation and only historical 000136 is duplicated", () => {
  const filenames = readdirSync(migrationsDir).filter((name) => /^\d{6}_.+\.sql$/.test(name));
  const byNumber = new Map<string, string[]>();
  for (const filename of filenames) {
    const number = filename.slice(0, 6);
    byNumber.set(number, [...(byNumber.get(number) ?? []), filename]);
  }
  const duplicates = [...byNumber.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([number]) => number);
  assert.deepEqual(duplicates, ["000136"]);
  assert.equal(basename(baseMigrationPath), "000183_property_business_granular_rbac.sql");
  assert.equal(
    basename(extensionMigrationPath),
    "000184_property_workbench_read_permissions.sql"
  );
  assert.equal(sorted([...byNumber.keys()]).at(-1), "000184");
});

test("historical 65 plus the exact 7 read permissions equal the 72 shared values", () => {
  const baseDefinitionRows = markedRows(
    baseSql,
    "PROPERTY_PERMISSION_DEFINITIONS_START",
    "PROPERTY_PERMISSION_DEFINITIONS_END"
  );
  const extensionDefinitionRows = markedRows(
    extensionSql,
    "PROPERTY_WORKBENCH_READ_DEFINITIONS_START",
    "PROPERTY_WORKBENCH_READ_DEFINITIONS_END"
  );
  const baseCodes = baseDefinitionRows.map((row) => cell(row, 1));
  const extensionCodes = extensionDefinitionRows.map((row) => cell(row, 1));
  const expectedExtensionCodes = [
    PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASK_READ,
    PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_READ,
    PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASK_READ,
    PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_READ,
    PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_READ,
    PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_READ,
    PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_READ
  ];

  assert.equal(baseDefinitionRows.length, 65);
  assert.equal(new Set(baseCodes).size, 65);
  assert.equal(extensionDefinitionRows.length, 7);
  assert.equal(new Set(extensionCodes).size, 7);
  assert.deepEqual(sorted(extensionCodes), sorted(expectedExtensionCodes));
  assert.equal(baseCodes.some((code) => extensionCodes.includes(code)), false);
  assert.deepEqual(
    sorted([...baseCodes, ...extensionCodes]),
    sorted(Object.values(PROPERTY_BUSINESS_PERMISSIONS))
  );
});

test("17 canonical page definitions preserve parent, route and landing sort order", () => {
  const definitionRows = markedRows(
    baseSql,
    "PROPERTY_PERMISSION_DEFINITIONS_START",
    "PROPERTY_PERMISSION_DEFINITIONS_END"
  );
  const byCode = new Map(definitionRows.map((row) => [cell(row, 1), row] as const));
  const expectedCodes = PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS.map((seed) => seed.code);
  const pages = definitionRows.filter((row) => cell(row, 7) === "20" && cell(row, 12) === "true");

  assert.equal(pages.length, 17);
  assert.deepEqual(sorted(pages.map((row) => cell(row, 1))), sorted(expectedCodes));

  for (const surface of PROPERTY_BUSINESS_SURFACES) {
    const row = byCode.get(surface.pageCode);
    assert.ok(row, `missing page definition ${surface.pageCode}`);
    assert.equal(cell(row, 0), surface.moduleCode);
    assert.equal(cell(row, 3), surface.menuCode);
    assert.equal(cell(row, 10), surface.route);
  }

  assert.deepEqual(
    PROPERTY_BUSINESS_SURFACES
      .filter((surface) => surface.moduleCode === "homestay")
      .map((surface) => Number(byCode.get(surface.pageCode)?.[11])),
    [691, 692, 693, 694, 695, 696, 697, 698]
  );
  assert.deepEqual(
    PROPERTY_BUSINESS_SURFACES
      .filter((surface) => surface.moduleCode === "housing_rental")
      .map((surface) => Number(byCode.get(surface.pageCode)?.[11])),
    [701, 702, 703, 704, 705, 706, 707, 708, 709]
  );
});

test("legacy operations remain hidden compatibility pages and grant no bundle capability", () => {
  const definitionRows = markedRows(
    baseSql,
    "PROPERTY_PERMISSION_DEFINITIONS_START",
    "PROPERTY_PERMISSION_DEFINITIONS_END"
  );
  const byCode = new Map(definitionRows.map((row) => [row[1], row]));
  const bundleRows = markedRows(
    baseSql,
    "PROPERTY_BUNDLE_PERMISSIONS_START",
    "PROPERTY_BUNDLE_PERMISSIONS_END"
  );

  for (const legacyCode of PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS) {
    const row = byCode.get(legacyCode);
    assert.ok(row, `missing legacy definition ${legacyCode}`);
    assert.equal(cell(row, 7), "20");
    assert.equal(cell(row, 12), "false");
    assert.equal(cell(row, 13), "false");
    assert.equal(cell(row, 14), "false");
    assert.equal(bundleRows.some((bundleRow) => cell(bundleRow, 1) === legacyCode), false);
  }
});

test("14 literal SQL bundles exactly equal the shared bundle contract", () => {
  const migrationPairs = [
    ...markedRows(
      baseSql,
      "PROPERTY_BUNDLE_PERMISSIONS_START",
      "PROPERTY_BUNDLE_PERMISSIONS_END"
    ),
    ...markedRows(
      extensionSql,
      "PROPERTY_WORKBENCH_READ_BUNDLE_PERMISSIONS_START",
      "PROPERTY_WORKBENCH_READ_BUNDLE_PERMISSIONS_END"
    )
  ].map((row) => `${cell(row, 0)}\u0000${cell(row, 1)}`);
  const sharedPairs = Object.values(PROPERTY_PERMISSION_BUNDLES).flatMap((bundle) =>
    bundle.permissions.map((permission) => `${bundle.code}\u0000${permission}`)
  );

  assert.equal(new Set(Object.values(PROPERTY_PERMISSION_BUNDLES).map((bundle) => bundle.code)).size, 14);
  assert.equal(new Set(migrationPairs).size, migrationPairs.length);
  assert.deepEqual(sorted(migrationPairs), sorted(sharedPairs));
});

test("A-2.5 read definitions preserve exact module, method, API and frontend routes", () => {
  const rows = markedRows(
    extensionSql,
    "PROPERTY_WORKBENCH_READ_DEFINITIONS_START",
    "PROPERTY_WORKBENCH_READ_DEFINITIONS_END"
  );
  const expected = new Map([
    ["homestay:task:read", ["homestay", "biz.homestay_task", "/api/v1/homestay/tasks", "/homestay/tasks"]],
    ["homestay:stay:read", ["homestay", "biz.homestay_stay", "/api/v1/homestay/stays", "/homestay/stays"]],
    ["housing:task:read", ["housing_rental", "biz.housing_task", "/api/v1/housing/tasks", "/housing/tasks"]],
    ["housing:tenant:read", ["housing_rental", "biz.party", "/api/v1/housing/tenants", "/housing/tenants"]],
    ["housing:handover:read", ["housing_rental", "biz.housing_handover", "/api/v1/housing/handovers", "/housing/handovers"]],
    ["housing:billing:read", ["housing_rental", "biz.housing_billing", "/api/v1/housing/billing", "/housing/billing"]],
    ["housing:repair:read", ["housing_rental", "biz.housing_repair", "/api/v1/housing/repairs", "/housing/repairs"]]
  ]);

  for (const row of rows) {
    const contract = expected.get(cell(row, 1));
    assert.ok(contract, `unexpected A-2.5 permission ${cell(row, 1)}`);
    assert.equal(cell(row, 0), contract[0]);
    assert.equal(cell(row, 3), contract[1]);
    assert.equal(cell(row, 6), "40");
    assert.equal(cell(row, 7), "GET");
    assert.equal(cell(row, 8), contract[2]);
    assert.equal(cell(row, 9), contract[3]);
  }
});

test("asset Party target is parent-guarded, hidden and outside property bundles and grants", () => {
  const rows = markedRows(
    extensionSql,
    "ASSET_PARTY_PAGE_DEFINITION_START",
    "ASSET_PARTY_PAGE_DEFINITION_END"
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], [
    SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE,
    "业务相对方页面",
    "asset.party",
    "page",
    "page",
    "20",
    ASSET_PARTY_WORKBENCH_SURFACE.route,
    "65",
    "false",
    "false",
    "false"
  ]);
  assert.equal(
    Object.values(PROPERTY_BUSINESS_PERMISSIONS).includes(
      SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE as never
    ),
    false
  );
  assert.equal(
    Object.values(PROPERTY_PERMISSION_BUNDLES).some((bundle) =>
      bundle.permissions.includes(SYSTEM_PERMISSIONS.ASSET_PARTY_PAGE as never)
    ),
    false
  );

  const grantSection = extensionSql.slice(
    extensionSql.indexOf("-- Only the new read members")
  );
  assert.doesNotMatch(grantSection, /asset:party/);
  assert.match(extensionSql, /module\.module_code = 'asset'/);
  assert.match(
    extensionSql,
    /JOIN sys_permission parent[\s\S]*parent\.tenant_id = active\.tenant_id[\s\S]*parent\.code = 'asset'[\s\S]*parent\.is_deleted = false[\s\S]*parent\.is_enabled = true[\s\S]*parent\.status = 'enabled'/
  );
});

test("built-in role grants are explicit, narrow and park-module scoped", () => {
  const roleRows = markedRows(
    baseSql,
    "PROPERTY_ROLE_BUNDLES_START",
    "PROPERTY_ROLE_BUNDLES_END"
  );
  const expectedRoleBundles: Record<string, Record<string, string[]>> = {
    SUPER_ADMIN: {
      homestay: [
        "property-bundle:homestay-overview",
        "property-bundle:homestay-rates",
        "property-bundle:homestay-bookings",
        "property-bundle:homestay-stays",
        "property-bundle:homestay-turnovers",
        "property-bundle:homestay-finance"
      ],
      housing_rental: [
        "property-bundle:housing-overview",
        "property-bundle:housing-tenants",
        "property-bundle:housing-leases",
        "property-bundle:housing-handovers",
        "property-bundle:housing-billing",
        "property-bundle:housing-finance",
        "property-bundle:housing-repairs",
        "property-bundle:housing-purchases"
      ]
    },
    OPERATIONS_OWNER: {
      homestay: [
        "property-bundle:homestay-overview",
        "property-bundle:homestay-rates",
        "property-bundle:homestay-bookings",
        "property-bundle:homestay-stays",
        "property-bundle:homestay-turnovers",
        "property-bundle:homestay-finance"
      ],
      housing_rental: [
        "property-bundle:housing-overview",
        "property-bundle:housing-tenants",
        "property-bundle:housing-leases",
        "property-bundle:housing-handovers",
        "property-bundle:housing-billing",
        "property-bundle:housing-finance",
        "property-bundle:housing-repairs",
        "property-bundle:housing-purchases"
      ]
    },
    PROPERTY_MANAGER: {
      homestay: [
        "property-bundle:homestay-overview",
        "property-bundle:homestay-rates",
        "property-bundle:homestay-bookings",
        "property-bundle:homestay-stays",
        "property-bundle:homestay-turnovers"
      ],
      housing_rental: [
        "property-bundle:housing-overview",
        "property-bundle:housing-tenants",
        "property-bundle:housing-leases",
        "property-bundle:housing-handovers",
        "property-bundle:housing-billing",
        "property-bundle:housing-repairs"
      ]
    },
    PROPERTY_STAFF: {
      homestay: [
        "property-bundle:homestay-overview",
        "property-bundle:homestay-bookings",
        "property-bundle:homestay-stays",
        "property-bundle:homestay-turnovers"
      ],
      housing_rental: [
        "property-bundle:housing-overview",
        "property-bundle:housing-tenants",
        "property-bundle:housing-handovers",
        "property-bundle:housing-repairs"
      ]
    },
    FINANCE_MANAGER: {
      homestay: ["property-bundle:homestay-finance"],
      housing_rental: [
        "property-bundle:housing-billing",
        "property-bundle:housing-finance",
        "property-bundle:housing-purchases"
      ]
    },
    AUDITOR: {
      homestay: ["property-bundle:homestay-overview"],
      housing_rental: ["property-bundle:housing-overview"]
    }
  };
  const allowedRoles = new Set([
    "SUPER_ADMIN",
    "OPERATIONS_OWNER",
    "PROPERTY_MANAGER",
    "PROPERTY_STAFF",
    "FINANCE_MANAGER",
    "AUDITOR"
  ]);
  const knownBundles = new Set<string>(
    Object.values(PROPERTY_PERMISSION_BUNDLES).map((bundle) => bundle.code)
  );

  assert.equal(new Set(roleRows.map((row) => row.join("\u0000"))).size, roleRows.length);
  for (const row of roleRows) {
    const roleCode = cell(row, 0);
    const moduleCode = cell(row, 1);
    const bundleCode = cell(row, 2);
    assert.equal(allowedRoles.has(roleCode), true);
    assert.equal(["homestay", "housing_rental"].includes(moduleCode), true);
    assert.equal(knownBundles.has(bundleCode), true);
  }
  const actualRoleBundles = roleRows.map((row) => row.join("\u0000"));
  const expectedRoleBundleRows = Object.entries(expectedRoleBundles).flatMap(
    ([roleCode, modules]) =>
      Object.entries(modules).flatMap(([moduleCode, bundles]) =>
        bundles.map((bundleCode) => [roleCode, moduleCode, bundleCode].join("\u0000"))
      )
  );
  assert.deepEqual(sorted(actualRoleBundles), sorted(expectedRoleBundleRows));

  assert.match(
    sql,
    /active\.tenant_id = role\.tenant_id[\s\S]*active\.park_id = role\.park_id[\s\S]*active\.module_code = role_bundle\.module_code/
  );
  assert.doesNotMatch(sql, /\bLIKE\b/i);
  assert.doesNotMatch(sql, /sys_module_registry/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:sys_module|rel_tenant_module)\b/i);
  assert.doesNotMatch(sql, /permission\.code\s*=\s*'\*'/i);
});

test("A-2.5 grants only existing built-in role and bundle intersections", () => {
  const baseRoleRows = markedRows(
    baseSql,
    "PROPERTY_ROLE_BUNDLES_START",
    "PROPERTY_ROLE_BUNDLES_END"
  );
  const extensionBundleRows = markedRows(
    extensionSql,
    "PROPERTY_WORKBENCH_READ_BUNDLE_PERMISSIONS_START",
    "PROPERTY_WORKBENCH_READ_BUNDLE_PERMISSIONS_END"
  );
  const extensionRoleRows = markedRows(
    extensionSql,
    "PROPERTY_WORKBENCH_READ_ROLE_BUNDLES_START",
    "PROPERTY_WORKBENCH_READ_ROLE_BUNDLES_END"
  );
  const extensionBundles = new Set(extensionBundleRows.map((row) => cell(row, 0)));
  const expectedRoleRows = baseRoleRows.filter((row) => extensionBundles.has(cell(row, 2)));

  assert.equal(new Set(extensionRoleRows.map((row) => row.join("\u0000"))).size, extensionRoleRows.length);
  assert.deepEqual(
    sorted(extensionRoleRows.map((row) => row.join("\u0000"))),
    sorted(expectedRoleRows.map((row) => row.join("\u0000")))
  );
});

test("module authority, deterministic definitions and rerun stability are explicit", () => {
  for (const source of [baseSql, extensionSql]) {
    for (const predicate of [
      "assignment.enabled = true",
      "assignment.status = 'enabled'",
      "assignment.is_deleted = false",
      "assignment.expire_time IS NULL OR assignment.expire_time > now()",
      "module.status = 1",
      "module.is_deleted = false"
    ]) {
      assert.ok(source.includes(predicate), `missing module predicate ${predicate}`);
    }
  }

  assert.match(
    extensionSql,
    /DISTINCT ON \(active\.tenant_id, definition\.code\)[\s\S]*ORDER BY active\.tenant_id, definition\.code, active\.park_id/
  );
  assert.match(
    extensionSql,
    /ON CONFLICT \(tenant_id, code\) WHERE is_deleted = false DO UPDATE[\s\S]*IS DISTINCT FROM ROW/
  );
  assert.match(
    extensionSql,
    /ON CONFLICT \(tenant_id, park_id, role_id, permission_id\)[\s\S]*DO NOTHING/
  );
});
