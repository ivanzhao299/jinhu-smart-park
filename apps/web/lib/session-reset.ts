"use client";

const API_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX ?? "/api/v1";

const TOKEN_KEY = "jinhu_access_token";
const REFRESH_TOKEN_KEY = "jinhu_refresh_token";
const USER_KEY = "jinhu_auth_user";

const AUTH_SESSION_RESET_EXCLUDED_PATHS = new Set([
  "/auth/login",
  "/auth/mobile/send-code",
  "/auth/mobile/login",
  "/auth/wechat/authorize",
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

  if (requestToken) {
    if (!isCurrentAccessToken(requestToken)) {
      return false;
    }
  } else if (hasStoredAccessToken()) {
    return false;
  }

  clearLocalSessionStorage();
  try {
    await postLogoutCookie();
  } catch {
    // Cookie cleanup is best-effort; local session reset must still complete.
  } finally {
    if (redirect) {
      window.location.href = "/login";
    }
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

function isCurrentAccessToken(requestToken: string): boolean {
  const sessionToken = sessionStorage.getItem(TOKEN_KEY) ?? "";
  const localToken = localStorage.getItem(TOKEN_KEY) ?? "";
  if (sessionToken && localToken && sessionToken !== localToken) {
    if (localToken === requestToken) {
      clearSessionStorageOnly();
      return true;
    }
    if (sessionToken === requestToken) {
      clearSessionStorageOnly();
    }
    return false;
  }
  if (localToken && localToken !== requestToken) {
    return false;
  }
  if (sessionToken && sessionToken !== requestToken) {
    return false;
  }
  return sessionToken === requestToken || localToken === requestToken;
}

function hasStoredAccessToken(): boolean {
  return Boolean(sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY));
}

function clearSessionStorageOnly(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
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
