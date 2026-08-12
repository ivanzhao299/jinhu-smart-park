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
): Promise<AssetParkEntity> {
  const projection = await ensureAssetParkProjection(manager, scope, actorId);
  await ensureTenantAssetRuntimeControls(manager, scope);
  return projection;
}

export async function ensureAssetParkProjection(
  manager: EntityManager,
  scope: TenantParkScope,
  actorId: string
): Promise<AssetParkEntity> {
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
  return projection;
}

export async function hasActiveAssetAssignment(
  manager: EntityManager,
  scope: TenantParkScope
): Promise<boolean> {
  const rows = await manager.query(
    `SELECT 1
       FROM rel_tenant_module assignment
       JOIN sys_module module
         ON module.id=assignment.module_id
        AND module.module_code='asset'
        AND module.status=1
        AND module.is_deleted=false
      WHERE assignment.tenant_id=$1
        AND assignment.park_id=$2
        AND assignment.enabled=true
        AND assignment.status='enabled'
        AND assignment.is_deleted=false
        AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
        AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
      LIMIT 1`,
    [scope.tenantId, scope.parkId]
  ) as unknown[];
  return rows.length > 0;
}

export async function hasRetainedAssetRuntimeHistory(
  manager: EntityManager,
  scope: TenantParkScope
): Promise<boolean> {
  const rows = await manager.query(
    `SELECT 1 FROM sys_property_runtime_control control
      WHERE control.tenant_id=$1 AND control.park_id=$2 LIMIT 1`,
    [scope.tenantId, scope.parkId]
  ) as unknown[];
  return rows.length > 0;
}

export async function hasProtectedAssetScope(manager: EntityManager, scope: TenantParkScope): Promise<boolean> {
  return await hasActiveAssetAssignment(manager, scope)
    || await hasRetainedAssetRuntimeHistory(manager, scope);
}

export async function hasAssetParkProjection(manager: EntityManager, scope: TenantParkScope): Promise<boolean> {
  const rows = await manager.query(
    `SELECT 1 FROM asset_park park
      WHERE park.tenant_id=$1 AND park.park_id=$2 AND park.is_deleted=false LIMIT 1`,
    [scope.tenantId, scope.parkId]
  ) as unknown[];
  return rows.length > 0;
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
  if (!source
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

export async function hasCanonicalActiveAssetParkSource(
  manager: EntityManager,
  scope: TenantParkScope
): Promise<boolean> {
  try {
    await resolveCanonicalAssetParkSource(manager, scope);
    return true;
  } catch (error) {
    if (error instanceof NotFoundException) {
      const exists = await manager.getRepository(ParkEntity).exists({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (exists) return false;
    }
    throw error;
  }
}
