import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parseCoreTechnicalUatArgs } from "../hr-cutover/run-core-t0-t3-technical-uat.mjs";

const root = resolve(import.meta.dirname, "../..");

test("core technical UAT accepts one pnpm delimiter and rejects malformed arguments", () => {
  assert.equal(parseCoreTechnicalUatArgs(["--", "--config", "/tmp/core-uat.json"]).configPath, "/tmp/core-uat.json");
  for (const args of [[], ["--config"], ["--", "--", "--config", "/tmp/core-uat.json"], ["--other", "/tmp/core-uat.json"]]) {
    assert.throws(() => parseCoreTechnicalUatArgs(args), /CORE_TECHNICAL_UAT_ARGUMENT_INVALID/u);
  }
});

test("core technical UAT is bound to rollback_ready and cannot promote a full manifest", () => {
  const runner = readFileSync(resolve(root, "scripts/hr-cutover/run-core-t0-t3-technical-uat.mjs"), "utf8");
  assert.match(runner, /lifecycle\.state !== "rollback_ready"/u);
  assert.match(runner, /requiredState: "rollback_ready", finalizeManifest: false/u);
  assert.match(runner, /productionImport: "HOLD"/u);
  assert.match(runner, /safeDatabaseDiagnostic/u);
  const sharedRunner = readFileSync(resolve(root, "scripts/hr-cutover/run-full-domain-technical-uat.mjs"), "utf8");
  assert.match(sharedRunner, /requiredState="uat_ready",finalizeManifest=true/u);
  assert.match(sharedRunner, /if\(finalizeManifest\)/u);
  assert.match(sharedRunner, /VERBOSITY=verbose/u);
  assert.match(sharedRunner, /safeDatabaseDiagnostic/u);
  assert.match(sharedRunner, /constraint "\(\[A-Za-z0-9_\]\+\)"/u);
  assert.match(sharedRunner, /TECHNICAL_UAT_DATABASE_FAILED/u);
  assert.match(sharedRunner, /operation_\$\{operation\}_sqlstate_\$\{sqlState\}/u);
});
