"use client";

const API_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX ?? "/api/v1";

const TOKEN_KEY = "jinhu_access_token";
const REFRESH_TOKEN_KEY = "jinhu_refresh_token";
const USER_KEY = "jinhu_auth_user";

const AUTH_SESSION_RESET_EXCLUDED_PATHS = new Set([
  "/auth/login",
  "/auth/mobile/login",
  "/auth/wechat/callback",
  "/auth/select-context",
  "/auth/token/refresh",
  "/auth/logout-cookie"
]);

interface UnauthorizedSessionResetOptions {
  path: string;
  requestToken?: string;
  redirect?: boolean;
}

export async function handleUnauthorizedSessionReset({
  path,
  requestToken,
  redirect = true
}: UnauthorizedSessionResetOptions): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const normalizedPath = normalizeApiPath(path);
  if (AUTH_SESSION_RESET_EXCLUDED_PATHS.has(normalizedPath)) {
    return false;
  }

  const storedToken = getStoredAccessToken();
  if (requestToken) {
    if (requestToken !== storedToken) {
      return false;
    }
  } else if (storedToken) {
    return false;
  }

  clearLocalSessionStorage();
  await postLogoutCookie();
  if (redirect) {
    window.location.href = "/login";
  }
  return true;
}

export function clearLocalSessionStorage(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getStoredAccessToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY) ?? "";
}

function normalizeApiPath(path: string): string {
  const prefixedPath = path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path;
  return prefixedPath.startsWith("/") ? prefixedPath : `/${prefixedPath}`;
}

async function postLogoutCookie(): Promise<void> {
  await fetch(`${API_PREFIX}/auth/logout-cookie`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });
}
