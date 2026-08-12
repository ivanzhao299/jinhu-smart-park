import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("asset park creation shares the scope transaction lock and enforces one non-deleted projection", () => {
  const source = readFileSync(resolve(__dirname, "assets.service.ts"), "utf8");
  const helper = readFileSync(resolve(__dirname, "asset-scope-provisioning.ts"), "utf8");
  assert.match(source, /this\.dataSource\.transaction\(async \(manager\) =>/);
  assert.match(source, /await lockAssetScope\(manager, scope\)/);
  assert.match(source, /existingScopeRows > 0/);
  assert.match(helper, /tenant-asset-park:\$\{scope\.tenantId\}:\$\{scope\.parkId\}/);
});
