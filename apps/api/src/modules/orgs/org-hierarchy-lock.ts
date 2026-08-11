import type { EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";

export async function lockOrgHierarchy(manager: EntityManager, scope: TenantParkScope): Promise<void> {
  await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `org-hierarchy:${scope.tenantId}:${scope.parkId}`
  ]);
}
