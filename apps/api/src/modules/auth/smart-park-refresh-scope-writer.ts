import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import type { AuthRefreshScopeWriter } from "./auth-refresh-scope-writer";
import { AuthRefreshTokenEntity } from "./entities/auth-refresh-token.entity";

const REFRESH_SCOPE_UNAVAILABLE = "Refresh token scope unavailable";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/u;

interface CanonicalScopeRow {
  scopeId: unknown;
  parkRowMatches: unknown;
}

interface UpdatedRefreshRow {
  id: unknown;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function isBoundedIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 64 &&
    value === value.trim() &&
    !hasControlCharacter(value)
  );
}

function isOptionalBoundedText(value: unknown, maxLength: number): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maxLength && !hasControlCharacter(value));
}

function isOptionalUuid(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && UUID_PATTERN.test(value));
}

function isUnsetOrFalse(value: unknown): boolean {
  return value === undefined || value === false;
}

@Injectable()
export class SmartParkRefreshScopeWriter implements AuthRefreshScopeWriter {
  async persist(manager: EntityManager, token: AuthRefreshTokenEntity): Promise<void> {
    try {
      this.assertInput(manager, token);

      const canonicalRows = typeormQueryRows<CanonicalScopeRow>(
        await manager.query(
          `SELECT scope.id AS "scopeId",
                  (park.id = binding.park_row_id AND park.status = 1) AS "parkRowMatches"
             FROM public.sys_business_scope_park_binding binding
             JOIN public.sys_business_scope scope
               ON scope.tenant_id = binding.tenant_id
              AND scope.id = binding.scope_id
              AND scope.scope_kind = 'park'
              AND scope.status = 'enabled'
              AND scope.is_deleted = false
             JOIN public.sys_tenant tenant
               ON tenant.id = scope.tenant_row_id
              AND tenant.tenant_id = scope.tenant_id
              AND tenant.status = 1
              AND tenant.is_deleted = false
              AND (tenant.expire_time IS NULL OR tenant.expire_time > now())
             JOIN public.biz_park park
               ON park.tenant_id = binding.tenant_id
              AND park.park_id = binding.park_id
              AND park.is_deleted = false
             JOIN public.sys_user account
               ON account.id = $3::uuid
              AND account.tenant_id = binding.tenant_id
              AND account.is_enabled = true
              AND account.status = 'enabled'
              AND account.is_deleted = false
            WHERE binding.tenant_id = $1
              AND binding.park_id = $2
              AND binding.scope_kind = 'park'
            ORDER BY park.id
            FETCH FIRST 2 ROWS ONLY
            FOR SHARE OF binding, scope, tenant, park, account`,
          [token.tenantId, token.parkId, token.userId]
        )
      );
      if (
        canonicalRows.length !== 1 ||
        canonicalRows[0]?.parkRowMatches !== true ||
        typeof canonicalRows[0].scopeId !== "string" ||
        !UUID_PATTERN.test(canonicalRows[0].scopeId)
      ) {
        throw new Error(REFRESH_SCOPE_UNAVAILABLE);
      }

      const persisted = await manager.getRepository(AuthRefreshTokenEntity).save(token);
      const persistedId = persisted.id;
      if (typeof persistedId !== "string" || !UUID_PATTERN.test(persistedId)) {
        throw new Error(REFRESH_SCOPE_UNAVAILABLE);
      }

      const updatedRows = typeormQueryRows<UpdatedRefreshRow>(
        await manager.query(
          `UPDATE public.sys_auth_refresh_token
              SET scope_id = $1::uuid
            WHERE id = $2::uuid
              AND tenant_id = $3
              AND park_id = $4
              AND user_id = $5::uuid
              AND token_hash = $6
              AND scope_id IS NULL
              AND revoked = false
              AND is_deleted = false
          RETURNING id`,
          [canonicalRows[0].scopeId, persistedId, token.tenantId, token.parkId, token.userId, token.tokenHash]
        )
      );
      if (updatedRows.length !== 1 || updatedRows[0]?.id !== persistedId) {
        throw new Error(REFRESH_SCOPE_UNAVAILABLE);
      }
    } catch {
      throw new UnauthorizedException(REFRESH_SCOPE_UNAVAILABLE);
    }
  }

  private assertInput(manager: EntityManager, token: AuthRefreshTokenEntity): void {
    if (
      manager.queryRunner?.isTransactionActive !== true ||
      token === null ||
      typeof token !== "object" ||
      token.id !== undefined ||
      !isBoundedIdentity(token.tenantId) ||
      !isBoundedIdentity(token.parkId) ||
      typeof token.userId !== "string" ||
      !UUID_PATTERN.test(token.userId) ||
      typeof token.tokenHash !== "string" ||
      !TOKEN_HASH_PATTERN.test(token.tokenHash) ||
      !(token.expiresAt instanceof Date) ||
      !Number.isFinite(token.expiresAt.getTime()) ||
      token.expiresAt.getTime() <= Date.now() ||
      !isUnsetOrFalse(token.revoked) ||
      !isUnsetOrFalse(token.isDeleted) ||
      token.revokedTime !== undefined && token.revokedTime !== null ||
      !isOptionalUuid(token.createBy) ||
      !isOptionalUuid(token.updateBy) ||
      !isOptionalBoundedText(token.deviceId, 128) ||
      !isOptionalBoundedText(token.userAgent, 500) ||
      !isOptionalBoundedText(token.ipAddress, 64)
    ) {
      throw new Error(REFRESH_SCOPE_UNAVAILABLE);
    }
  }
}
