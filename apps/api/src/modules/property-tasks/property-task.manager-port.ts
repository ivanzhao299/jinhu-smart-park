import type { EntityManagerPort } from "@jinhu/shared";
import type { EntityManager } from "typeorm";

/** Explicit ABI wrapper used when a TypeORM transaction crosses a shared port. */
export class TypeOrmPropertyTaskManagerPort implements EntityManagerPort {
  constructor(readonly transactionContext: EntityManager) {}
}

export function toPropertyTaskManagerPort(
  manager: EntityManager
): EntityManagerPort {
  return new TypeOrmPropertyTaskManagerPort(manager);
}
