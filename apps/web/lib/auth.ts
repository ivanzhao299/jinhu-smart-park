"use client";

import type { UserContext } from "@jinhu/shared";
import { API_PREFIX, ApiError, apiRequest, createIdempotencyKey } from "./api-client";
import { purgePropertyOfflineState } from "../features/property-shared/offline/property-draft-store";
import {
  propertyDataScopeFingerprint,
  propertyModuleAssignmentFingerprint
} from "../features/property-shared/offline/property-draft-contract";

const TOKEN_KEY = "jinhu_access_token";
const REFRESH_TOKEN_KEY = "jinhu_refresh_token";
const USER_KEY = "jinhu_auth_user";
const PARK_SWITCH_KEY = "jinhu_park_context_switch";
const AUTH_CONTEXT_SWITCH_ROTATION_HEADER = "X-Auth-Context-Switch-Rotation";
const AUTH_CONTEXT_SWITCH_ROTATION_NOT_STARTED = "not-started";

let currentUserRequest: { token: string; promise: Promise<UserContext> } | null = null;
let parkContextSwitch: { parkId: string; promise: Promise<UserContext> } | null = null;

export function getToken(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function getStoredUser(): UserContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserContext;
  } catch {
    return null;
  }
}

export function getRefreshToken(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? localStorage.getItem(REFRESH_TOKEN_KEY) ?? "";
}

export async function setSession(
  token: string,
  user: UserContext,
  _refreshToken?: string,
  options: { expectedParkSwitchId?: string } = {}
): Promise<void> {
  if (!options.expectedParkSwitchId) localStorage.removeItem(PARK_SWITCH_KEY);
  const previous = getStoredUser();
  if (previous && sessionScope(previous) !== sessionScope(user)) {
    await purgePropertyOfflineState();
  }
  if (options.expectedParkSwitchId && localStorage.getItem(PARK_SWITCH_KEY) !== options.expectedParkSwitchId) {
    throw new Error("园区切换已被新的会话操作取消");
  }
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem(PARK_SWITCH_KEY);
  removeRefreshTokenStorage();
}

export async function completeLoginSession(
  token: string,
  refreshToken?: string,
  options: { lockAlreadyHeld?: boolean } = {}
): Promise<UserContext> {
  const publish = async () => {
    localStorage.removeItem(PARK_SWITCH_KEY);
    try {
      const currentUser = await fetchCurrentUser({ requestToken: token, persist: false, skipUnauthorizedReset: true });
      await setSession(token, currentUser, refreshToken);
      return currentUser;
    } catch (error) {
      await logoutSession({ lockAlreadyHeld: true });
      throw error;
    }
  };
  return options.lockAlreadyHeld ? publish() : withAuthSessionLock(publish);
}

export function withAuthSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  return withCrossTabParkSwitchLock(operation);
}

export function setToken(token: string, options: { preserveParkSwitch?: boolean } = {}): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token);
  if (!options.preserveParkSwitch) localStorage.removeItem(PARK_SWITCH_KEY);
}

export function setRefreshToken(token: string): void {
  void token;
  removeRefreshTokenStorage();
}

export async function clearSession(options: { lockAlreadyHeld?: boolean } = {}): Promise<void> {
  const clear = async () => {
    currentUserRequest = null;
    parkContextSwitch = null;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PARK_SWITCH_KEY);
    await purgePropertyOfflineState();
  };
  return options.lockAlreadyHeld ? clear() : withAuthSessionLock(clear);
}

function sessionScope(user: UserContext): string {
  return JSON.stringify([
    user.id,
    user.tenant_id,
    user.park_id,
    propertyDataScopeFingerprint(user.data_scope, user.data_scopes),
    [...user.permissions].sort(),
    propertyModuleAssignmentFingerprint(user.enabled_modules)
  ]);
}

export async function logoutSession(options: { lockAlreadyHeld?: boolean } = {}): Promise<void> {
  const logout = async () => {
    const token = getToken();
    const legacyRefreshToken = getRefreshToken();
    try {
      await postLogoutCookie().catch(() => undefined);
      if (token) {
        await postLogout(token, legacyRefreshToken).catch(() => undefined);
      }
    } finally {
      await clearSession({ lockAlreadyHeld: true });
    }
  };
  return options.lockAlreadyHeld ? logout() : withAuthSessionLock(logout);
}

export async function fetchCurrentUser(options: { requestToken?: string; persist?: boolean; skipUnauthorizedReset?: boolean } = {}): Promise<UserContext> {
  const token = options.requestToken ?? getToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  if (!currentUserRequest || currentUserRequest.token !== token) {
    const promise = apiRequest<UserContext>("/users/me", { token, skipUnauthorizedReset: options.skipUnauthorizedReset })
      .then(async (response) => {
        if (options.persist !== false && token === getToken()) {
          const previous = getStoredUser();
          if (previous && sessionScope(previous) !== sessionScope(response.data)) {
            await purgePropertyOfflineState();
          }
        }
        if (options.persist !== false && token === getToken()) {
          sessionStorage.setItem(USER_KEY, JSON.stringify(response.data));
          localStorage.setItem(USER_KEY, JSON.stringify(response.data));
        }
        return response.data;
      })
      .finally(() => {
        if (currentUserRequest?.token === token) {
          currentUserRequest = null;
        }
      });
    currentUserRequest = { token, promise };
  }
  return currentUserRequest.promise;
}

interface SwitchContextResult {
  accessToken?: string;
  refreshToken?: string;
}

export function switchParkContext(parkId: string): Promise<UserContext> {
  if (parkContextSwitch) {
    if (parkContextSwitch.parkId === parkId) return parkContextSwitch.promise;
    return Promise.reject(new Error("园区上下文正在切换，请稍后重试"));
  }
  const promise = withCrossTabParkSwitchLock(() => performParkContextSwitch(parkId)).finally(() => {
    if (parkContextSwitch?.promise === promise) parkContextSwitch = null;
  });
  parkContextSwitch = { parkId, promise };
  return promise;
}

async function performParkContextSwitch(parkId: string): Promise<UserContext> {
  const current = getStoredUser();
  if (!parkId || !current) throw new Error("园区上下文不可用，请重新登录");
  if (current.park_id === parkId) return current;
  const target = current.accessible_parks?.find((park) => park.park_id === parkId);
  if (!target || target.status !== "enabled") throw new Error("所选园区不可访问或未启用");
  const originalToken = getToken();
  const originalSharedToken = localStorage.getItem(TOKEN_KEY) ?? "";
  const switchId = crypto.randomUUID();
  localStorage.setItem(PARK_SWITCH_KEY, switchId);
  let response: { data: SwitchContextResult } | undefined;
  try {
    const legacyRefreshToken = getValidLegacyRefreshTokenForSwitch();
    const body: { parkId: string; refreshToken?: string } = { parkId };
    if (legacyRefreshToken) body.refreshToken = legacyRefreshToken;
    response = await apiRequest<SwitchContextResult>("/auth/switch-context", {
      method: "POST",
      token: originalToken,
      idempotencyKey: createIdempotencyKey("park-context-switch"),
      body
    });
    if (!response.data.accessToken) throw new Error("切换园区响应缺少访问令牌");
    if (localStorage.getItem(PARK_SWITCH_KEY) !== switchId) throw new Error("园区切换已被新的会话操作取消");
    const nextUser = await fetchCurrentUser({ requestToken: response.data.accessToken, persist: false, skipUnauthorizedReset: true });
    if (nextUser.park_id !== parkId) throw new Error("切换后的园区上下文与选择不一致");
    if (localStorage.getItem(PARK_SWITCH_KEY) !== switchId) throw new Error("园区切换已被新的会话操作取消");
    await setSession(response.data.accessToken, nextUser, response.data.refreshToken, {
      expectedParkSwitchId: switchId
    });
    localStorage.removeItem(PARK_SWITCH_KEY);
    return nextUser;
  } catch (error) {
    const rotatedToken = response?.data.accessToken;
    if (!rotatedToken && isDefiniteSwitchRejection(error)) {
      if (localStorage.getItem(PARK_SWITCH_KEY) === switchId) {
        localStorage.removeItem(PARK_SWITCH_KEY);
      }
      const sharedToken = localStorage.getItem(TOKEN_KEY) ?? "";
      const privateToken = sessionStorage.getItem(TOKEN_KEY) ?? "";
      const sharedSessionCleared = !sharedToken && originalSharedToken === originalToken;
      if (
        privateToken
        && (
          sharedSessionCleared
          || (sharedToken && privateToken !== sharedToken)
        )
      ) {
        clearSessionStorageOnly();
      }
      throw error;
    }
    const latestToken = getToken();
    const sharedToken = localStorage.getItem(TOKEN_KEY) ?? "";
    const privateToken = sessionStorage.getItem(TOKEN_KEY) ?? "";
    const newerSessionPublished = Boolean(
      (latestToken && latestToken !== originalToken && latestToken !== rotatedToken)
      || (sharedToken && sharedToken !== originalToken && sharedToken !== rotatedToken)
    );
    if (!newerSessionPublished) await logoutSession({ lockAlreadyHeld: true });
    else if (privateToken && privateToken !== sharedToken) clearSessionStorageOnly();
    throw error;
  }
}

function isDefiniteSwitchRejection(error: unknown): boolean {
  return error instanceof ApiError
    && error.headers?.get(AUTH_CONTEXT_SWITCH_ROTATION_HEADER) === AUTH_CONTEXT_SWITCH_ROTATION_NOT_STARTED;
}

function isValidLegacyRefreshToken(token: string | null): token is string {
  return typeof token === "string" && token.length >= 32 && token.length <= 256;
}

function getValidLegacyRefreshTokenForSwitch(): string {
  const sessionToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  if (isValidLegacyRefreshToken(sessionToken)) return sessionToken;
  const localToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (isValidLegacyRefreshToken(localToken)) return localToken;
  return "";
}

function clearSessionStorageOnly(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

async function withCrossTabParkSwitchLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("jinhu-park-context-switch", operation);
  }
  return operation();
}

function removeRefreshTokenStorage(): void {
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function postLogout(token: string, legacyRefreshToken: string): Promise<void> {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Idempotency-Key", createIdempotencyKey("logout"));
  if (legacyRefreshToken) {
    headers.set("Content-Type", "application/json");
  }
  await fetch(`${API_PREFIX}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers,
    body: legacyRefreshToken ? JSON.stringify({ refreshToken: legacyRefreshToken }) : undefined
  });
}

async function postLogoutCookie(): Promise<void> {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  await fetch(`${API_PREFIX}/auth/logout-cookie`, {
    method: "POST",
    credentials: "include",
    headers
  });
}
