import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const tenantsServicePath = resolve(__dirname, "../tenants/tenants.service.ts");
const productionSeedPath = resolve(__dirname, "../../../../../database/seeds/000001_s1_production_core.sql");
const backfillMigrationPath = resolve(__dirname, "../../../../../database/migrations/000160_epdr_scope_backfill.sql");

test("tenant provisioning derives engineering permissions from engineering module codes", () => {
  const source = readFileSync(tenantsServicePath, "utf8");

  assert.ok(source.includes('modules.has("engineering")'), "expected tenant provisioning to derive engineering module permissions");
  assert.ok(source.includes("isEngineeringPermission"), "expected engineering permission helper to exist");
  assert.ok(source.includes('code === "engineering"'), "expected helper to include engineering root menu permission");
  assert.ok(source.includes('code.startsWith("ENGINEERING_")'), "expected helper to include engineering API permissions");
});

test("production plan seeds include engineering module codes for EPDR-entitled plans", () => {
  const source = readFileSync(productionSeedPath, "utf8");

  assert.ok(source.includes("ARRAY['system','asset','workorder','safety','engineering','iot','energy','robot','video']"), "expected PROFESSIONAL plan to include engineering");
  assert.ok(source.includes("ARRAY['system','asset','workorder','safety','engineering','iot','energy','robot','video','bim','ai']"), "expected ENTERPRISE plan to include engineering");
  assert.ok(source.includes("ARRAY['system','asset','leasing','workorder','safety','engineering','iot','energy','robot','video','bim','ai']"), "expected GROUP plan to include engineering");
  assert.ok(source.includes('module:engineering'), "expected tenant admin permission seed to include module:engineering");
});

test("EPDR backfill migration repairs engineering module visibility for entitled scopes", () => {
  const sql = readFileSync(backfillMigrationPath, "utf8");

  for (const value of [
    "module_codes",
    "PROFESSIONAL",
    "ENTERPRISE",
    "GROUP",
    "sys_module_registry",
    "rel_tenant_module",
    "rel_role_perm",
    "EPDR engineering tenant-module backfill",
    "EPDR engineering role-permission backfill"
  ]) {
    assert.ok(sql.includes(value), `expected backfill migration to include ${value}`);
  }
});
