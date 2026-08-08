import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(rootDir, "apps/api/package.json"));
const runId = process.env.B05_S0_RUN_ID ?? `b05s0-${randomBytes(8).toString("hex")}`;
const containerName = process.env.B05_S0_CONTAINER_NAME ?? `pr192_${runId}_db`;
const fixtureLabel = "pr192-b05-s0-http-db";
const databaseName = process.env.B05_S0_DATABASE_NAME ?? "pr192_b05_s0";
const postgresUser = process.env.B05_S0_DATABASE_USER ?? "pr192_b05_s0";
const postgresPassword = process.env.B05_S0_DATABASE_PASSWORD ?? `${runId}_local_only`;
const postgresHost = process.env.B05_S0_DATABASE_HOST ?? "";
const postgresPort = Number(process.env.B05_S0_DATABASE_PORT ?? "5432");
const evidencePath = process.env.B05_S0_EVIDENCE_PATH
  ?? `/tmp/pr192-b05-s0-http-db-${runId}.json`;
const trackedTables = [
  "biz_property_operation_config",
  "biz_property_mode_transition_log",
  "biz_property_occupancy",
  "sys_op_log",
  "sys_idempotency_request",
  "biz_property_outbox"
];
const modeTargetId = "00000000-0000-4000-8000-00000000a001";
const occupancyTargetId = "00000000-0000-4000-8000-00000000b001";

let harness = null;
let pgClient = null;
const evidence = {
  gate: "B0.5-S0 real HTTP + disposable PostgreSQL zero-mutation",
  runId,
  startedAt: new Date().toISOString(),
  result: "FAIL",
  postgres: {
    image: "postgres:16-alpine",
    containerName,
    fixtureLabel,
    existingDatabaseTouched: false,
    orchestration: "exact outer wrapper; HTTP runner has no Docker socket"
  },
  requests: [],
  trackedTables,
  metadataDrift: {
    realHttpClaimed: false,
    note: "Decorator metadata drift remains covered by property-approval-required.guard.spec.ts; this gate proves runtime behavior."
  },
  cleanup: {}
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function connectPostgres(port) {
  const { Client } = require("pg");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const client = new Client({
      host: postgresHost,
      port,
      database: databaseName,
      user: postgresUser,
      password: postgresPassword
    });
    try {
      await client.connect();
      return client;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw new Error("disposable PostgreSQL did not become ready");
}

async function createFixtureSchema(client) {
  await client.query(`
    CREATE TABLE biz_property_operation_config (
      id uuid PRIMARY KEY, tenant_id text NOT NULL, park_id text NOT NULL,
      unit_id uuid NOT NULL, operating_mode text NOT NULL,
      operating_status text NOT NULL, version integer NOT NULL DEFAULT 1
    );
    CREATE TABLE biz_property_mode_transition_log (
      id uuid PRIMARY KEY, tenant_id text NOT NULL, park_id text NOT NULL,
      unit_id uuid NOT NULL, from_mode text NOT NULL, to_mode text NOT NULL,
      reason text NOT NULL
    );
    CREATE TABLE biz_property_occupancy (
      id uuid PRIMARY KEY, tenant_id text NOT NULL, park_id text NOT NULL,
      unit_id uuid NOT NULL, status text NOT NULL, release_reason text,
      released_at timestamptz, version integer NOT NULL DEFAULT 1
    );
    CREATE TABLE sys_op_log (
      id uuid PRIMARY KEY, tenant_id text NOT NULL, park_id text NOT NULL,
      action text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE sys_idempotency_request (
      id uuid PRIMARY KEY, tenant_id text NOT NULL, park_id text NOT NULL,
      idempotency_key text NOT NULL, status text NOT NULL
    );
    CREATE TABLE biz_property_outbox (
      event_id uuid PRIMARY KEY, tenant_id text NOT NULL, park_id text NOT NULL,
      event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    INSERT INTO biz_property_operation_config
      (id, tenant_id, park_id, unit_id, operating_mode, operating_status)
    VALUES
      ('00000000-0000-4000-8000-00000000c001', '10000001', '20000001',
       '${modeTargetId}', 'none', 'enabled');
    INSERT INTO biz_property_occupancy
      (id, tenant_id, park_id, unit_id, status)
    VALUES
      ('${occupancyTargetId}', '10000001', '20000001',
       '${modeTargetId}', 'active');
  `);
}

async function snapshotDatabase(client) {
  const result = {};
  for (const table of trackedTables) {
    const rows = await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY 1::text`);
    result[table] = rows.rows.map(({ row }) => row);
  }
  return result;
}

async function httpJson(path, principal, body, suffix) {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer stopship-local-only",
      "content-type": "application/json",
      "x-idempotency-key": `b05-s0-${principal}-${suffix}-${runId}`,
      "x-request-id": `b05-s0-${principal}-${suffix}`,
      "x-stopship-principal": principal
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

function assertApprovalEnvelope(result, actionId, targetId) {
  assert(result.status === 409, `expected HTTP 409, got ${result.status}`);
  const body = result.body;
  assert(
    JSON.stringify(Object.keys(body).sort())
      === JSON.stringify(["code", "data", "message", "request_id", "server_time"]),
    "approval envelope top-level keys drift"
  );
  assert(body.code === 409, "approval envelope code drift");
  assert(body.message === "approval-required", "approval envelope message drift");
  assert(typeof body.request_id === "string" && body.request_id.length > 0, "request_id missing");
  assert(Number.isInteger(body.server_time) && body.server_time > 0, "server_time must be epoch milliseconds");
  assert(
    JSON.stringify(body.data) === JSON.stringify({
      errorCode: "approval-required",
      actionId,
      targetId,
      approvalAvailable: false
    }),
    `approval envelope data drift for ${actionId}`
  );
}

async function assertHighRiskZeroMutation(client, principal, action) {
  const before = await snapshotDatabase(client);
  const countersBefore = { ...harness.counters };
  const request = action === "mode"
    ? await httpJson(
        `/property/units/${modeTargetId}/mode-transitions`,
        principal,
        { target_mode: "short_stay", reason: "S0 mode transition must fail closed" },
        "mode"
      )
    : await httpJson(
        `/property/occupancies/${occupancyTargetId}/release`,
        principal,
        { force: true, reason: "S0 force release must fail closed" },
        "force-release"
      );
  const after = await snapshotDatabase(client);
  const actionId = action === "mode"
    ? "property.mode-transition.request"
    : "property.occupancy.force-release.request";
  const targetId = action === "mode" ? modeTargetId : occupancyTargetId;
  assertApprovalEnvelope(request, actionId, targetId);
  assert(JSON.stringify(after) === JSON.stringify(before), `${principal}/${action} mutated tracked PostgreSQL tables`);
  assert(harness.counters.auditCalls === countersBefore.auditCalls, `${principal}/${action} reached audit interceptor`);
  assert(
    harness.counters.idempotencyBeginCalls === countersBefore.idempotencyBeginCalls,
    `${principal}/${action} reached route idempotency interceptor`
  );
  assert(
    harness.counters.operationServiceCalls === countersBefore.operationServiceCalls
      && harness.counters.occupancyServiceCalls === countersBefore.occupancyServiceCalls,
    `${principal}/${action} reached a domain service`
  );
  evidence.requests.push({
    principal,
    action,
    status: request.status,
    actionId,
    targetId,
    zeroMutation: true,
    auditCallsDelta: 0,
    idempotencyBeginCallsDelta: 0,
    serviceCallsDelta: 0
  });
}

async function assertLegacyForceStringZeroMutation(client) {
  const before = await snapshotDatabase(client);
  const countersBefore = { ...harness.counters };
  const request = await httpJson(
    `/property/occupancies/${occupancyTargetId}/release`,
    "wildcard",
    { force: "true", reason: "Legacy string force must fail closed" },
    "legacy-force-release"
  );
  const after = await snapshotDatabase(client);
  assertApprovalEnvelope(
    request,
    "property.occupancy.force-release.request",
    occupancyTargetId
  );
  assert(JSON.stringify(after) === JSON.stringify(before), "legacy force=true string mutated PostgreSQL");
  assert(JSON.stringify(harness.counters) === JSON.stringify(countersBefore), "legacy force=true string crossed the S0 guard");
  evidence.requests.push({
    principal: "wildcard",
    action: "legacy-force-string",
    status: request.status,
    zeroMutation: true,
    serviceCallsDelta: 0
  });
}

async function assertLowRiskRouteReachable() {
  const before = { ...harness.counters };
  const result = await httpJson(
    `/property/occupancies/${occupancyTargetId}/release`,
    "normal",
    { force: false, reason: "S0 low-risk route regression" },
    "low-risk-release"
  );
  assert(result.status === 201, `force=false low-risk route expected 201, got ${result.status}`);
  assert(result.body?.code === 0, "force=false response did not pass ResponseInterceptor");
  assert(result.body?.data?.harnessLowRisk === true, "force=false did not reach low-risk service fixture");
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  assert(harness.counters.occupancyServiceCalls === before.occupancyServiceCalls + 1, "force=false service call missing");
  assert(harness.counters.idempotencyBeginCalls === before.idempotencyBeginCalls + 1, "force=false idempotency interceptor missing");
  assert(harness.counters.auditCalls === before.auditCalls + 1, "force=false audit interceptor missing");
  evidence.requests.push({
    principal: "normal",
    action: "force-false-control",
    status: result.status,
    reachedLowRiskService: true,
    note: "This control proves S0 guard discrimination only; real low-risk domain mutation is covered by service tests."
  });
}

async function cleanup() {
  const errors = [];
  if (harness) {
    await harness.close().catch((error) => errors.push(`Nest close: ${error.message}`));
    harness = null;
  }
  if (pgClient) {
    await pgClient.end().catch((error) => errors.push(`PostgreSQL client close: ${error.message}`));
    pgClient = null;
  }
  evidence.cleanup = {
    processResourcesClosed: errors.length === 0,
    externalCleanupEvidence:
      process.env.B05_S0_CLEANUP_EVIDENCE_PATH ?? null,
    errors
  };
  if (errors.length > 0) {
    throw new Error(`S0 cleanup failed: ${JSON.stringify(evidence.cleanup)}`);
  }
}

async function run() {
  assert(postgresHost === "127.0.0.1", "S0 runner only accepts wrapper-local PostgreSQL");
  assert(Number.isInteger(postgresPort) && postgresPort === 5432, "S0 wrapper PostgreSQL port drift");
  assert(process.env.B05_S0_DISPOSABLE_DATABASE === "true", "S0 disposable database attestation missing");
  pgClient = await connectPostgres(postgresPort);
  await createFixtureSchema(pgClient);

  process.env.TS_NODE_PROJECT = resolve(rootDir, "apps/api/tsconfig.json");
  require("ts-node/register/transpile-only");
  const { startStopshipHarness } = require(
    resolve(rootDir, "scripts/e2e/property-remediation/track-b-high-risk-stopship-app.ts")
  );
  harness = await startStopshipHarness();

  for (const principal of ["normal", "super", "wildcard"]) {
    await assertHighRiskZeroMutation(pgClient, principal, "mode");
    await assertHighRiskZeroMutation(pgClient, principal, "force-release");
  }
  await assertLegacyForceStringZeroMutation(pgClient);
  await assertLowRiskRouteReachable();

  evidence.result = "PASS";
  evidence.finishedAt = new Date().toISOString();
  evidence.sourceShaGrammar =
    "SHA-256 of ordered UTF-8 lines: relative-path<TAB>raw-file-sha256<LF>";
  evidence.sourceSha = sha256(
    [
      "apps/api/src/modules/property-operations/property-approval-required.guard.ts",
      "apps/api/src/modules/property-operations/property-approval-required.guard.spec.ts",
      "apps/api/src/modules/property-operations/property-approval-required.service.spec.ts",
      "apps/api/src/modules/property-operations/property-operations.controller.ts",
      "apps/api/src/modules/property-operations/property-operations.service.ts",
      "apps/api/src/modules/property-operations/property-occupancies.controller.ts",
      "apps/api/src/modules/property-operations/property-occupancies.service.ts",
      "apps/api/src/modules/property-operations/property-operations.module.ts",
      "apps/api/src/shared/filters/api-exception.filter.ts",
      "apps/api/src/shared/filters/api-exception.filter.spec.ts",
      "scripts/e2e/property-remediation/track-b-high-risk-stopship-app.ts",
      "scripts/e2e/property-remediation/track-b-high-risk-stopship.mjs",
      "scripts/e2e/property-remediation/track-b-high-risk-stopship.sh",
      "scripts/e2e/property-remediation/tests/b-high-risk-stopship-contract.spec.mjs"
    ].map((path) => `${path}\t${sha256(readFileSync(resolve(rootDir, path)))}\n`).join("")
  );
}

let runError = null;
try {
  await run();
} catch (error) {
  runError = error;
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  try {
    await cleanup();
  } catch (error) {
    runError ??= error;
    evidence.cleanupError = error instanceof Error ? error.stack ?? error.message : String(error);
    evidence.result = "FAIL";
  }
  evidence.finishedAt ??= new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`[INFO] B0.5-S0 evidence: ${evidencePath}`);
}

if (runError) {
  console.error(`[FAIL] ${runError instanceof Error ? runError.stack ?? runError.message : String(runError)}`);
  process.exitCode = 1;
} else {
  console.log(`[PASS] B0.5-S0 real HTTP + disposable PostgreSQL gate`);
}
