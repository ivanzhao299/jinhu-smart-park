import assert from "node:assert/strict";
import test from "node:test";
import { apiFormRequest, apiRequest } from "./api-client";

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
  completedAfterRedirect?: boolean;
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

function installFetchRecorder(status = 200, options: { deferLogoutCookie?: boolean } = {}): FetchCall[] {
  const calls: FetchCall[] = [];
  let logoutCookieRelease: (() => void) | undefined;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: FetchCall = { input: String(input), init };
      calls.push(call);
      if (options.deferLogoutCookie && String(input) === "/api/v1/auth/logout-cookie") {
        await new Promise<void>((resolve) => {
          logoutCookieRelease = resolve;
        });
      }
      call.completedAfterRedirect = (globalThis.window as { location?: { href?: string } } | undefined)?.location?.href === "/login";
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status,
        headers: { "content-type": "application/json" }
      });
    }
  });
  Object.defineProperty(calls, "releaseLogoutCookie", {
    configurable: true,
    value: () => logoutCookieRelease?.()
  });
  return calls;
}

async function waitForFireAndForget(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
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

test("apiRequest does not clear refresh cookie on auth login failures", async () => {
  const { session, local, location } = installBrowserStorage();
  session.setItem("jinhu_access_token", "existing-token");
  local.setItem("jinhu_refresh_token", "legacy-refresh");
  const calls = installFetchRecorder(401);

  await assert.rejects(() => apiRequest("/auth/login", { method: "POST", body: { username: "admin", password: "bad" } }));
  await waitForFireAndForget();

  assert.equal(calls.length, 1);
  assert.equal(session.getItem("jinhu_access_token"), "existing-token");
  assert.equal(local.getItem("jinhu_refresh_token"), "legacy-refresh");
  assert.equal(location.href, "");
});

test("apiRequest awaits refresh cookie cleanup before redirecting unauthorized current sessions", async () => {
  const { session, local, location } = installBrowserStorage();
  session.setItem("jinhu_access_token", "access-token");
  session.setItem("jinhu_refresh_token", "legacy-refresh");
  session.setItem("jinhu_auth_user", "{}");
  local.setItem("jinhu_access_token", "access-token");
  local.setItem("jinhu_refresh_token", "legacy-refresh");
  local.setItem("jinhu_auth_user", "{}");
  const calls = installFetchRecorder(401, { deferLogoutCookie: true }) as FetchCall[] & { releaseLogoutCookie: () => void };

  const request = assert.rejects(() => apiRequest("/users/me", { token: "access-token" }));
  await waitForFireAndForget();

  assert.equal(location.href, "");
  assert.equal(calls[1]?.input, "/api/v1/auth/logout-cookie");
  calls.releaseLogoutCookie();
  await request;

  assert.equal(session.getItem("jinhu_access_token"), null);
  assert.equal(session.getItem("jinhu_refresh_token"), null);
  assert.equal(session.getItem("jinhu_auth_user"), null);
  assert.equal(local.getItem("jinhu_access_token"), null);
  assert.equal(local.getItem("jinhu_refresh_token"), null);
  assert.equal(local.getItem("jinhu_auth_user"), null);
  assert.equal(calls[1]?.input, "/api/v1/auth/logout-cookie");
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(calls[1]?.init?.credentials, "include");
  assert.equal(calls[1]?.completedAfterRedirect, false);
  assert.equal(location.href, "/login");
});

test("apiRequest ignores unauthorized stale bearer responses after a newer session is stored", async () => {
  const { session, local, location } = installBrowserStorage();
  session.setItem("jinhu_access_token", "new-token");
  local.setItem("jinhu_access_token", "new-token");
  const calls = installFetchRecorder(401);

  await assert.rejects(() => apiRequest("/users/me", { token: "old-token" }));
  await waitForFireAndForget();

  assert.equal(calls.length, 1);
  assert.equal(session.getItem("jinhu_access_token"), "new-token");
  assert.equal(local.getItem("jinhu_access_token"), "new-token");
  assert.equal(location.href, "");
});

test("apiRequest does not clear refresh cookie on refresh endpoint unauthorized responses", async () => {
  const { session, location } = installBrowserStorage();
  session.setItem("jinhu_refresh_token", "legacy-refresh");
  session.setItem("jinhu_access_token", "new-token");
  const calls = installFetchRecorder(401);

  await assert.rejects(() => apiRequest("/auth/token/refresh", { method: "POST" }));
  await waitForFireAndForget();

  assert.equal(session.getItem("jinhu_refresh_token"), "legacy-refresh");
  assert.equal(session.getItem("jinhu_access_token"), "new-token");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/api/v1/auth/token/refresh");
  assert.equal(location.href, "");
});

test("apiRequest does not recursively call logout-cookie on logout-cookie unauthorized responses", async () => {
  installBrowserStorage();
  const calls = installFetchRecorder(401);

  await assert.rejects(() => apiRequest("/auth/logout-cookie", { method: "POST" }));
  await waitForFireAndForget();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/api/v1/auth/logout-cookie");
});

test("apiFormRequest clears refresh cookie on unauthorized responses", async () => {
  installBrowserStorage();
  const calls = installFetchRecorder(401);
  const body = new FormData();
  body.set("file", new Blob(["hello"]), "hello.txt");

  await assert.rejects(() => apiFormRequest("/files", { method: "POST", body }));
  await waitForFireAndForget();

  assert.equal(calls[1]?.input, "/api/v1/auth/logout-cookie");
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(calls[1]?.init?.credentials, "include");
});
