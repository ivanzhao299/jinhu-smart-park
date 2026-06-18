import assert from "node:assert/strict";
import test from "node:test";
import { apiFormRequest, apiRequest } from "./api-client";

interface FetchCall {
  input: string;
  init?: RequestInit;
}

function installFetchRecorder(): FetchCall[] {
  const calls: FetchCall[] = [];
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  return calls;
}

test("apiRequest sends credentials for refresh cookies by default", async () => {
  const calls = installFetchRecorder();

  await apiRequest("/auth/token/refresh", { method: "POST" });

  assert.equal(calls[0]?.input, "/api/v1/auth/token/refresh");
  assert.equal(calls[0]?.init?.credentials, "include");
});

test("apiRequest keeps refresh cookie credentials even when callers pass another credentials mode", async () => {
  const calls = installFetchRecorder();

  await apiRequest("/auth/token/refresh", { method: "POST", credentials: "omit" });

  assert.equal(calls[0]?.init?.credentials, "include");
});

test("apiFormRequest sends credentials for cookie-backed requests", async () => {
  const calls = installFetchRecorder();
  const body = new FormData();
  body.set("file", new Blob(["hello"]), "hello.txt");

  await apiFormRequest("/files", { method: "POST", body });

  assert.equal(calls[0]?.input, "/api/v1/files");
  assert.equal(calls[0]?.init?.credentials, "include");
});
