import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const gate = read("scripts/e2e/property-api-e2e-gate.mjs");
const homestay = read("scripts/e2e/homestay-api-e2e.mjs");
const housing = read("scripts/e2e/housing-rental-api-e2e.mjs");
const safety = read("scripts/e2e/property-api-e2e-safety.mjs");
const packageJson = read("package.json");
const ci = read(".github/workflows/ci.yml");

for (const suite of [homestay, housing]) {
  assert.match(suite, /requirePropertyApiE2eIsolation\(\)/, "every mutating property E2E suite must enforce the shared isolation boundary");
}
assert.match(safety, /jinhu_\(\?:property_api_e2e_/, "gate must only allow disposable database names");
assert.match(safety, /loopback API/, "gate must reject shared UAT and production API URLs");
assert.match(safety, /TEST_RUN_ID is required/, "each suite must receive a gate-controlled run id");
assert.match(gate, /health/, "gate must check API health");
assert.match(gate, /ready/, "gate must check API readiness");
assert.match(packageJson, /test:e2e:property-api/, "package scripts must expose the aggregate property API E2E gate");
assert.match(ci, /Run property API E2E gate/, "release smoke must invoke the real property API E2E gate");
assert.match(ci, /Assert disposable property E2E cleanup/, "release smoke must assert cleanup after the disposable run");
for (const suite of [homestay, housing]) {
  assert.doesNotMatch(suite, /unit_id: candidate\.id/, "availability checks must use the current camelCase DTO contract");
  assert.match(suite, /unitId: candidate\.id/, "availability checks must send unitId");
  assert.match(suite, /version: currentOperation\.version/, "operation writes must use the current optimistic-concurrency version");
}

console.log("[PASS] property API E2E gate contract");
