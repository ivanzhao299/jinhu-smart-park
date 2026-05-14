"use client";

import { createContext, useContext } from "react";
import type { UserContext } from "@jinhu/shared";

export const AuthUserContext = createContext<UserContext | null>(null);

export function useAuthUser(): UserContext | null {
  return useContext(AuthUserContext);
}
