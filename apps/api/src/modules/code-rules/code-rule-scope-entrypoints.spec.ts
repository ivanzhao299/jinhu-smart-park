import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("every tenant scope or module assignment entry point provisions code rules", () => {
  const source = readFileSync(resolve(__dirname, "../tenants/tenants.service.ts"), "utf8");
  const createBlock = source.slice(source.indexOf("async create("), source.indexOf("async provisionAdditionalPark("));
  const parkBlock = source.slice(source.indexOf("async provisionAdditionalPark("), source.indexOf("async update("));
  const loginBlock = source.slice(source.indexOf("async updateLoginSettings("), source.indexOf("async enable("));
  const assignBlock = source.slice(source.indexOf("async assignModules("), source.indexOf("private async getTenantById("));

  for (const block of [createBlock, parkBlock, loginBlock, assignBlock]) {
    assert.match(block, /ensureCodeRuleScopeProvisioned\(manager,/);
  }
  assert.ok(createBlock.indexOf("upsertTenantModules") < createBlock.indexOf("ensureCodeRuleScopeProvisioned"));
  assert.ok(parkBlock.indexOf("cloneTenantParkModules") < parkBlock.indexOf("ensureCodeRuleScopeProvisioned"));
  assert.ok(loginBlock.indexOf("upsertTenantModules") < loginBlock.indexOf("ensureCodeRuleScopeProvisioned"));
  assert.ok(assignBlock.indexOf("upsertTenantModules") < assignBlock.indexOf("ensureCodeRuleScopeProvisioned"));
});
