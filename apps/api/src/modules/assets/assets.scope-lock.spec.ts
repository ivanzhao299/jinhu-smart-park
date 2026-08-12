import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("every asset park mutation shares the scope transaction lock and active projections stay enabled", () => {
  const source = readFileSync(resolve(__dirname, "assets.service.ts"), "utf8");
  const helper = readFileSync(resolve(__dirname, "asset-scope-provisioning.ts"), "utf8");
  assert.match(source, /this\.dataSource\.transaction\(async \(manager\) =>/);
  assert.equal((source.match(/await lockAssetScope\(manager, scope\)/g) ?? []).length, 3);
  assert.match(source, /existingScopeRows > 0/);
  assert.match(source, /ensureAssetScopeProvisioned\(manager, scope, actorId\)/);
  assert.equal((source.match(/hasProtectedAssetScope\(manager, scope\)/g) ?? []).length, 2);
  assert.match(source, /Asset runtime history requires an enabled park projection/);
  assert.match(source, /assertCanonicalAssetParkInput\(dto, projection\)/);
  assert.match(source, /Asset park fields must match the canonical park/);
  assert.match(helper, /tenant-asset-park:\$\{scope\.tenantId\}:\$\{scope\.parkId\}/);
  assert.match(helper, /ensureTenantAssetRuntimeControls\(manager, scope\)/);
});
