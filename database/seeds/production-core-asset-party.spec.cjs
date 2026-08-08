const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const productionSeedPath = resolve(
  __dirname,
  "000001_s1_production_core.sql"
);
const sql = readFileSync(productionSeedPath, "utf8");

test("production seed preserves the hidden asset Party page definition", () => {
  for (const value of [
    "('asset:party', '业务相对方页面', 'asset', 'asset.party', 'page', 'page', 20, 65)",
    "WHEN 'asset:party' THEN '/assets/parties'",
    "permission_tree.code <> 'asset:party'",
    "permission_tree.code NOT IN ('system:dict-item', 'asset:party')",
    "visible = EXCLUDED.visible",
    "'asset:statistics-page', 'asset:party') THEN 'asset'"
  ]) {
    assert.ok(sql.includes(value), `expected production seed to include ${value}`);
  }
});

test("production seed does not grant the asset Party page to built-in roles", () => {
  assert.doesNotMatch(
    sql,
    /\('[A-Z][A-Z_]+', 'asset:party'\)/,
    "asset Party must remain outside explicit built-in role grants"
  );

  const rolePermissions = sql.slice(sql.indexOf("role_permissions AS ("));
  assert.match(
    rolePermissions,
    /WHERE role\.code = 'SUPER_ADMIN'[\s\S]*?AND permission\.code <> 'asset:party'[\s\S]*?UNION ALL/
  );
  assert.match(
    rolePermissions,
    /WHERE role\.code = 'SYSTEM_ADMIN'[\s\S]*?AND permission\.code <> 'asset:party'[\s\S]*?AND \(/
  );
});
