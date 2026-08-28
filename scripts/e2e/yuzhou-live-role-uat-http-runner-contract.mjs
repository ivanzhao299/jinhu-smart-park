/* global Response, structuredClone */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  YuzhouLiveRoleUatHttpRunner,
  YuzhouLiveRoleUatHttpRunnerError
} from "../hr-cutover/yuzhou-live-role-uat-http-runner.mjs";

const root = resolve(import.meta.dirname, "../..");
const load = relative => JSON.parse(readFileSync(resolve(root, relative), "utf8"));
const taskCard = load("scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json");
const apiMatrix = load("scripts/hr-cutover/contracts/yuzhou-live-role-uat-api-matrix-v1.json");
const tokens = { hr_maker: "maker-token-isolated", hr_reviewer: "reviewer-token-isolated", manager: "manager-token-isolated", employee: "employee-token-isolated" };

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}/api/v1`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("the HTTP runner performs real loopback calls and emits value-free evidence", async () => {
  const seen = [];
  await withServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body });
      response.writeHead(request.url.endsWith("/actions") ? 201 : 201, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: { id: "11111111-1111-4111-8111-111111111111", status: request.url.endsWith("/actions") ? "submitted" : "draft", confidentialValue: "must-not-enter-evidence" } }));
    });
  }, async apiBase => {
    const runner = new YuzhouLiveRoleUatHttpRunner({ apiBase, tokens, apiMatrix, taskCard, idempotencyPrefix: "uat-http-contract" });
    const observation = await runner.execute({
      legacyId: 34,
      kind: "positive",
      checkId: "hr_maker_create_submit",
      substitutions: { onboardingId: "11111111-1111-4111-8111-111111111111" },
      bodies: [{ applicationName: "synthetic" }, { action: "submit" }],
      assert: responses => ({
        created_id: responses[0].body.data.id.length === 36,
        status_submitted: responses[1].body.data.status === "submitted",
        audit_written: true
      })
    });
    assert.equal(seen.length, 2);
    assert.equal(seen[0].authorization, `Bearer ${tokens.hr_maker}`);
    assert.equal(observation.operations.length, 2);
    assert.match(observation.observationSha256, /^[0-9a-f]{64}$/u);
    assert.doesNotMatch(JSON.stringify(observation), /must-not-enter-evidence|synthetic|Bearer/u);
  });
});

test("a created UUID may be bound into the next operation without weakening route safety", async () => {
  const created = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: { id: created, status: calls.length === 1 ? "draft" : "submitted" } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const runner = new YuzhouLiveRoleUatHttpRunner({ apiBase: "http://127.0.0.1/api/v1", tokens, apiMatrix, taskCard, idempotencyPrefix: "uat-chain", request });
  await runner.execute({
    legacyId: 34,
    kind: "positive",
    checkId: "hr_maker_create_submit",
    bodies: [{ employeeId: created }, { action: "submit" }],
    afterOperation: ({ index, response }) => index === 0 ? { onboardingId: response.body.data.id } : undefined,
    assert: () => ({ created_id: true, status_submitted: true, audit_written: true })
  });
  assert.equal(calls[1].url, `http://127.0.0.1/api/v1/hr/onboarding-applications/${created}/actions`);
  await assert.rejects(
    runner.execute({ legacyId: 34, kind: "positive", checkId: "hr_maker_create_submit", bodies: [{}, {}], afterOperation: () => ({ onboardingId: "not-a-uuid" }), assert: () => ({ created_id: true, status_submitted: true, audit_written: true }) }),
    error => error.code === "YUZHOU_UAT_HTTP_CHAIN_INVALID"
  );
});

test("wrong status, incomplete assertions, unsafe origins and matrix drift fail closed", async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [] }));
  }, async apiBase => {
    const runner = new YuzhouLiveRoleUatHttpRunner({ apiBase, tokens, apiMatrix, taskCard, idempotencyPrefix: "uat-http-negative" });
    await assert.rejects(
      runner.execute({ legacyId: 34, kind: "negative", checkId: "employee_cannot_list_all", bodies: [undefined], assert: () => ({ no_rows_disclosed: true }) }),
      error => error instanceof YuzhouLiveRoleUatHttpRunnerError && error.code === "YUZHOU_UAT_HTTP_STATUS_MISMATCH"
    );
    await assert.rejects(
      runner.execute({ legacyId: 39, kind: "negative", checkId: "employee_cannot_read_other_change", bodies: [undefined], assert: () => ({}) }),
      error => error instanceof YuzhouLiveRoleUatHttpRunnerError && error.code === "YUZHOU_UAT_HTTP_ASSERTION_FAILED"
    );
  });
  assert.throws(
    () => new YuzhouLiveRoleUatHttpRunner({ apiBase: "https://park.example/api/v1", tokens, apiMatrix, taskCard, idempotencyPrefix: "uat-http-unsafe" }),
    error => error instanceof YuzhouLiveRoleUatHttpRunnerError && error.code === "YUZHOU_UAT_HTTP_BASE_UNSAFE"
  );
  assert.throws(
    () => new YuzhouLiveRoleUatHttpRunner({ apiBase: "http://127.0.0.1:12345/api/v1", tokens: { ...tokens, hr_reviewer: tokens.hr_maker }, apiMatrix, taskCard, idempotencyPrefix: "uat-http-duplicate" }),
    error => error instanceof YuzhouLiveRoleUatHttpRunnerError && error.code === "YUZHOU_UAT_HTTP_ACTORS_INVALID"
  );
  const drifted = structuredClone(apiMatrix);
  drifted.checks.pop();
  assert.throws(
    () => new YuzhouLiveRoleUatHttpRunner({ apiBase: "http://127.0.0.1:12345/api/v1", tokens, apiMatrix: drifted, taskCard, idempotencyPrefix: "uat-http-drift" }),
    /YUZHOU_UAT_API_MATRIX_CHECK_DRIFT/u
  );
});
