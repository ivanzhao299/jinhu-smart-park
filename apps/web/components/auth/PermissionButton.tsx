"use client";

import { Children, isValidElement, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";

interface PermissionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  permission: string;
  children: ReactNode;
}

function hasReadableText(children: ReactNode): boolean {
  return Children.toArray(children).some((child) => {
    if (typeof child === "string" || typeof child === "number") {
      return String(child).trim().length > 0;
    }
    if (!isValidElement(child)) return false;
    return hasReadableText((child.props as { children?: ReactNode }).children);
  });
}

export function PermissionButton({ permission, children, ...props }: PermissionButtonProps) {
  const user = useAuthUser();
  if (!hasPermission(user, permission)) {
    return null;
  }
  const label = props["aria-label"] || props.title || "";
  const shouldShowLabel = label && !hasReadableText(children);
  return (
    <button {...props}>
      {children}
      {shouldShowLabel ? <span className="ds-row-action-label">{label}</span> : null}
    </button>
  );
}
