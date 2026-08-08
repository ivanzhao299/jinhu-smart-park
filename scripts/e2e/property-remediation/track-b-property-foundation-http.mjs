import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const rootDir = resolve(new URL("../../..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
process.env.TS_NODE_PROJECT = resolve(rootDir, "apps/api/tsconfig.json");
require(resolve(rootDir, "apps/api/node_modules/ts-node/register/transpile-only.js"));

const { startPropertyFoundationHttpHarness } = require(
  resolve(rootDir, "scripts/e2e/property-remediation/track-b-property-foundation-http-app.ts")
);

async function request(path) {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    headers: {
      authorization: "Bearer b05-core-gate",
      "x-b05-principal": "normal"
    }
  });
  return { status: response.status, body: await response.json() };
}

let harness;
try {
  harness = await startPropertyFoundationHttpHarness();

  const valid = await request("/property/identity-submissions?page=1&pageSize=20&order=desc");
  assert.equal(valid.status, 200);
  assert.equal(valid.body.code, 0);
  assert.equal(valid.body.request_id, "pr192-b05-core-http");
  assert.equal(typeof valid.body.server_time, "number");

  const invalid = await request("/property/identity-submissions?sortBy=createTime");
  assert.equal(invalid.status, 400);
  assert.deepEqual(Object.keys(invalid.body).sort(), [
    "code", "data", "message", "request_id", "server_time"
  ]);
  assert.equal(invalid.body.data, null);

  const conflict = await request(
    "/property/identity-submissions/ba000000-0000-4000-8000-000000000499"
  );
  assert.equal(conflict.status, 409);
  assert.deepEqual(Object.keys(conflict.body.data).sort(), [
    "details", "errorCode", "retryable"
  ]);
  assert.equal(conflict.body.data.errorCode, "property-version-conflict");
  assert.equal(conflict.body.data.retryable, false);
  assert.deepEqual(conflict.body.data.details, {});

  process.stdout.write(`${JSON.stringify({
    result: "PASS",
    moduleBootstrap: true,
    realNestHttp: true,
    validEnvelope: true,
    invalidAliasRejected: true,
    businessErrorEnvelope: true,
    safeDetailsProjection: "redacted-to-empty-object"
  })}\n`);
} finally {
  if (harness) await harness.close();
}
