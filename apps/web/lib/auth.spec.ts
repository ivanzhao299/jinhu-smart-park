import assert from "node:assert/strict";
import test from "node:test";
import { clearSession, fetchCurrentUser, getRefreshToken, logoutSession, setSession } from "./auth";

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

function installCurrentUserFetchRecorder(
  responses: Array<{ id: string; username: string; beforeReturn?: () => void; defer?: boolean }>
): FetchCall[] & { release: (index: number) => void } {
  const calls: FetchCall[] = [];
  const releases = new Map<number, () => void>();
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const callIndex = calls.length;
      calls.push({ input: String(input), init });
      const response = responses[callIndex] ?? responses[responses.length - 1];
      if (response?.defer) {
        await new Promise<void>((resolve) => {
          releases.set(callIndex, resolve);
        });
      }
      response?.beforeReturn?.();
      return new Response(
        JSON.stringify({
          data: {
            ...user,
            id: response?.id ?? user.id,
            username: response?.username ?? user.username
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
  });
  Object.defineProperty(calls, "release", {
    configurable: true,
    value: (index: number) => releases.get(index)?.()
  });
  return calls as FetchCall[] & { release: (index: number) => void };
}

type FetchCurrentUserWithOptions = (options?: { requestToken?: string }) => ReturnType<typeof fetchCurrentUser>;

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

test("fetchCurrentUser writes user storage when request token is still current", async () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_access_token", "access-token");
  local.setItem("jinhu_access_token", "access-token");
  const calls = installCurrentUserFetchRecorder([{ id: "user-current", username: "current" }]);

  const currentUser = await (fetchCurrentUser as FetchCurrentUserWithOptions)({ requestToken: "access-token" });

  assert.equal(currentUser.username, "current");
  assert.equal(calls[0]?.input, "/api/v1/users/me");
  assert.equal(new Headers(calls[0]?.init?.headers).get("Authorization"), "Bearer access-token");
  assert.equal(JSON.parse(session.getItem("jinhu_auth_user") ?? "{}").username, "current");
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").username, "current");
});

test("fetchCurrentUser does not persist stale user when request token changes before response", async () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_auth_user", JSON.stringify({ id: "existing", username: "existing" }));
  installCurrentUserFetchRecorder([
    {
      id: "user-old",
      username: "old",
      beforeReturn: () => {
        session.setItem("jinhu_access_token", "new-token");
        local.setItem("jinhu_access_token", "new-token");
      }
    }
  ]);

  const currentUser = await (fetchCurrentUser as FetchCurrentUserWithOptions)({ requestToken: "old-token" });

  assert.equal(currentUser.username, "old");
  assert.equal(session.getItem("jinhu_auth_user"), null);
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").username, "existing");
});

test("fetchCurrentUser isolates pending requests by access token", async () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_access_token", "old-token");
  const calls = installCurrentUserFetchRecorder([
    { id: "user-old", username: "old", defer: true },
    { id: "user-new", username: "new" }
  ]);

  const oldRequest = (fetchCurrentUser as FetchCurrentUserWithOptions)({ requestToken: "old-token" });
  await new Promise((resolve) => setImmediate(resolve));
  session.setItem("jinhu_access_token", "new-token");
  local.setItem("jinhu_access_token", "new-token");
  const newRequest = (fetchCurrentUser as FetchCurrentUserWithOptions)({ requestToken: "new-token" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[0]?.init?.headers).get("Authorization"), "Bearer old-token");
  assert.equal(new Headers(calls[1]?.init?.headers).get("Authorization"), "Bearer new-token");
  calls.release(0);
  const [oldUser, newUser] = await Promise.all([oldRequest, newRequest]);

  assert.equal(oldUser.username, "old");
  assert.equal(newUser.username, "new");
  assert.equal(JSON.parse(session.getItem("jinhu_auth_user") ?? "{}").username, "new");
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").username, "new");
});

test("logoutSession clears cookie before sending legacy refresh token body for old sessions", async () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_access_token", "access-token");
  session.setItem("jinhu_refresh_token", "legacy-refresh");
  local.setItem("jinhu_refresh_token", "legacy-refresh");
  const calls = installFetchRecorder();

  await logoutSession();

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.input, "/api/v1/auth/logout-cookie");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(calls[1]?.input, "/api/v1/auth/logout");
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(calls[1]?.init?.credentials, "include");
  assert.equal(calls[1]?.init?.body, JSON.stringify({ refreshToken: "legacy-refresh" }));
  assert.equal(new Headers(calls[1]?.init?.headers).get("Authorization"), "Bearer access-token");
  assert.equal(new Headers(calls[1]?.init?.headers).get("Content-Type"), "application/json");
  assert.equal(session.getItem("jinhu_access_token"), null);
  assert.equal(session.getItem("jinhu_refresh_token"), null);
  assert.equal(local.getItem("jinhu_refresh_token"), null);
});

test("logoutSession omits body and content type when no legacy refresh token exists", async () => {
  const { session } = installBrowserStorage();
  session.setItem("jinhu_access_token", "access-token");
  const calls = installFetchRecorder();

  await logoutSession();

  assert.equal(calls[0]?.input, "/api/v1/auth/logout-cookie");
  assert.equal(calls[1]?.input, "/api/v1/auth/logout");
  assert.equal(calls[1]?.init?.body, undefined);
  assert.equal(new Headers(calls[1]?.init?.headers).get("Content-Type"), null);
});
