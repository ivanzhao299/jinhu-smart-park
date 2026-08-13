import assert from "node:assert/strict";
import test from "node:test";
import { clearSession, fetchCurrentUser, getRefreshToken, logoutSession, setSession, switchParkContext } from "./auth";

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

type FetchCurrentUserWithOptions = (options?: { requestToken?: string; persist?: boolean }) => ReturnType<typeof fetchCurrentUser>;

test("setSession stores access token and user but removes legacy refresh token storage", async () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_refresh_token", "old-session-refresh");
  local.setItem("jinhu_refresh_token", "old-local-refresh");
  local.setItem("jinhu_park_context_switch", "stale-switch");

  await setSession("access-token", user, "new-refresh-token");

  assert.equal(session.getItem("jinhu_access_token"), "access-token");
  assert.equal(local.getItem("jinhu_access_token"), "access-token");
  assert.equal(JSON.parse(session.getItem("jinhu_auth_user") ?? "{}").username, "admin");
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").username, "admin");
  assert.equal(session.getItem("jinhu_refresh_token"), null);
  assert.equal(local.getItem("jinhu_refresh_token"), null);
  assert.equal(local.getItem("jinhu_park_context_switch"), null);
  assert.equal(getRefreshToken(), "");
});

test("clearSession removes legacy refresh token storage", async () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_access_token", "access-token");
  session.setItem("jinhu_auth_user", JSON.stringify(user));
  session.setItem("jinhu_refresh_token", "session-refresh");
  local.setItem("jinhu_access_token", "access-token");
  local.setItem("jinhu_auth_user", JSON.stringify(user));
  local.setItem("jinhu_refresh_token", "local-refresh");

  await clearSession();

  assert.equal(session.getItem("jinhu_access_token"), null);
  assert.equal(session.getItem("jinhu_auth_user"), null);
  assert.equal(session.getItem("jinhu_refresh_token"), null);
  assert.equal(local.getItem("jinhu_access_token"), null);
  assert.equal(local.getItem("jinhu_auth_user"), null);
  assert.equal(local.getItem("jinhu_refresh_token"), null);
});

test("account switch awaits the serialized offline cleanup barrier before publishing the new session", async () => {
  const { session, local } = installBrowserStorage();
  session.setItem("jinhu_auth_user", JSON.stringify(user));
  local.setItem("jinhu_auth_user", JSON.stringify(user));
  local.setItem("jinhu-property-offline-scope-v1", "old-scope");

  await setSession("new-token", { ...user, id: "00000000-0000-0000-0000-000000000002" });

  assert.equal(local.getItem("jinhu-property-offline-scope-v1"), null);
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").id, "00000000-0000-0000-0000-000000000002");
});

test("module assignment enable and expiry changes await offline purge even when permissions stay equal", async () => {
  const enabled = { module_code: "housing_rental", module_name: "住房", module_group: "property", enabled: true, expire_time: null };
  const changes = [
    { before: [], after: [enabled] },
    { before: [enabled], after: [{ ...enabled, enabled: false }] },
    { before: [enabled], after: [{ ...enabled, expire_time: "2026-12-31T00:00:00.000Z" }] }
  ];
  for (const change of changes) {
    const { session, local } = installBrowserStorage();
    const previous = { ...user, enabled_modules: change.before };
    session.setItem("jinhu_auth_user", JSON.stringify(previous));
    local.setItem("jinhu_auth_user", JSON.stringify(previous));
    local.setItem("jinhu-property-offline-scope-v1", "old-scope");
    await setSession("same-token", { ...user, enabled_modules: change.after });
    assert.equal(local.getItem("jinhu-property-offline-scope-v1"), null);
  }
});

test("same module assignments in a different order do not purge offline state", async () => {
  const { session, local } = installBrowserStorage();
  const asset = { module_code: "asset", module_name: "资产", module_group: "property", enabled: true, expire_time: null };
  const housing = { module_code: "housing_rental", module_name: "住房", module_group: "property", enabled: true, expire_time: "2026-12-31T00:00:00.000Z" };
  const previous = { ...user, enabled_modules: [asset, housing] };
  session.setItem("jinhu_auth_user", JSON.stringify(previous));
  local.setItem("jinhu_auth_user", JSON.stringify(previous));
  local.setItem("jinhu-property-offline-scope-v1", "same-scope");

  await setSession("same-token", { ...user, enabled_modules: [housing, asset] });

  assert.equal(local.getItem("jinhu-property-offline-scope-v1"), "same-scope");
});

test("granular data scope changes purge offline state while scope order does not", async () => {
  const first = { dimension: "unit", scope_type: "custom", scope_config: { unitIds: ["unit-a"] } };
  const second = { dimension: "building", scope_type: "all", scope_config: { ids: ["building-a"] } };
  {
    const { session, local } = installBrowserStorage();
    const previous = { ...user, data_scope: "custom", data_scopes: [first, second] };
    session.setItem("jinhu_auth_user", JSON.stringify(previous));
    local.setItem("jinhu_auth_user", JSON.stringify(previous));
    local.setItem("jinhu-property-offline-scope-v1", "same-scope");
    await setSession("same-token", { ...previous, data_scopes: [second, first] });
    assert.equal(local.getItem("jinhu-property-offline-scope-v1"), "same-scope");
  }
  {
    const { session, local } = installBrowserStorage();
    const previous = { ...user, data_scope: "custom", data_scopes: [first] };
    session.setItem("jinhu_auth_user", JSON.stringify(previous));
    local.setItem("jinhu_auth_user", JSON.stringify(previous));
    local.setItem("jinhu-property-offline-scope-v1", "old-scope");
    await setSession("same-token", {
      ...previous,
      data_scopes: [{ ...first, scope_config: { unitIds: ["unit-b"] } }]
    });
    assert.equal(local.getItem("jinhu-property-offline-scope-v1"), null);
  }
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

test("switchParkContext rotates context, fetches the authoritative user, and publishes the new session", async () => {
  const { session, local } = installBrowserStorage();
  const current = {
    ...user,
    park_name: "园区一",
    accessible_parks: [
      { park_id: "20000001", park_name: "园区一", is_default: true, status: "enabled" },
      { park_id: "20000002", park_name: "园区二", is_default: false, status: "enabled" }
    ]
  };
  session.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_access_token", "old-token");
  session.setItem("jinhu_auth_user", JSON.stringify(current));
  local.setItem("jinhu_auth_user", JSON.stringify(current));
  const calls: FetchCall[] = [];
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      const data = calls.length === 1
        ? { accessToken: "new-token" }
        : { ...current, park_id: "20000002", park_name: "园区二", current_park: current.accessible_parks[1] };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const next = await switchParkContext("20000002");

  assert.equal(next.park_id, "20000002");
  assert.equal(calls[0]?.input, "/api/v1/auth/switch-context");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(new Headers(calls[0]?.init?.headers).get("Authorization"), "Bearer old-token");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { parkId: "20000002" });
  assert.equal(calls[1]?.input, "/api/v1/users/me");
  assert.equal(new Headers(calls[1]?.init?.headers).get("Authorization"), "Bearer new-token");
  assert.equal(session.getItem("jinhu_access_token"), "new-token");
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").park_id, "20000002");
});

test("switchParkContext rejects a forged or disabled park before making a request", async () => {
  const { session, local } = installBrowserStorage();
  const current = {
    ...user,
    accessible_parks: [{ park_id: "20000002", park_name: "园区二", is_default: false, status: "disabled" }]
  };
  session.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_access_token", "old-token");
  session.setItem("jinhu_auth_user", JSON.stringify(current));
  local.setItem("jinhu_auth_user", JSON.stringify(current));
  const calls = installFetchRecorder();

  await assert.rejects(switchParkContext("20000002"), /不可访问或未启用/u);
  await assert.rejects(switchParkContext("forged-park"), /不可访问或未启用/u);
  assert.equal(calls.length, 0);
});

test("switchParkContext coalesces the same target and rejects a competing target", async () => {
  const { session, local } = installBrowserStorage();
  const current = {
    ...user,
    accessible_parks: [
      { park_id: "20000002", park_name: "园区二", is_default: false, status: "enabled" },
      { park_id: "20000003", park_name: "园区三", is_default: false, status: "enabled" }
    ]
  };
  session.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_access_token", "old-token");
  session.setItem("jinhu_auth_user", JSON.stringify(current));
  local.setItem("jinhu_auth_user", JSON.stringify(current));
  let releaseSwitch: (() => void) | undefined;
  let callCount = 0;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => {
      callCount += 1;
      if (callCount === 1) await new Promise<void>((resolve) => { releaseSwitch = resolve; });
      const data = callCount === 1 ? { accessToken: "new-token" } : { ...current, park_id: "20000002" };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const first = switchParkContext("20000002");
  const same = switchParkContext("20000002");
  await assert.rejects(switchParkContext("20000003"), /正在切换/u);
  assert.equal(first, same);
  assert.equal(callCount, 1);
  releaseSwitch?.();
  await first;
  assert.equal(callCount, 2);
});

test("switchParkContext revokes the rotated cookie when a concurrent session clear cancels publication", async () => {
  const { session, local } = installBrowserStorage();
  const current = {
    ...user,
    accessible_parks: [
      { park_id: "20000002", park_name: "园区二", is_default: false, status: "enabled" }
    ]
  };
  session.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_access_token", "old-token");
  session.setItem("jinhu_auth_user", JSON.stringify(current));
  local.setItem("jinhu_auth_user", JSON.stringify(current));
  const calls: FetchCall[] = [];
  let releaseSwitch: (() => void) | undefined;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      if (String(input).endsWith("/auth/switch-context")) {
        await new Promise<void>((resolve) => { releaseSwitch = resolve; });
        return new Response(JSON.stringify({ data: { accessToken: "rotated-token" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const switching = switchParkContext("20000002");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await clearSession();
  releaseSwitch?.();

  await assert.rejects(switching, /新的会话操作取消/u);
  assert.equal(calls.some((call) => call.input.endsWith("/auth/logout-cookie")), true);
  assert.equal(session.getItem("jinhu_access_token"), null);
  assert.equal(local.getItem("jinhu_access_token"), null);
  assert.equal(local.getItem("jinhu_auth_user"), null);
});

test("switchParkContext preserves a newer login when a canceled switch unwinds", async () => {
  const { session, local } = installBrowserStorage();
  const current = {
    ...user,
    accessible_parks: [
      { park_id: "20000002", park_name: "园区二", is_default: false, status: "enabled" }
    ]
  };
  session.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_access_token", "old-token");
  session.setItem("jinhu_auth_user", JSON.stringify(current));
  local.setItem("jinhu_auth_user", JSON.stringify(current));
  const calls: FetchCall[] = [];
  let releaseSwitch: (() => void) | undefined;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      await new Promise<void>((resolve) => { releaseSwitch = resolve; });
      return new Response(JSON.stringify({ data: { accessToken: "rotated-token" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const switching = switchParkContext("20000002");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await clearSession();
  const newerUser = { ...user, id: "00000000-0000-0000-0000-000000000099", username: "new-login" };
  await setSession("new-login-token", newerUser);
  releaseSwitch?.();

  await assert.rejects(switching, /新的会话操作取消/u);
  assert.equal(calls.some((call) => call.input.endsWith("/auth/logout-cookie")), false);
  assert.equal(session.getItem("jinhu_access_token"), "new-login-token");
  assert.equal(local.getItem("jinhu_access_token"), "new-login-token");
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").username, "new-login");
});

test("switchParkContext preserves a newer cross-tab login after publishing its private rotated token", async () => {
  const { session, local } = installBrowserStorage();
  const current = {
    ...user,
    accessible_parks: [
      { park_id: "20000002", park_name: "园区二", is_default: false, status: "enabled" }
    ]
  };
  session.setItem("jinhu_access_token", "old-token");
  local.setItem("jinhu_access_token", "old-token");
  session.setItem("jinhu_auth_user", JSON.stringify(current));
  local.setItem("jinhu_auth_user", JSON.stringify(current));
  const calls: FetchCall[] = [];
  let releaseCurrentUser: (() => void) | undefined;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      if (String(input).endsWith("/auth/switch-context")) {
        return new Response(JSON.stringify({ data: { accessToken: "rotated-token" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      await new Promise<void>((resolve) => { releaseCurrentUser = resolve; });
      return new Response(JSON.stringify({ data: { ...current, park_id: "20000002" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const switching = switchParkContext("20000002");
  while (calls.length < 2) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  local.setItem("jinhu_access_token", "cross-tab-login-token");
  local.setItem("jinhu_auth_user", JSON.stringify({ ...user, username: "cross-tab-login" }));
  local.removeItem("jinhu_park_context_switch");
  releaseCurrentUser?.();

  await assert.rejects(switching, /新的会话操作取消/u);
  assert.equal(calls.some((call) => call.input.endsWith("/auth/logout-cookie")), false);
  assert.equal(session.getItem("jinhu_access_token"), null);
  assert.equal(session.getItem("jinhu_auth_user"), null);
  assert.equal(local.getItem("jinhu_access_token"), "cross-tab-login-token");
  assert.equal(JSON.parse(local.getItem("jinhu_auth_user") ?? "{}").username, "cross-tab-login");
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
