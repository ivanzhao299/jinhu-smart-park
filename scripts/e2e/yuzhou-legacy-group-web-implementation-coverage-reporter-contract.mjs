import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const reporter = resolve(root, "scripts/hr-cutover/report-legacy-group-web-implementation-coverage.mjs");

test("the coverage reporter forwards sealed Smart Park A/B evidence through the target technical UAT channel", () => {
  const source = readFileSync(reporter, "utf8");
  assert.match(source, /targetTechnicalUatEvidencePair:\s*\{/u);
  assert.doesNotMatch(source, /liveRoleUatEvidencePair:\s*\{/u);

  const output = execFileSync(process.execPath, [reporter], { cwd: root, encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.gates.productionImport, "HOLD");
  assert.equal(report.gates.targetTechnicalUatEvidence, null);
});
