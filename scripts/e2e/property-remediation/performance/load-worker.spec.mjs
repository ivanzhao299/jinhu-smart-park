import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { executeLoad } from "./load-worker.mjs";

test("runs requests concurrently and reports latency/throughput/error metrics", async (context) => {
  const authorizations = [];
  const server = createServer((request, response) => {
    authorizations.push(request.headers.authorization);
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  const result = await executeLoad({
    baseUrl: `http://127.0.0.1:${address.port}`,
    path: "/dashboard",
    token: "stdin-only-token",
    concurrency: 2,
    warmupSeconds: 0,
    formalSeconds: 0,
    minimumRequests: 6,
    requestTimeoutMilliseconds: 1000
  });
  assert.equal(result.formal.requests >= 6, true);
  assert.equal(result.formal.failures.length, 0);
  assert.equal(result.formal.metrics.errorRate, 0);
  assert.equal(result.formal.metrics.throughputPerSecond > 0, true);
  assert.equal(authorizations.every((value) => value === "Bearer stdin-only-token"), true);
  assert.equal(JSON.stringify(result).includes("stdin-only-token"), false);
});

test("records HTTP failures without response bodies or authorization secrets", async (context) => {
  const server = createServer((_request, response) => {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("sensitive-upstream-body");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  const result = await executeLoad({
    baseUrl: `http://127.0.0.1:${address.port}`,
    path: "/dashboard",
    token: "secret-token",
    concurrency: 1,
    warmupSeconds: 0,
    formalSeconds: 0,
    minimumRequests: 1,
    requestTimeoutMilliseconds: 1000
  });
  assert.deepEqual(result.formal.failures, [{ kind: "http", status: 503 }]);
  assert.equal(JSON.stringify(result).includes("sensitive-upstream-body"), false);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});
