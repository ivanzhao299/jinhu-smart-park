import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("canonical park mutations share the asset scope lock and preserve protected sources", () => {
  const source = readFileSync(resolve(__dirname, "parks.service.ts"), "utf8");
  assert.equal((source.match(/this\.dataSource\.transaction\(async \(manager\) =>/g) ?? []).length, 3);
  assert.equal((source.match(/await lockAssetScope\(manager, scope\)/g) ?? []).length, 3);
  assert.match(source, /hasProtectedAssetScope\(manager, scope\)/);
  assert.match(source, /Asset scope requires one active canonical park/);
  assert.match(source, /ensureAssetScopeProvisioned\(manager, scope, actor\.sub\)/);
  assert.match(source, /lockAssetScope\(manager, DEFAULT_PLATFORM_SCOPE\)/);
  assert.match(source, /ensureAssetScopeProvisioned\(manager, DEFAULT_PLATFORM_SCOPE, actor\.sub\)/);
});
