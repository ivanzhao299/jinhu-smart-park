"use client";

import { createContext, useContext } from "react";
import type { UserContext } from "@jinhu/shared";

export const AuthUserContext = createContext<UserContext | null>(null);
export const AuthSessionActionsContext = createContext<{
  publishUser: (user: UserContext, options?: { remountScopedPages?: boolean }) => void;
} | null>(null);

export function useAuthUser(): UserContext | null {
  return useContext(AuthUserContext);
}

export function useAuthSessionActions() {
  return useContext(AuthSessionActionsContext);
}
