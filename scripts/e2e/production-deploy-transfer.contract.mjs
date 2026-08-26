import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const manifestScript = resolve(root, "scripts/production-deploy-transfer-manifest.mjs");
const readManifest = (mode) => {
  const result = spawnSync(process.execPath, [manifestScript, mode], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? result.stdout.trim().split("\n") : [];
};

const expected = {
  "fast-css": ["file:.release.json", "file:apps/web/public/runtime-design-system.css"],
  web: ["file:.release.json", "dir:apps/web", "dir:packages/config", "dir:packages/shared", "dir:packages/ui"],
  api: ["file:.release.json", "dir:apps/api", "dir:packages/config", "dir:packages/shared"],
  database: [
    "file:.release.json", "dir:database", "file:scripts/bootstrap-admin.sh", "file:scripts/check-init-baseline.sh",
    "file:scripts/db-migrate.sh", "file:scripts/db-seed-prod.sh", "file:scripts/diagnose-000189-asset-scope.sh",
    "file:scripts/diagnose-000194-runtime-control.sh", "file:scripts/prod-deploy.sh",
    "file:scripts/repair-000194-retired-runtime-owner.sh",
  ],
};

for (const [mode, entries] of Object.entries(expected)) {
  const actual = readManifest(mode);
  assert.deepEqual(actual, entries, `${mode} transfer manifest drifted`);
  assert.equal(new Set(actual).size, actual.length, `${mode} transfer manifest has duplicates`);
  for (const entry of actual) {
    assert.match(entry, /^(file|dir):[A-Za-z0-9._/-]+$/);
    const [, path] = entry.split(":", 2);
    assert.ok(!path.startsWith("/") && !path.includes(".."), `${mode} contains an unsafe path`);
    assert.notEqual(path, ".", `${mode} must not widen to the repository root`);
    if (path !== ".release.json") assert.ok(existsSync(resolve(root, path)), `${path} must exist`);
  }
}

assert.deepEqual(readManifest("full"), [], "full transfer remains the workflow-owned full-tree sync");
const invalid = spawnSync(process.execPath, [manifestScript, "unknown"], { encoding: "utf8" });
assert.notEqual(invalid.status, 0);
assert.match(invalid.stderr, /Unsupported narrow transfer mode/);

console.log("Production deploy transfer contract passed.");
