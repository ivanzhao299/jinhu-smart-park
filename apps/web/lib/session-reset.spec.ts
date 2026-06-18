import assert from "node:assert/strict";
import test from "node:test";
import { handleUnauthorizedSessionReset } from "./session-reset";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

interface FetchCall {
  input: string;
  init?: RequestInit;
}

function installBrowserStorage() {
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  const windowLike = {
    sessionStorage: session,
    localStorage: local,
    location: { href: "" }
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowLike });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  return { session, local, location: windowLike.location };
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

test("handleUnauthorizedSessionReset supports direct-fetch protected 401 cleanup", async () => {
  const { session, local, location } = installBrowserStorage();
  session.setItem("jinhu_access_token", "download-token");
  local.setItem("jinhu_access_token", "download-token");
  const calls = installFetchRecorder();

  const handled = await handleUnauthorizedSessionReset({
    path: "/files/file-1/download",
    requestToken: "download-token",
    redirect: true
  });

  assert.equal(handled, true);
  assert.equal(calls[0]?.input, "/api/v1/auth/logout-cookie");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(session.getItem("jinhu_access_token"), null);
  assert.equal(local.getItem("jinhu_access_token"), null);
  assert.equal(location.href, "/login");
});
