import { Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { ParkBusinessScopeContext } from "@jinhu/shared";
import type {
  BusinessScopeParkAdapter,
  BusinessScopeParkResolution
} from "../../shared/business-scope/business-scope-park-adapter";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

@Injectable()
export class SmartParkBusinessScopeAdapter implements BusinessScopeParkAdapter {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async resolveParkScope(input: BusinessScopeParkResolution): Promise<ParkBusinessScopeContext | null> {
    if (!input || typeof input !== "object"
      || typeof input.tenantId !== "string" || input.tenantId.trim() !== input.tenantId
      || input.tenantId.length === 0 || input.tenantId.length > 64
      || typeof input.scopeId !== "string" || !UUID.test(input.scopeId)
      || typeof input.userId !== "string" || !UUID.test(input.userId)) return null;
    let rows: unknown;
    try {
      rows = await this.dataSource.query(
        `SELECT scope.tenant_id AS "tenantId", scope.id::text AS "scopeId", park.park_id AS "parkId"
         FROM sys_business_scope_park_binding binding
         JOIN sys_business_scope scope
           ON scope.tenant_id = binding.tenant_id AND scope.id = binding.scope_id
          AND scope.scope_kind = 'park' AND binding.scope_kind = 'park'
          AND scope.status = 'enabled' AND scope.is_deleted = false
         JOIN sys_tenant tenant ON tenant.id = scope.tenant_row_id AND tenant.tenant_id = scope.tenant_id
          AND tenant.status = 1 AND tenant.is_deleted = false
          AND (tenant.expire_time IS NULL OR tenant.expire_time > now())
         JOIN biz_park park ON park.id = binding.park_row_id
          AND park.tenant_id = binding.tenant_id AND park.park_id = binding.park_id
          AND park.status = 1 AND park.is_deleted = false
         JOIN sys_user_business_scope_membership membership
           ON membership.tenant_id = scope.tenant_id AND membership.scope_id = scope.id
          AND membership.user_id = $3::uuid AND membership.status = 'enabled' AND membership.is_deleted = false
         JOIN sys_user app_user ON app_user.id = membership.user_id AND app_user.tenant_id = scope.tenant_id
          AND app_user.status = 'enabled' AND app_user.is_enabled = true AND app_user.is_deleted = false
         WHERE scope.tenant_id = $1 AND scope.id = $2::uuid
           AND NOT EXISTS (SELECT 1 FROM biz_park other_park
             WHERE other_park.tenant_id = park.tenant_id AND other_park.park_id = park.park_id
               AND other_park.is_deleted = false AND other_park.id <> park.id)
         FETCH FIRST 2 ROWS ONLY`,
        [input.tenantId, input.scopeId, input.userId]
      );
    } catch {
      return null;
    }
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const row: unknown = rows[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const value = row as Record<string, unknown>;
    if (value.tenantId !== input.tenantId || typeof value.scopeId !== "string"
      || value.scopeId.toLowerCase() !== input.scopeId.toLowerCase()
      || typeof value.parkId !== "string" || value.parkId.length === 0 || value.parkId.length > 64
      || value.parkId.trim() !== value.parkId) return null;
    return { tenantId: input.tenantId, scopeId: value.scopeId.toLowerCase(), kind: "park", parkId: value.parkId };
  }
}
