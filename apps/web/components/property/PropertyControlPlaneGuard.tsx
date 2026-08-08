import { PermissionGuard } from "../auth/PermissionGuard";
import type { ReactNode } from "react";

export function PropertyControlPlaneGuard({ children, permissions }: {
  children: ReactNode;
  permissions: readonly string[];
}) {
  const fallback = <main className="ds-page"><section className="ds-panel"><h1>无权访问</h1>
    <p>当前账号缺少此控制面所需的产品模块或精确权限。</p></section></main>;
  return <PermissionGuard module="asset" fallback={fallback}>
    {permissions.reduceRight<ReactNode>((content, permission) =>
      <PermissionGuard fallback={fallback} key={permission} permission={permission}>{content}</PermissionGuard>, children)}
  </PermissionGuard>;
}
