"use client";

import type { UserContext } from "@jinhu/shared";
import { apiRequest } from "./api-client";

const TOKEN_KEY = "jinhu_access_token";
const REFRESH_TOKEN_KEY = "jinhu_refresh_token";
const USER_KEY = "jinhu_auth_user";

let currentUserRequest: Promise<UserContext> | null = null;

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

export function setSession(token: string, user: UserContext, refreshToken?: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) {
    setRefreshToken(refreshToken);
  }
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token);
}

export function setRefreshToken(token: string): void {
  sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearSession(): void {
  currentUserRequest = null;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function fetchCurrentUser(): Promise<UserContext> {
  const token = getToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  if (!currentUserRequest) {
    currentUserRequest = apiRequest<UserContext>("/users/me", { token })
      .then((response) => {
        sessionStorage.setItem(USER_KEY, JSON.stringify(response.data));
        localStorage.setItem(USER_KEY, JSON.stringify(response.data));
        return response.data;
      })
      .finally(() => {
        currentUserRequest = null;
      });
  }
  return currentUserRequest;
}
