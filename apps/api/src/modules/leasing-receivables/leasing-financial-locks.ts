import type { EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { LeasingReceivableEntity } from "./entities/leasing-receivable.entity";

export function loadLeasingReceivables(
  manager: EntityManager,
  scope: TenantParkScope,
  receivableIds: string[],
  lock: boolean
): Promise<LeasingReceivableEntity[]> {
  if (receivableIds.length === 0) return Promise.resolve([]);
  const builder = manager.getRepository(LeasingReceivableEntity)
    .createQueryBuilder("receivable")
    .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
    .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
    .andWhere("receivable.id IN (:...receivableIds)", {
      receivableIds: [...new Set(receivableIds)].sort()
    })
    .andWhere("receivable.is_deleted = false")
    .orderBy("receivable.id", "ASC");
  if (lock) builder.setLock("pessimistic_write");
  return builder.getMany();
}

export function lockLeasingReceivables(
  manager: EntityManager,
  scope: TenantParkScope,
  receivableIds: string[]
): Promise<LeasingReceivableEntity[]> {
  return loadLeasingReceivables(manager, scope, receivableIds, true);
}
