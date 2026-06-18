import assert from "node:assert/strict";
import test from "node:test";
import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import {
  applyRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshCookieConfig,
  readRefreshTokenCookie
} from "./auth-refresh-cookie";
import type { LoginResult, WechatCallbackResult } from "./auth.service";
import type { RefreshTokenDto } from "./dto/refresh-token.dto";

interface CookieCall {
  name: string;
  value?: string;
  options: Record<string, unknown>;
}

interface ControllerFixture {
  controller: AuthController;
  authService: {
    refreshTokens: string[];
    logoutTokens: Array<string | undefined>;
    logoutCookieTokens: string[];
    logoutCookieError: Error | null;
    refreshError: Error | null;
    wechatCallback: () => Promise<WechatCallbackResult>;
  };
  response: {
    cookieCalls: CookieCall[];
    clearCookieCalls: CookieCall[];
  };
}

function createConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback
  };
}

function createResponse(): ControllerFixture["response"] {
  return {
    cookieCalls: [],
    clearCookieCalls: [],
    cookie(name: string, value: string, options: Record<string, unknown>) {
      this.cookieCalls.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      this.clearCookieCalls.push({ name, options });
      return this;
    }
  } as ControllerFixture["response"];
}

function createRequest(cookie?: string) {
  return {
    headers: {
      "user-agent": "node-test",
      ...(cookie ? { cookie } : {})
    },
    ip: "127.0.0.1"
  };
}

function loginResult(refreshToken = "refresh-next"): LoginResult {
  return {
    accessToken: "access-token",
    refreshToken,
    tokenType: "Bearer",
    expiresIn: "8h",
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      username: "admin",
      realName: "Admin",
      tenantId: "10000001",
      parkId: "20000001",
      roles: [],
      permissions: ["system:user:me"],
      data_scope: "all",
      is_super: true
    }
  };
}

function createFixture(config: Record<string, string> = {}): ControllerFixture {
  const authService = {
    refreshTokens: [] as string[],
    logoutTokens: [] as Array<string | undefined>,
    logoutCookieTokens: [] as string[],
    logoutCookieError: null,
    refreshError: null,
    login: async () => loginResult("login-refresh"),
    mobileLogin: async () => loginResult("mobile-refresh"),
    selectContext: async () => loginResult("context-refresh"),
    wechatCallback: async () => loginResult("wechat-refresh"),
    refresh: async (dto: RefreshTokenDto) => {
      authService.refreshTokens.push(dto.refreshToken!);
      if (authService.refreshError) {
        throw authService.refreshError;
      }
      return loginResult("rotated-refresh");
    },
    logout: async (_user: unknown, refreshToken?: string) => {
      authService.logoutTokens.push(refreshToken);
      return { userId: "00000000-0000-0000-0000-000000000001" };
    },
    logoutRefreshToken: async (refreshToken: string) => {
      authService.logoutCookieTokens.push(refreshToken);
      if (authService.logoutCookieError) {
        throw authService.logoutCookieError;
      }
    },
    isSmsLoginEnabled: () => false,
    isWechatLoginEnabled: () => false
  };
  const response = createResponse();
  const controller = new AuthController(
    authService as never,
    { getCurrentUserContext: async () => ({}) } as never,
    { getId: () => "request-id" } as never,
    {
      assertAllowed: () => undefined,
      assertStableAllowed: () => undefined
    } as never,
    createConfig(config) as never
  );
  return { controller, authService, response };
}

test("refresh cookie config defaults to HttpOnly path-scoped Lax cookie", () => {
  const config = getRefreshCookieConfig(createConfig({ AUTH_REFRESH_EXPIRES_DAYS: "30", API_PREFIX: "api/v1" }) as never);

  assert.equal(config.name, "sp_refresh_token");
  assert.equal(config.path, "/api/v1/auth");
  assert.equal(config.httpOnly, true);
  assert.equal(config.secure, false);
  assert.equal(config.sameSite, "lax");
  assert.equal(config.maxAgeMs, 30 * 24 * 60 * 60 * 1000);
  assert.equal(config.domain, undefined);
  assert.equal(config.bodyCompat, true);
});

test("refresh cookie path derives from API prefix when explicit path is empty", () => {
  const config = getRefreshCookieConfig(
    createConfig({
      API_PREFIX: "api/private",
      AUTH_REFRESH_COOKIE_PATH: ""
    }) as never
  );

  assert.equal(config.path, "/api/private/auth");
});

test("refresh cookie path honors explicit override", () => {
  const config = getRefreshCookieConfig(
    createConfig({
      API_PREFIX: "api/private",
      AUTH_REFRESH_COOKIE_PATH: "/custom/auth"
    }) as never
  );

  assert.equal(config.path, "/custom/auth");
});

test("refresh cookie SameSite=None forces Secure", () => {
  const config = getRefreshCookieConfig(
    createConfig({
      AUTH_REFRESH_COOKIE_SAMESITE: "none",
      AUTH_REFRESH_COOKIE_SECURE: "false"
    }) as never
  );

  assert.equal(config.sameSite, "none");
  assert.equal(config.secure, true);
});

test("refresh token cookie parser reads only the configured cookie", () => {
  const config = getRefreshCookieConfig(createConfig({ AUTH_REFRESH_COOKIE_NAME: "sp_refresh_token" }) as never);

  assert.equal(readRefreshTokenCookie(createRequest("other=abc; sp_refresh_token=cookie-token") as never, config), "cookie-token");
  assert.equal(readRefreshTokenCookie(createRequest("other=abc") as never, config), null);
});

test("login sets HttpOnly refresh cookie while keeping body refresh token during compatibility", async () => {
  const { controller, response } = createFixture();

  const result = await controller.login({ username: "admin", password: "Correct#2026" }, createRequest() as never, response as never);

  assert.equal(result.refreshToken, "login-refresh");
  assert.deepEqual(response.cookieCalls, [
    {
      name: "sp_refresh_token",
      value: "login-refresh",
      options: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 30 * 24 * 60 * 60 * 1000
      }
    }
  ]);
});

test("select-context sets refresh cookie", async () => {
  const { controller, response } = createFixture();

  const result = await controller.selectContext(
    { ticket: "ticket", tenantId: "10000001", parkId: "20000001", userId: "00000000-0000-0000-0000-000000000001" },
    createRequest() as never,
    response as never
  );

  assert.equal(result.refreshToken, "context-refresh");
  assert.equal(response.cookieCalls[0]?.value, "context-refresh");
});

test("mobile login sets refresh cookie", async () => {
  const { controller, response } = createFixture();

  const result = await controller.mobileLogin(
    { tenantId: "10000001", parkId: "20000001", mobile: "13800000000", code: "123456" },
    createRequest() as never,
    response as never
  );

  assert.equal(result.refreshToken, "mobile-refresh");
  assert.equal(response.cookieCalls[0]?.value, "mobile-refresh");
});

test("wechat callback direct login sets refresh cookie", async () => {
  const { controller, response } = createFixture();

  const result = await controller.wechatCallback(
    { state: "state", code: "code" },
    createRequest() as never,
    response as never
  );

  assert.equal(result.refreshToken, "wechat-refresh");
  assert.equal(response.cookieCalls[0]?.value, "wechat-refresh");
});

test("wechat callback without refresh token does not set refresh cookie", async () => {
  const { controller, authService, response } = createFixture();
  authService.wechatCallback = async () => ({
    requiresIdentityBinding: true,
    bindTicket: "bind-ticket",
    provider: "wechat_open",
    profile: { nickname: "Tester", avatarUrl: null }
  });

  const result = await controller.wechatCallback(
    { state: "state", code: "code" },
    createRequest() as never,
    response as never
  );

  assert.equal(result.requiresIdentityBinding, true);
  assert.equal(response.cookieCalls.length, 0);
});

test("refresh accepts matching cookie and body tokens and rotates the cookie", async () => {
  const { controller, authService, response } = createFixture();

  const result = await controller.refresh(
    { refreshToken: "cookie-refresh" },
    createRequest("sp_refresh_token=cookie-refresh") as never,
    response as never
  );

  assert.equal(result.refreshToken, "rotated-refresh");
  assert.deepEqual(authService.refreshTokens, ["cookie-refresh"]);
  assert.equal(response.cookieCalls[0]?.value, "rotated-refresh");
});

test("refresh falls back to body token when cookie is absent", async () => {
  const { controller, authService, response } = createFixture();

  await controller.refresh({ refreshToken: "body-refresh" }, createRequest() as never, response as never);

  assert.deepEqual(authService.refreshTokens, ["body-refresh"]);
  assert.equal(response.cookieCalls[0]?.value, "rotated-refresh");
});

test("refresh rejects body fallback when body compatibility is disabled", async () => {
  const { controller, authService, response } = createFixture({ AUTH_REFRESH_TOKEN_BODY_COMPAT: "false" });

  await assert.rejects(
    () => controller.refresh({ refreshToken: "body-refresh" }, createRequest() as never, response as never),
    UnauthorizedException
  );

  assert.deepEqual(authService.refreshTokens, []);
  assert.equal(response.cookieCalls.length, 0);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("refresh rejects mismatched cookie and body tokens and clears cookie", async () => {
  const { controller, response } = createFixture();

  await assert.rejects(
    () => controller.refresh({ refreshToken: "body-refresh" }, createRequest("sp_refresh_token=cookie-refresh") as never, response as never),
    UnauthorizedException
  );

  assert.equal(response.cookieCalls.length, 0);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("refresh unauthorized failure preserves the refresh cookie", async () => {
  const { controller, authService, response } = createFixture();
  authService.refreshError = new UnauthorizedException("Refresh token expired");

  await assert.rejects(
    () => controller.refresh({}, createRequest("sp_refresh_token=cookie-refresh") as never, response as never),
    UnauthorizedException
  );

  assert.equal(response.clearCookieCalls.length, 0);
});

test("refresh server failure preserves the refresh cookie", async () => {
  const { controller, authService, response } = createFixture();
  authService.refreshError = new InternalServerErrorException("database unavailable");

  await assert.rejects(
    () => controller.refresh({}, createRequest("sp_refresh_token=cookie-refresh") as never, response as never),
    InternalServerErrorException
  );

  assert.equal(response.clearCookieCalls.length, 0);
});

test("refresh missing token clears the refresh cookie", async () => {
  const { controller, response } = createFixture();

  await assert.rejects(
    () => controller.refresh({}, createRequest() as never, response as never),
    UnauthorizedException
  );

  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("logout uses cookie token and clears cookie", async () => {
  const { controller, authService, response } = createFixture();

  const result = await controller.logout(
    { sub: "00000000-0000-0000-0000-000000000001", tenantId: "10000001", parkId: "20000001" } as never,
    { refreshToken: "body-refresh" },
    createRequest("sp_refresh_token=cookie-refresh") as never,
    response as never
  );

  assert.deepEqual(result, { userId: "00000000-0000-0000-0000-000000000001" });
  assert.deepEqual(authService.logoutTokens, ["cookie-refresh", "body-refresh"]);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("logout revokes matching cookie and body token only once", async () => {
  const { controller, authService, response } = createFixture();

  await controller.logout(
    { sub: "00000000-0000-0000-0000-000000000001", tenantId: "10000001", parkId: "20000001" } as never,
    { refreshToken: "same-refresh" },
    createRequest("sp_refresh_token=same-refresh") as never,
    response as never
  );

  assert.deepEqual(authService.logoutTokens, ["same-refresh"]);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("logout falls back to body token when cookie is absent", async () => {
  const { controller, authService, response } = createFixture();

  await controller.logout(
    { sub: "00000000-0000-0000-0000-000000000001", tenantId: "10000001", parkId: "20000001" } as never,
    { refreshToken: "body-refresh" },
    createRequest() as never,
    response as never
  );

  assert.deepEqual(authService.logoutTokens, ["body-refresh"]);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("logout ignores body token when body compatibility is disabled", async () => {
  const { controller, authService, response } = createFixture({ AUTH_REFRESH_TOKEN_BODY_COMPAT: "false" });

  await controller.logout(
    { sub: "00000000-0000-0000-0000-000000000001", tenantId: "10000001", parkId: "20000001" } as never,
    { refreshToken: "body-refresh" },
    createRequest() as never,
    response as never
  );

  assert.deepEqual(authService.logoutTokens, [undefined]);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("public cookie logout revokes cookie token and clears cookie without current user", async () => {
  const { controller, authService, response } = createFixture();

  const result = await controller.logoutCookie(
    createRequest("sp_refresh_token=cookie-refresh") as never,
    response as never
  );

  assert.deepEqual(result, { cleared: true });
  assert.deepEqual(authService.logoutCookieTokens, ["cookie-refresh"]);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("public cookie logout clears cookie when no token exists", async () => {
  const { controller, authService, response } = createFixture();

  const result = await controller.logoutCookie(createRequest() as never, response as never);

  assert.deepEqual(result, { cleared: true });
  assert.deepEqual(authService.logoutCookieTokens, []);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("public cookie logout hides revoke failures while clearing cookie", async () => {
  const { controller, authService, response } = createFixture();
  authService.logoutCookieError = new UnauthorizedException("Refresh token expired");

  const result = await controller.logoutCookie(
    createRequest("sp_refresh_token=cookie-refresh") as never,
    response as never
  );

  assert.deepEqual(result, { cleared: true });
  assert.deepEqual(authService.logoutCookieTokens, ["cookie-refresh"]);
  assert.equal(response.clearCookieCalls[0]?.name, "sp_refresh_token");
});

test("body compatibility can be disabled while still setting cookie", () => {
  const response = createResponse();
  const config = getRefreshCookieConfig(createConfig({ AUTH_REFRESH_TOKEN_BODY_COMPAT: "false" }) as never);

  const result = applyRefreshTokenCookie(loginResult("cookie-only-refresh"), response as never, config);

  assert.equal(result.refreshToken, undefined);
  assert.equal(response.cookieCalls[0]?.value, "cookie-only-refresh");
});

test("clear refresh cookie uses the same path and domain scope", () => {
  const response = createResponse();
  const config = getRefreshCookieConfig(
    createConfig({
      AUTH_REFRESH_COOKIE_DOMAIN: ".example.com",
      AUTH_REFRESH_COOKIE_PATH: "/api/v1/auth"
    }) as never
  );

  clearRefreshTokenCookie(response as never, config);

  assert.deepEqual(response.clearCookieCalls, [
    {
      name: "sp_refresh_token",
      options: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
        domain: ".example.com"
      }
    }
  ]);
});
