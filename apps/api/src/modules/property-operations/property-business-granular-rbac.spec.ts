import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import test from "node:test";
import {
  PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS,
  PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS,
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_BUSINESS_SURFACES,
  PROPERTY_PERMISSION_BUNDLES
} from "@jinhu/shared";

const migrationPath = resolve(
  __dirname,
  "../../../../../database/migrations/000183_property_business_granular_rbac.sql"
);
const migrationsDir = resolve(__dirname, "../../../../../database/migrations");
const sql = readFileSync(migrationPath, "utf8");

function markedRows(start: string, end: string): string[][] {
  const block = sql.match(new RegExp(`${start}([\\s\\S]*?)${end}`))?.[1];
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

test("migration number is the next reservation and only historical 000136 is duplicated", () => {
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
  assert.equal(basename(migrationPath), "000183_property_business_granular_rbac.sql");
  assert.equal(sorted([...byNumber.keys()]).at(-1), "000183");
});

test("migration permission definitions exactly equal the 65 shared permission values", () => {
  const definitionRows = markedRows(
    "PROPERTY_PERMISSION_DEFINITIONS_START",
    "PROPERTY_PERMISSION_DEFINITIONS_END"
  );
  const migrationCodes = definitionRows.map((row) => cell(row, 1));
  assert.equal(definitionRows.length, 65);
  assert.equal(new Set(migrationCodes).size, 65);
  assert.deepEqual(sorted(migrationCodes), sorted(Object.values(PROPERTY_BUSINESS_PERMISSIONS)));
});

test("17 canonical page definitions preserve parent, route and landing sort order", () => {
  const definitionRows = markedRows(
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
    "PROPERTY_PERMISSION_DEFINITIONS_START",
    "PROPERTY_PERMISSION_DEFINITIONS_END"
  );
  const byCode = new Map(definitionRows.map((row) => [row[1], row]));
  const bundleRows = markedRows(
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
  const migrationPairs = markedRows(
    "PROPERTY_BUNDLE_PERMISSIONS_START",
    "PROPERTY_BUNDLE_PERMISSIONS_END"
  ).map((row) => `${cell(row, 0)}\u0000${cell(row, 1)}`);
  const sharedPairs = Object.values(PROPERTY_PERMISSION_BUNDLES).flatMap((bundle) =>
    bundle.permissions.map((permission) => `${bundle.code}\u0000${permission}`)
  );

  assert.equal(new Set(Object.values(PROPERTY_PERMISSION_BUNDLES).map((bundle) => bundle.code)).size, 14);
  assert.equal(new Set(migrationPairs).size, migrationPairs.length);
  assert.deepEqual(sorted(migrationPairs), sorted(sharedPairs));
});

test("built-in role grants are explicit, narrow and park-module scoped", () => {
  const roleRows = markedRows(
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

test("module authority, deterministic definitions and rerun stability are explicit", () => {
  for (const predicate of [
    "assignment.enabled = true",
    "assignment.status = 'enabled'",
    "assignment.is_deleted = false",
    "assignment.expire_time IS NULL OR assignment.expire_time > now()",
    "module.status = 1",
    "module.is_deleted = false"
  ]) {
    assert.ok(sql.includes(predicate), `missing module predicate ${predicate}`);
  }

  assert.match(
    sql,
    /DISTINCT ON \(active\.tenant_id, definition\.code\)[\s\S]*ORDER BY active\.tenant_id, definition\.code, active\.park_id/
  );
  assert.match(
    sql,
    /ON CONFLICT \(tenant_id, code\) WHERE is_deleted = false DO UPDATE[\s\S]*IS DISTINCT FROM ROW/
  );
  assert.match(
    sql,
    /ON CONFLICT \(tenant_id, park_id, role_id, permission_id\)[\s\S]*DO NOTHING/
  );
});
