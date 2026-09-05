import { Inject, Injectable, Optional } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { BusinessScopeContext, BusinessScopeKind } from "@jinhu/shared";
import {
  BUSINESS_SCOPE_PARK_ADAPTER,
  type BusinessScopeParkAdapter
} from "./business-scope-park-adapter";

export interface ResolveBusinessScopeInput {
  tenantId: string;
  userId: string;
  scopeId: string;
  requiredModuleCode: string;
}

export interface ResolveUniqueBusinessScopeInput {
  tenantId: string;
  userId: string;
  requiredModuleCode: string;
}

interface ResolvedCoreScopeRow {
  tenantId: string;
  scopeId: string;
  scopeKind: BusinessScopeKind;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MODULE_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

@Injectable()
export class BusinessScopeResolverService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Optional()
    @Inject(BUSINESS_SCOPE_PARK_ADAPTER)
    private readonly parkAdapter?: BusinessScopeParkAdapter
  ) {}

  async resolveForUser(input: ResolveBusinessScopeInput): Promise<BusinessScopeContext | null> {
    const normalized = this.normalizeInput(input, true);
    if (!normalized) return null;
    return this.resolveSingleScope(normalized);
  }

  async resolveUniqueForUser(input: ResolveUniqueBusinessScopeInput): Promise<BusinessScopeContext | null> {
    const normalized = this.normalizeInput(input, false);
    if (!normalized) return null;
    return this.resolveSingleScope(normalized);
  }

  private async resolveSingleScope(input: NormalizedResolveBusinessScopeInput): Promise<BusinessScopeContext | null> {
    let rows: unknown;
    try {
      rows = await this.dataSource.query(
        `SELECT
           scope.tenant_id AS "tenantId",
           scope.id::text AS "scopeId",
           scope.scope_kind AS "scopeKind"
         FROM sys_business_scope scope
         JOIN sys_tenant tenant
           ON tenant.id = scope.tenant_row_id
          AND tenant.tenant_id = scope.tenant_id
         JOIN sys_user app_user
           ON app_user.id = $2::uuid
          AND app_user.tenant_id = scope.tenant_id
         JOIN sys_user_business_scope_membership membership
           ON membership.tenant_id = scope.tenant_id
          AND membership.scope_id = scope.id
          AND membership.user_id = app_user.id
         JOIN sys_business_scope_module scope_module
           ON scope_module.tenant_id = scope.tenant_id
          AND scope_module.scope_id = scope.id
          AND scope_module.module_code = $4
         WHERE scope.tenant_id = $1
           AND ($3::uuid IS NULL OR scope.id = $3::uuid)
           AND scope.status = 'enabled'
           AND scope.is_deleted = false
           AND tenant.status = 1
           AND tenant.is_deleted = false
           AND (tenant.expire_time IS NULL OR tenant.expire_time > now())
           AND app_user.is_enabled = true
           AND app_user.status = 'enabled'
           AND app_user.is_deleted = false
           AND membership.status = 'enabled'
           AND membership.is_deleted = false
           AND scope_module.status = 'enabled'
           AND scope_module.is_deleted = false
         ORDER BY scope.id
         FETCH FIRST 2 ROWS ONLY`,
        [input.tenantId, input.userId, input.scopeId, input.requiredModuleCode]
      );
    } catch {
      return null;
    }

    const row = this.readSingleCoreRow(rows, input);
    if (!row) return null;
    return this.resolveContext(row, input.userId);
  }

  private async resolveContext(
    row: ResolvedCoreScopeRow,
    userId: string
  ): Promise<BusinessScopeContext | null> {
    if (row.scopeKind === "enterprise") {
      return { tenantId: row.tenantId, scopeId: row.scopeId, kind: "enterprise", parkId: null };
    }
    if (!this.parkAdapter) return null;

    let park: BusinessScopeContext | null;
    try {
      park = await this.parkAdapter.resolveParkScope({
        tenantId: row.tenantId,
        scopeId: row.scopeId,
        userId
      });
    } catch {
      return null;
    }
    if (
      !park
      || park.kind !== "park"
      || park.tenantId !== row.tenantId
      || park.scopeId !== row.scopeId
      || typeof park.parkId !== "string"
      || park.parkId.trim() === ""
      || park.parkId !== park.parkId.trim()
    ) {
      return null;
    }
    return {
      tenantId: park.tenantId,
      scopeId: park.scopeId,
      kind: "park",
      parkId: park.parkId
    };
  }

  private normalizeInput(
    input: ResolveBusinessScopeInput | ResolveUniqueBusinessScopeInput,
    scopeRequired: boolean
  ): NormalizedResolveBusinessScopeInput | null {
    if (!input || typeof input !== "object") return null;
    if (!scopeRequired && "scopeId" in input) return null;
    const tenantId = typeof input.tenantId === "string" ? input.tenantId.trim() : "";
    const userId = typeof input.userId === "string" ? input.userId.trim().toLowerCase() : "";
    const rawScopeId = "scopeId" in input ? input.scopeId : undefined;
    const scopeId = typeof rawScopeId === "string" ? rawScopeId.trim().toLowerCase() : null;
    const requiredModuleCode =
      typeof input.requiredModuleCode === "string" ? input.requiredModuleCode.trim() : "";
    if (
      tenantId === ""
      || tenantId.length > 64
      || tenantId !== input.tenantId
      || !UUID_PATTERN.test(userId)
      || userId !== input.userId.trim().toLowerCase()
      || (scopeRequired && (scopeId === null || !UUID_PATTERN.test(scopeId)))
      || (!scopeRequired && scopeId !== null)
      || (scopeId !== null && scopeId !== rawScopeId?.trim().toLowerCase())
      || !MODULE_CODE_PATTERN.test(requiredModuleCode)
      || requiredModuleCode !== input.requiredModuleCode
    ) {
      return null;
    }
    return { tenantId, userId, scopeId, requiredModuleCode };
  }

  private readSingleCoreRow(
    value: unknown,
    expected: Pick<NormalizedResolveBusinessScopeInput, "tenantId" | "scopeId">
  ): ResolvedCoreScopeRow | null {
    if (!Array.isArray(value) || value.length !== 1) return null;
    const row: unknown = value[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const record = row as Record<string, unknown>;
    if (
      typeof record.tenantId !== "string"
      || record.tenantId === ""
      || record.tenantId.length > 64
      || record.tenantId !== expected.tenantId
      || typeof record.scopeId !== "string"
      || !UUID_PATTERN.test(record.scopeId)
      || (expected.scopeId !== null && record.scopeId.toLowerCase() !== expected.scopeId)
      || (record.scopeKind !== "enterprise" && record.scopeKind !== "park")
    ) {
      return null;
    }
    return {
      tenantId: record.tenantId,
      scopeId: record.scopeId.toLowerCase(),
      scopeKind: record.scopeKind
    };
  }
}

interface NormalizedResolveBusinessScopeInput {
  tenantId: string;
  userId: string;
  scopeId: string | null;
  requiredModuleCode: string;
}
