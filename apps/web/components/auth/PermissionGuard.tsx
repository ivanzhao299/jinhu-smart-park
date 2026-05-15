"use client";

import type { ReactNode } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { hasAccess } from "../../lib/permissions";

interface PermissionGuardProps {
  permission?: string;
  module?: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGuard({ permission, module, fallback = null, children }: PermissionGuardProps) {
  const user = useAuthUser();
  if (!hasAccess(user, permission, module)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
