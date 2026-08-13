"use client";

import type { UserContext } from "@jinhu/shared";
import { API_PREFIX, apiRequest, createIdempotencyKey } from "./api-client";
import { purgePropertyOfflineState } from "../features/property-shared/offline/property-draft-store";
import {
  propertyDataScopeFingerprint,
  propertyModuleAssignmentFingerprint
} from "../features/property-shared/offline/property-draft-contract";

const TOKEN_KEY = "jinhu_access_token";
const REFRESH_TOKEN_KEY = "jinhu_refresh_token";
const USER_KEY = "jinhu_auth_user";
const PARK_SWITCH_KEY = "jinhu_park_context_switch";

let currentUserRequest: { token: string; promise: Promise<UserContext> } | null = null;
let parkContextSwitch: { parkId: string; promise: Promise<UserContext> } | null = null;

export function getToken(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY) ?? "";
}

export function getStoredUser(): UserContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(USER_KEY) ?? localStorage.getItem(USER_KEY);
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
    setToken(token, { preserveParkSwitch: true });
    const currentUser = await fetchCurrentUser({ requestToken: token, persist: false });
    await setSession(token, currentUser, refreshToken);
    return currentUser;
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

export async function clearSession(): Promise<void> {
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

export async function logoutSession(): Promise<void> {
  const token = getToken();
  const legacyRefreshToken = getRefreshToken();
  try {
    await postLogoutCookie().catch(() => undefined);
    if (token) {
      await postLogout(token, legacyRefreshToken).catch(() => undefined);
    }
  } finally {
    await clearSession();
  }
}

export async function fetchCurrentUser(options: { requestToken?: string; persist?: boolean } = {}): Promise<UserContext> {
  const token = options.requestToken ?? getToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  if (!currentUserRequest || currentUserRequest.token !== token) {
    const promise = apiRequest<UserContext>("/users/me", { token })
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
  const switchId = crypto.randomUUID();
  localStorage.setItem(PARK_SWITCH_KEY, switchId);
  const response = await apiRequest<SwitchContextResult>("/auth/switch-context", {
    method: "POST",
    token: originalToken,
    idempotencyKey: createIdempotencyKey("park-context-switch"),
    body: { parkId }
  });
  try {
    if (!response.data.accessToken) throw new Error("切换园区响应缺少访问令牌");
    if (localStorage.getItem(PARK_SWITCH_KEY) !== switchId) throw new Error("园区切换已被新的会话操作取消");
    setToken(response.data.accessToken, { preserveParkSwitch: true });
    const nextUser = await fetchCurrentUser({ requestToken: response.data.accessToken, persist: false });
    if (nextUser.park_id !== parkId) throw new Error("切换后的园区上下文与选择不一致");
    if (localStorage.getItem(PARK_SWITCH_KEY) !== switchId) throw new Error("园区切换已被新的会话操作取消");
    await setSession(response.data.accessToken, nextUser, response.data.refreshToken, {
      expectedParkSwitchId: switchId
    });
    localStorage.removeItem(PARK_SWITCH_KEY);
    return nextUser;
  } catch (error) {
    const latestToken = getToken();
    const sharedToken = localStorage.getItem(TOKEN_KEY) ?? "";
    const newerSessionPublished = Boolean(
      (latestToken && latestToken !== originalToken && latestToken !== response.data.accessToken)
      || (sharedToken && sharedToken !== originalToken && sharedToken !== response.data.accessToken)
    );
    if (!newerSessionPublished) await logoutSession();
    else if (latestToken === response.data.accessToken && sharedToken !== latestToken) clearSessionStorageOnly();
    throw error;
  }
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
