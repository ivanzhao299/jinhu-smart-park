import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { describeYuzhouImportInterface } from "../hr-cutover/describe-yuzhou-import-interface.mjs";
import { buildYuzhouReusableIncrementalPackage } from "../hr-cutover/build-yuzhou-reusable-incremental-package.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = "scripts/hr-cutover/describe-yuzhou-import-interface.mjs";
const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });

test("published interface is reproducible and usable by the actual frozen builder", () => {
  const first = run([]), second = run([]);
  assert.equal(first.status, 0); assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stdout, readFileSync(join(root, "docs/hr/yuzhou-import-interface.v1.json"), "utf8"));
  const d = JSON.parse(first.stdout);
  const result = buildYuzhouReusableIncrementalPackage({ recipeVersion:d.recipeVersion, recipeSha256:d.recipeSha256, sourceSystem:d.sourceSystem, extractedAt:"2026-10-05T00:00:00Z", employeeIndex:[], employeeRecords:[], records:[] });
  assert.equal(result.manifest.itemCount, 0); assert.equal(result.packageDtos.length, 0);
  assert.deepEqual(d.coverage.supported.map(x => x.domain).sort(), ["contract","credential","employee","family","organization","position","profile","skill","training_history"]);
  assert.equal(d.limits.maxItems, 2000); assert.equal(d.limits.maxPackageBytes, 8388608);
  assert.equal(d.productionWrites, false);
});

test("stale interface and invalid CLI arguments fail without echoing input or paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "yuzhou-interface-"));
  try {
    const path = join(dir, "private-marker.json");
    const d = describeYuzhouImportInterface(); d.recipeSha256 = "0".repeat(64);
    writeFileSync(path, JSON.stringify(d), { mode:0o600 });
    for (const args of [["--check", path], ["--check", join(dir,"missing")], ["private-input-marker"]]) {
      const result = run(args); assert.equal(result.status, 1); assert.equal(result.stdout, "");
      assert.equal(result.stderr, "YUZHOU_IMPORT_INTERFACE_CHECK_FAILED\n");
    }
    const good = run(["--check", "docs/hr/yuzhou-import-interface.v1.json"]);
    assert.equal(good.status, 0); assert.equal(good.stdout, "YUZHOU_IMPORT_INTERFACE_CURRENT\n");
  } finally { rmSync(dir, { recursive:true, force:true }); }
});
