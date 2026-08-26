import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const gate = resolve(import.meta.dirname, "../assert-verified-production-deploy-scope.mjs");
const run = (verified, resolved) => spawnSync(process.execPath, [gate, `--verified=${verified}`, `--resolved=${resolved}`], { encoding: "utf8" });

for (const mode of ["fast-css", "web", "api", "database", "full", "ops-only"]) {
  assert.equal(run(mode, mode).status, 0, `${mode} must cover itself`);
  assert.equal(run("full", mode).status, 0, `full must cover ${mode}`);
}
for (const [verified, resolved] of [["web", "full"], ["api", "database"], ["fast-css", "web"], ["ops-only", "full"]]) {
  const result = run(verified, resolved);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not cover authoritative production scope/);
}
assert.notEqual(run("unknown", "full").status, 0);
assert.notEqual(run("full", "unknown").status, 0);

console.log("Production deploy verified-scope contract passed.");
