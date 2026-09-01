import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildCoreTechnicalUatReceipt, parseCoreTechnicalUatArgs } from "../hr-cutover/run-core-t0-t3-technical-uat.mjs";
import { technicalUatChildEnvironment } from "../hr-cutover/run-full-domain-technical-uat.mjs";

const root = resolve(import.meta.dirname, "../..");

test("core technical UAT accepts one pnpm delimiter and rejects malformed arguments", () => {
  assert.equal(parseCoreTechnicalUatArgs(["--", "--config", "/tmp/core-uat.json"]).configPath, "/tmp/core-uat.json");
  for (const args of [[], ["--config"], ["--", "--", "--config", "/tmp/core-uat.json"], ["--other", "/tmp/core-uat.json"]]) {
    assert.throws(() => parseCoreTechnicalUatArgs(args), /CORE_TECHNICAL_UAT_ARGUMENT_INVALID/u);
  }
});

test("technical UAT child processes do not inherit migration environment", () => {
  const previous = process.env.YUZHOU_ETL_CREDENTIAL_FILE;
  process.env.YUZHOU_ETL_CREDENTIAL_FILE = "/private/etl.env";
  try {
    const environment = technicalUatChildEnvironment({ NODE_ENV: "test", APP_PORT: "36481" });
    assert.equal(environment.YUZHOU_ETL_CREDENTIAL_FILE, undefined);
    assert.equal(environment.NODE_ENV, "test");
    assert.equal(environment.APP_PORT, "36481");
    assert.ok(environment.PATH);
  } finally {
    if (previous === undefined) delete process.env.YUZHOU_ETL_CREDENTIAL_FILE;
    else process.env.YUZHOU_ETL_CREDENTIAL_FILE = previous;
  }
});

test("core technical UAT receipt preserves only tokenized failure diagnostics", () => {
  const error = new Error("YUZHOU_UAT_BROWSER_RUNTIME_SURFACE: 35:department_manager:phone_390:path=/hr/employees:runtimeErrors=1:runtimeKinds=Runtime.exceptionThrown:networkFailures=1:networkKinds=http:500:alerts=0");
  error.code = "YUZHOU_UAT_BROWSER_RUNTIME_SURFACE";
  assert.deepEqual(buildCoreTechnicalUatReceipt({ runId: "yzcore-20260901T000000Z-363b9318-rA" }, { error }), {
    formatVersion: 1,
    status: "HOLD",
    runId: "yzcore-20260901T000000Z-363b9318-rA",
    errorCode: "YUZHOU_UAT_BROWSER_RUNTIME_SURFACE",
    errorDetail: "35:department_manager:phone_390:path=/hr/employees:runtimeErrors=1:runtimeKinds=Runtime.exceptionThrown:networkFailures=1:networkKinds=http:500:alerts=0",
    productionImport: "HOLD"
  });
  const unsafe = new Error("YUZHOU_UAT_BROWSER_RUNTIME_SURFACE: route includes employee name");
  unsafe.code = "YUZHOU_UAT_BROWSER_RUNTIME_SURFACE";
  assert.equal(Object.hasOwn(buildCoreTechnicalUatReceipt({ runId: "yzcore-20260901T000000Z-363b9318-rA" }, { error: unsafe }), "errorDetail"), false);
});

test("core technical UAT is bound to rollback_ready and cannot promote a full manifest", () => {
  const runner = readFileSync(resolve(root, "scripts/hr-cutover/run-core-t0-t3-technical-uat.mjs"), "utf8");
  assert.match(runner, /lifecycle\.state !== "rollback_ready"/u);
  assert.match(runner, /requiredState: "rollback_ready", finalizeManifest: false/u);
  assert.match(runner, /productionImport: "HOLD"/u);
  assert.match(runner, /safeDatabaseDiagnostic/u);
  assert.match(runner, /technical-uat-core-receipt\.json/u);
  const sharedRunner = readFileSync(resolve(root, "scripts/hr-cutover/run-full-domain-technical-uat.mjs"), "utf8");
  assert.match(sharedRunner, /requiredState="uat_ready",finalizeManifest=true/u);
  assert.match(sharedRunner, /if\(finalizeManifest\)/u);
  assert.match(sharedRunner, /VERBOSITY=verbose/u);
  assert.match(sharedRunner, /safeDatabaseDiagnostic/u);
  assert.match(sharedRunner, /safeRuntimeCategories/u);
  assert.match(sharedRunner, /function buildApiForTarget\(\)/u);
  assert.match(sharedRunner, /pnpm",\["--filter","@jinhu\/api","build"\]/u);
  assert.match(sharedRunner, /const apiMain=buildApiForTarget\(\)/u);
  assert.match(sharedRunner, /technical-uat-runtime-failure-summary\.json/u);
  assert.match(sharedRunner, /waitLoopbackPortClear/u);
  assert.match(sharedRunner, /databaseCallsite/u);
  assert.match(sharedRunner, /l\.biz_id::text=:'bizId'/u);
  assert.doesNotMatch(sharedRunner, /l\.biz_id=:'bizId'::uuid/u);
  const p0Scenario = readFileSync(resolve(root, "scripts/hr-cutover/yuzhou-live-role-uat-p0-scenario.mjs"), "utf8");
  assert.match(p0Scenario, /'\{\}'::jsonb/u);
  assert.match(p0Scenario, /'\{"baseSalary":"2000\.00"\}'::jsonb/u);
  assert.match(sharedRunner, /constraint "\(\[A-Za-z0-9_\]\+\)"/u);
  assert.match(sharedRunner, /TECHNICAL_UAT_DATABASE_FAILED/u);
  assert.match(sharedRunner, /operation_\$\{operation\}_sqlstate_\$\{sqlState\}/u);
});
