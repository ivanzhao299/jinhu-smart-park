"use client";

import type { ReactNode } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";

interface PermissionGuardProps {
  permission?: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGuard({ permission, fallback = null, children }: PermissionGuardProps) {
  const user = useAuthUser();
  if (!hasPermission(user, permission)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
