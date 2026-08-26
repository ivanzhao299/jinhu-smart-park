import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const script = join(root, "scripts/e2e/enable-property-approval-runtime.mjs");
const source = readFileSync(script, "utf8");
const temp = mkdtempSync(join(tmpdir(), "jinhu-approval-runtime-contract-"));
const compose = join(temp, "compose.yml");
const fakeDocker = join(temp, "docker");
writeFileSync(compose, "services:\n  postgres:\n    image: postgres\n");
writeFileSync(fakeDocker, "#!/bin/sh\ncat > \"$CAPTURE_SQL\"\nprintf 'approval.enforce|t|enforce|4|UAT-REF\\nREQ-1|uat-enable|t|now\\n'\n", { mode: 0o700 });

const baseEnv = {
  ...process.env,
  ALLOW_PROPERTY_APPROVAL_RUNTIME_ENABLE: "yes",
  PROPERTY_APPROVAL_RUNTIME_TARGET: "disposable",
  PROPERTY_APPROVAL_RUNTIME_COMPOSE_FILE: compose,
  PROPERTY_APPROVAL_RUNTIME_COMPOSE_PROJECT: "jinhu-housing-uat-contract",
  PROPERTY_APPROVAL_RUNTIME_POSTGRES_SERVICE: "postgres",
  PROPERTY_APPROVAL_RUNTIME_TENANT_ID: "10000001",
  PROPERTY_APPROVAL_RUNTIME_PARK_ID: "20000001",
  PROPERTY_APPROVAL_RUNTIME_ACTOR_ID: "00000000-0000-4000-8000-000000000001",
  PROPERTY_APPROVAL_RUNTIME_ACTOR_NAME: "uat-operator",
  PROPERTY_APPROVAL_RUNTIME_APPROVAL_REFERENCE: "UAT-REF",
  PROPERTY_APPROVAL_RUNTIME_REQUEST_ID: "REQ-1",
  PROPERTY_APPROVAL_RUNTIME_DOCKER_BIN: fakeDocker,
  POSTGRES_USER: "jinhu",
  POSTGRES_DB: "jinhu_housing_uat_contract",
  CAPTURE_SQL: join(temp, "captured.sql")
};

try {
  const rejected = spawnSync(process.execPath, [script], { env: { ...baseEnv, NODE_ENV: "production" }, encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /production-like.*forbidden/);
  assert.equal(existsSync(baseEnv.CAPTURE_SQL), false, "production rejection must happen before docker runs");

  const enabled = spawnSync(process.execPath, [script], { env: { ...baseEnv, NODE_ENV: "test" }, encoding: "utf8" });
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.match(enabled.stdout, /\[AUDIT\].*approval_reference=UAT-REF.*request_id=REQ-1/);
  const sql = readFileSync(baseEnv.CAPTURE_SQL, "utf8");
  assert.match(sql, /BEGIN;[\s\S]*FOR UPDATE;[\s\S]*UPDATE public\.sys_property_runtime_control/);
  assert.match(sql, /contract_hash <> input_row\.contract_hash/);
  assert.match(sql, /version = input_row\.expected_version/);
  assert.match(sql, /INSERT INTO public\.sys_op_log/);
  assert.match(sql, /to_jsonb\(control_row\), to_jsonb\(after_row\)/);
  assert.match(sql, /COMMIT;[\s\S]*SELECT request_id, action, success, op_time/);
  assert.doesNotMatch(source, /docker-compose\.prod\.yml|prod:deploy/);
  console.log("PASS enable-property-approval-runtime contract");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
