import type { ApiResponse } from "@jinhu/shared";

export const API_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly response?: ApiResponse<unknown>
  ) {
    super(message);
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  token?: string;
  idempotencyKey?: string;
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  if (options.idempotencyKey) {
    headers.set("X-Idempotency-Key", options.idempotencyKey);
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    credentials: "include",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const payload = (await readApiResponse<T>(response));
  if (!response.ok) {
    handleUnauthorized(response.status, path);
    throw new ApiError(payload?.message ?? "Request failed", response.status, payload);
  }

  if (!payload) {
    throw new ApiError("Invalid API response payload", response.status);
  }

  return payload;
}

export interface ApiFormRequestOptions extends Omit<RequestInit, "body"> {
  token?: string;
  idempotencyKey?: string;
  body: FormData;
}

export async function apiFormRequest<T>(path: string, options: ApiFormRequestOptions): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  if (options.idempotencyKey) {
    headers.set("X-Idempotency-Key", options.idempotencyKey);
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    credentials: "include",
    headers,
    body: options.body
  });

  const payload = await readApiResponse<T>(response);
  if (!response.ok) {
    handleUnauthorized(response.status, path);
    throw new ApiError(payload?.message ?? "Request failed", response.status, payload);
  }
  if (!payload) {
    throw new ApiError("Invalid API response payload", response.status);
  }
  return payload;
}

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function handleUnauthorized(status: number, path: string): void {
  if (status !== 401 || typeof window === "undefined") {
    return;
  }
  clearLocalSessionStorage();
  if (shouldClearRefreshCookieOnUnauthorized(path)) {
    void postLogoutCookie().catch(() => undefined);
  }
  window.location.href = "/login";
}

function clearLocalSessionStorage(): void {
  sessionStorage.removeItem("jinhu_access_token");
  sessionStorage.removeItem("jinhu_refresh_token");
  sessionStorage.removeItem("jinhu_auth_user");
  localStorage.removeItem("jinhu_access_token");
  localStorage.removeItem("jinhu_refresh_token");
  localStorage.removeItem("jinhu_auth_user");
}

function shouldClearRefreshCookieOnUnauthorized(path: string): boolean {
  const normalizedPath = normalizeApiPath(path);
  return normalizedPath !== "/auth/token/refresh" && normalizedPath !== "/auth/logout-cookie";
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

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T> | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  return response.json().catch(() => undefined) as Promise<ApiResponse<T> | undefined>;
}
