import { ConflictException, NotFoundException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { DEFAULT_PLATFORM_SCOPE } from "../../shared/constants/platform-scope";
import { ParkEntity } from "../parks/entities/park.entity";
import { ensureTenantAssetRuntimeControls } from "../tenants/tenant-asset-runtime-controls";
import { AssetParkEntity } from "./entities/asset-park.entity";

export function assetScopeLockKey(scope: TenantParkScope): string {
  return `tenant-asset-park:${scope.tenantId}:${scope.parkId}`;
}

export async function lockAssetScope(manager: EntityManager, scope: TenantParkScope): Promise<void> {
  await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [assetScopeLockKey(scope)]);
}

export async function ensureAssetScopeProvisioned(
  manager: EntityManager,
  scope: TenantParkScope,
  actorId: string
): Promise<void> {
  await lockAssetScope(manager, scope);
  const source = await resolveCanonicalAssetParkSource(manager, scope);
  const repository = manager.getRepository(AssetParkEntity);
  const existingRows = await repository.find({
    where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
    order: { createTime: "ASC", id: "ASC" }
  });
  if (existingRows.length > 1) throw new ConflictException("Asset park projection is ambiguous");
  const projection = existingRows[0] ?? repository.create({
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    sortOrder: 0,
    createBy: actorId,
    remark: "Tenant asset park projection"
  });
  Object.assign(projection, {
    parkCode: source.parkCode,
    parkName: source.parkName,
    address: source.address,
    totalArea: source.totalArea,
    status: "enabled",
    updateBy: actorId
  });
  await repository.save(projection);
  await ensureTenantAssetRuntimeControls(manager, scope);
}

export async function resolveCanonicalAssetParkSource(
  manager: EntityManager,
  scope: TenantParkScope
): Promise<ParkEntity> {
  const parkRepository = manager.getRepository(ParkEntity);
  const exactSources = await parkRepository.find({
    where: { tenantId: scope.tenantId, parkId: scope.parkId, status: 1, isDeleted: false },
    order: { createTime: "ASC", id: "ASC" }
  });
  let source = exactSources.length === 1 ? exactSources[0] : null;
  if (!source && exactSources.length === 0
    && scope.tenantId === DEFAULT_PLATFORM_SCOPE.tenantId
    && scope.parkId === DEFAULT_PLATFORM_SCOPE.parkId) {
    const fallbackSources = await parkRepository.find({
      where: { parkCode: "JH", status: 1, isDeleted: false },
      order: { createTime: "ASC", id: "ASC" }
    });
    source = fallbackSources.length === 1 ? fallbackSources[0] : null;
  }
  if (!source) {
    if (exactSources.length === 0) throw new NotFoundException("Park not found");
    throw new ConflictException("Asset park source is ambiguous");
  }
  return source;
}
