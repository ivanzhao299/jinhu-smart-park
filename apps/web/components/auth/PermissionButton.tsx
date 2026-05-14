"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";

interface PermissionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  permission: string;
  children: ReactNode;
}

export function PermissionButton({ permission, children, ...props }: PermissionButtonProps) {
  const user = useAuthUser();
  if (!hasPermission(user, permission)) {
    return null;
  }
  return <button {...props}>{children}</button>;
}
