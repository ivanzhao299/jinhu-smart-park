"use client";

import type { UserContext } from "@jinhu/shared";
import { apiRequest } from "./api-client";

const TOKEN_KEY = "jinhu_access_token";
const USER_KEY = "jinhu_auth_user";

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

export function setSession(token: string, user: UserContext): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function fetchCurrentUser(): Promise<UserContext> {
  const token = getToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  const response = await apiRequest<UserContext>("/users/me", { token });
  sessionStorage.setItem(USER_KEY, JSON.stringify(response.data));
  localStorage.setItem(USER_KEY, JSON.stringify(response.data));
  return response.data;
}
