import assert from "node:assert/strict";
import test from "node:test";
import { clearSession, getRefreshToken, logoutSession, setSession } from "./auth";

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

  clear(): void {
    this.values.clear();
  }
}

interface FetchCall {
  input: string;
  init?: RequestInit;
}

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "admin",
  real_name: "Admin",
  mobile: null,
  email: null,
  tenant_id: "10000001",
  park_id: "20000001",
  org_id: null,
  org_name: null,
  roles: [],
  permissions: [],
  data_scope: "all",
  is_super: true
};

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
  return { session, local };
}

function installFetchRecorder(status = 200): FetchCall[] {
  const calls: FetchCall[] = [];
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status,
        headers: { "content-type": "application/json" }
      });
    }
  });
  return calls;
}

test("setSession stores access token and user but removes legacy refresh token storage", () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_refresh_token", "old-session-refresh");
  local.setItem("jinhu_refresh_token", "old-local-refresh");

  setSession("access-token", user, "new-refresh-token");

  assert.equal(session.getItem("jinhu_access_token"), "access-token");
  assert.equal(local.getItem("jinhu_access_token"), "access-token");
  assert.equal(JSON.parse(session.getItem("jinhu_auth_user") ?? "{}").username, "admin");
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").username, "admin");
  assert.equal(session.getItem("jinhu_refresh_token"), null);
  assert.equal(local.getItem("jinhu_refresh_token"), null);
  assert.equal(getRefreshToken(), "");
});

test("clearSession removes legacy refresh token storage", () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_access_token", "access-token");
  session.setItem("jinhu_auth_user", JSON.stringify(user));
  session.setItem("jinhu_refresh_token", "session-refresh");
  local.setItem("jinhu_access_token", "access-token");
  local.setItem("jinhu_auth_user", JSON.stringify(user));
  local.setItem("jinhu_refresh_token", "local-refresh");

  clearSession();

  assert.equal(session.getItem("jinhu_access_token"), null);
  assert.equal(session.getItem("jinhu_auth_user"), null);
  assert.equal(session.getItem("jinhu_refresh_token"), null);
  assert.equal(local.getItem("jinhu_access_token"), null);
  assert.equal(local.getItem("jinhu_auth_user"), null);
  assert.equal(local.getItem("jinhu_refresh_token"), null);
});

test("logoutSession uses cookie logout flow without sending refresh token body", async () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_access_token", "access-token");
  session.setItem("jinhu_refresh_token", "legacy-refresh");
  local.setItem("jinhu_refresh_token", "legacy-refresh");
  const calls = installFetchRecorder();

  await logoutSession();

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.input, "/api/v1/auth/logout");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(calls[0]?.init?.body, undefined);
  assert.equal(new Headers(calls[0]?.init?.headers).get("Authorization"), "Bearer access-token");
  assert.equal(calls[1]?.input, "/api/v1/auth/logout-cookie");
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(calls[1]?.init?.credentials, "include");
  assert.equal(session.getItem("jinhu_access_token"), null);
  assert.equal(session.getItem("jinhu_refresh_token"), null);
  assert.equal(local.getItem("jinhu_refresh_token"), null);
});
