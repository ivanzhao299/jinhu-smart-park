import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  __dirname,
  "../../../../../database/migrations/000182_property_business_menu_access.sql"
);
const productionSeedPath = resolve(
  __dirname,
  "../../../../../database/seeds/000001_s1_production_core.sql"
);
const usersServicePath = resolve(__dirname, "../users/users.service.ts");

test("property business menu migration adds menu/page nodes without changing API grants", () => {
  const sql = readFileSync(migrationPath, "utf8");

  for (const value of [
    "'homestay', 'homestay', '民宿管理'",
    "'housing_rental', 'housing_rental', '住房出租'",
    "'homestay:operations', '民宿运营'",
    "'housing_rental:operations', '住房运营'",
    "'/homestay'",
    "'/housing'",
    "permission_type = 'menu'",
    "perm_type = 10",
    "permission_type = 'page'",
    "perm_type = 20",
    "FROM rel_tenant_module assignment",
    "JOIN sys_module module",
    "assignment.enabled = true",
    "assignment.status = 'enabled'",
    "assignment.expire_time IS NULL OR assignment.expire_time > now()",
    "module.status = 1",
    "api_permission.perm_type = 40",
    "INSERT INTO rel_role_perm",
    "existing.permission_id = resolved.permission_id"
  ]) {
    assert.ok(sql.includes(value), `expected migration to include ${value}`);
  }

  assert.doesNotMatch(sql, /INSERT INTO sys_module\s*\(/);
  assert.doesNotMatch(sql, /INSERT INTO rel_tenant_module\s*\(/);
  assert.doesNotMatch(sql, /sys_module_registry/);
  assert.equal(sql.includes("SET perm_type = 40"), false);
});

test("production seed preserves property business menu parent links after migration", () => {
  const sql = readFileSync(productionSeedPath, "utf8");

  assert.ok(
    sql.includes("'homestay', 'housing_rental'"),
    "expected production seed to recognize both property business menu roots"
  );
  assert.ok(
    sql.includes("WHEN child.code = 'homestay:operations' THEN 'homestay'"),
    "expected production seed to preserve the homestay operations parent"
  );
  assert.ok(
    sql.includes("WHEN child.code = 'housing_rental:operations' THEN 'housing_rental'"),
    "expected production seed to preserve the housing operations parent"
  );
});

test("user menu projection recognizes property business modules and real routes", () => {
  const source = readFileSync(usersServicePath, "utf8");

  for (const value of [
    'frontendRoute?.startsWith("/homestay")',
    'return "homestay"',
    'frontendRoute?.startsWith("/housing")',
    'return "housing_rental"',
    'label: "民宿管理"',
    'href: "/homestay"',
    'permission: "homestay:operations"',
    'label: "住房出租"',
    'href: "/housing"',
    'permission: "housing_rental:operations"'
  ]) {
    assert.ok(source.includes(value), `expected users menu projection to include ${value}`);
  }
});
