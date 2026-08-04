import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const propertyRemediationDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = readFileSync(
  resolve(propertyRemediationDir, "track-b-high-risk-stopship.mjs"),
  "utf8"
);
const harness = readFileSync(
  resolve(propertyRemediationDir, "track-b-high-risk-stopship-app.ts"),
  "utf8"
);
const wrapper = readFileSync(
  resolve(propertyRemediationDir, "track-b-high-risk-stopship.sh"),
  "utf8"
);

test("S0 gate cannot access the Docker socket or full AppModule", () => {
  assert.doesNotMatch(runner, /docker\.sock|dockerRequest|startPostgres/);
  assert.doesNotMatch(harness, /AppModule|@nestjs\/testing|TestingModule/);
  assert.doesNotMatch(wrapper, /docker\.sock/);
  assert.match(wrapper, /--network "container:\$container_id"/);
  assert.match(wrapper, /"\$repo_dir:\/workspace:ro"/);
});

test("S0 harness uses formal URLs, controllers, guards, and interceptors", () => {
  for (const expected of [
    "PropertyOperationsController",
    "PropertyOccupanciesController",
    "PropertyApprovalRequiredGuard",
    "PermissionGuard",
    "ModuleGuard",
    "IdempotencyKeyGuard",
    "AuditLogInterceptor",
    "ResponseInterceptor",
    "ApiExceptionFilter"
  ]) {
    assert.match(harness, new RegExp(`\\b${expected}\\b`));
  }
  assert.match(runner, /\/property\/units\/\$\{modeTargetId\}\/mode-transitions/);
  assert.match(runner, /\/property\/occupancies\/\$\{occupancyTargetId\}\/release/);
});

test("S0 runner freezes principal matrix and six-table zero-mutation surface", () => {
  assert.match(runner, /\["normal", "super", "wildcard"\]/);
  for (const table of [
    "biz_property_operation_config",
    "biz_property_mode_transition_log",
    "biz_property_occupancy",
    "sys_op_log",
    "sys_idempotency_request",
    "biz_property_outbox"
  ]) {
    assert.match(runner, new RegExp(`"${table}"`));
  }
  assert.match(runner, /property\.mode-transition\.request/);
  assert.match(runner, /property\.occupancy\.force-release\.request/);
});
