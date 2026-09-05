import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  clearPasswordLockoutState,
  evaluatePasswordFailure,
  isPasswordLocked,
  resetExpiredPasswordLock,
  type PasswordLockoutConfig
} from "../auth/auth-password-lockout.policy";
import { PROTECTED_TENANT_SUPER_ROLE_CODE } from "../roles/protected-super-role";
import { UserEntity } from "./entities/user.entity";

export interface PasswordFailureRecordResult {
  user: UserEntity;
  lockoutTriggered: boolean;
}

export interface PasswordLoginSuccessResult {
  user: UserEntity;
  allowed: boolean;
  lockoutActive: boolean;
}

interface JwtPrincipalRow {
  user_id: string;
  user_username: string;
  user_display_name: string;
  user_tenant_id: string;
  user_park_id: string;
  user_is_enabled: boolean;
  user_status: string;
  user_auth_version: number;
  is_tenant_super: boolean;
  role_link_id: string | null;
  role_code: string | null;
  role_is_super: boolean | null;
  role_data_scope: string | null;
  permission_code: string | null;
}

const PERMISSION_ALIASES: Record<string, string[]> = {
  "system:org:list": ["system:read", "org:read"],
  "system:org:create": ["org:create"],
  "system:org:update": ["org:update"],
  "system:org:delete": ["org:delete"],
  "system:user:list": ["system:read", "user:read"],
  "system:user:create": ["user:create"],
  "system:user:update": ["user:update"],
  "system:user:delete": ["user:delete"],
  "system:user:reset-password": ["user:update"],
  "system:user:assign-roles": ["user:update", "role:read"],
  "system:role:list": ["system:read", "role:read"],
  "system:role:create": ["role:create"],
  "system:role:update": ["role:update"],
  "system:role:delete": ["role:delete"],
  "system:role:assign-permissions": ["role:update", "permission:read"],
  "role:read": ["system:role:list", "system:role:detail"],
  "role:create": ["system:role:create"],
  "role:update": ["system:role:update", "system:role:assign-permissions"],
  "role:copy": ["system:role:create"],
  "role:disable": ["system:role:update"],
  "role:delete": ["system:role:delete"],
  "tenant:read": ["system:read"],
  "tenant:manage": ["system:update"],
  "system:permission:list": ["system:read", "permission:read"],
  "system:permission:tree": ["system:read", "permission:read"],
  "system:permission:create": ["permission:create"],
  "system:permission:update": ["permission:update"],
  "system:permission:delete": ["permission:delete"],
  "permission:read": ["system:permission:list", "system:permission:tree"],
  "permission:create": ["system:permission:create"],
  "permission:update": ["system:permission:update"],
  "permission:delete": ["system:permission:delete"],
  "system:data-scope:read": ["system:read", "data_scope:read", "data-scope:read"],
  "system:data-scope:create": ["data_scope:create", "data-scope:create"],
  "system:data-scope:update": ["data_scope:update", "data-scope:update"],
  "system:data-scope:delete": ["data_scope:delete", "data-scope:delete"],
  "system:data-scope:assign": ["role:assign_data_scope", "data-scope:assign", "role:update"],
  "data_scope:read": ["system:data-scope:read", "system:read"],
  "data_scope:create": ["system:data-scope:create"],
  "data_scope:update": ["system:data-scope:update"],
  "data_scope:delete": ["system:data-scope:delete"],
  "role:assign_data_scope": ["system:data-scope:assign", "role:update"],
  "system:field-policy:read": ["system:read", "field_policy:read", "field-policy:read"],
  "system:field-policy:create": ["field_policy:create", "field-policy:create"],
  "system:field-policy:update": ["field_policy:update", "field-policy:update"],
  "system:field-policy:delete": ["field_policy:delete", "field-policy:delete"],
  "system:field-policy:assign": ["role:assign_field_policy", "field-policy:assign", "role:update"],
  "field_policy:read": ["system:field-policy:read", "system:read"],
  "field_policy:create": ["system:field-policy:create"],
  "field_policy:update": ["system:field-policy:update"],
  "field_policy:delete": ["system:field-policy:delete"],
  "role:assign_field_policy": ["system:field-policy:assign", "role:update"],
  "system:code-rule:read": ["system:read", "code_rule:read"],
  "system:code-rule:create": ["system:update", "code_rule:create"],
  "system:code-rule:update": ["system:update", "code_rule:update"],
  "system:code-rule:delete": ["system:update"],
  "system:code-rule:generate": ["system:update", "code_rule:generate"],
  "code_rule:read": ["system:code-rule:read", "system:read"],
  "code_rule:create": ["system:code-rule:create"],
  "code_rule:update": ["system:code-rule:update"],
  "code_rule:generate": ["system:code-rule:generate"],
  "system:module:read": ["system:read", "module:read"],
  "system:module:create": ["system:update", "module:manage"],
  "system:module:update": ["system:update", "module:manage"],
  "module:read": ["system:module:read", "system:read"],
  "module:manage": ["system:module:create", "system:module:update", "system:update"],
  "system:plan:read": ["system:read", "plan:read"],
  "system:plan:create": ["system:update", "plan:manage"],
  "system:plan:update": ["system:update", "plan:manage"],
  "plan:read": ["system:plan:read", "system:read"],
  "plan:manage": ["system:plan:create", "system:plan:update", "system:update"],
  "system:tenant-module:read": ["system:read", "tenant_module:read"],
  "system:tenant-module:assign": ["system:update", "tenant_module:manage"],
  "tenant_module:read": ["system:tenant-module:read", "system:read"],
  "tenant_module:manage": ["system:tenant-module:assign", "system:update"],
  "system:dict-type:list": ["system:read", "dict:read"],
  "system:dict-type:create": ["dict:create"],
  "system:dict-type:update": ["dict:update"],
  "system:dict-type:delete": ["dict:delete"],
  "system:dict-item:list": ["system:read", "dict:read"],
  "system:dict-item:create": ["dict:create"],
  "system:dict-item:update": ["dict:update"],
  "system:dict-item:delete": ["dict:delete"],
  "file:read": ["system:read"],
  "audit:read": ["system:read"],
  "system:audit:op-log:list": ["audit:read"],
  "system:audit:login-log:list": ["audit:read"],
  "system:attachment:list": ["file:read"],
  "system:attachment:create": ["file:upload"],
  "system:attachment:delete": ["file:delete"],
  "park:read": ["asset:read"],
  "park:create": ["asset:create"],
  "park:update": ["asset:update"],
  "park:delete": ["asset:delete"],
  "building:read": ["asset:read"],
  "building:create": ["asset:create"],
  "building:update": ["asset:update"],
  "building:delete": ["asset:delete"],
  "floor:read": ["asset:read"],
  "floor:create": ["asset:create"],
  "floor:update": ["asset:update"],
  "floor:delete": ["asset:delete"],
  "floor:upload_layout": ["asset:update", "file:upload"],
  "unit:read": ["asset:read"],
  "unit:create": ["asset:create"],
  "unit:update": ["asset:update", "file:upload"],
  "unit:delete": ["asset:delete"],
  "unit:transition_status": ["asset:update"],
  "unit:change_status": ["asset:update"],
  "unit:force_change_status": ["asset:update"],
  "unit:status_log": ["asset:read"],
  "unit:import": ["asset:create"],
  "unit:import_template": ["asset:create"],
  "unit:export": ["asset:read"],
  "asset:status_board": ["asset:read", "unit:read"],
  "asset:statistics": ["asset:read"],
  "asset:statistics:read": ["asset:read"],
  "asset:park:list": ["asset:read", "park:read"],
  "asset:park:create": ["asset:create", "park:create"],
  "asset:park:update": ["asset:update", "park:update"],
  "asset:park:delete": ["asset:delete", "park:delete"],
  "asset:building:list": ["asset:read", "building:read"],
  "asset:building:create": ["asset:create", "building:create"],
  "asset:building:update": ["asset:update", "building:update"],
  "asset:building:delete": ["asset:delete", "building:delete"],
  "asset:floor:list": ["asset:read", "floor:read"],
  "asset:floor:create": ["asset:create", "floor:create"],
  "asset:floor:update": ["asset:update", "floor:update"],
  "asset:floor:delete": ["asset:delete", "floor:delete"],
  "asset:unit:list": ["asset:read", "unit:read"],
  "asset:unit:create": ["asset:create", "unit:create"],
  "asset:unit:update": ["asset:update", "unit:update"],
  "asset:unit:delete": ["asset:delete", "unit:delete"]
};

export function expandPermissionAliases(permissions: string[]): string[] {
  return [...new Set(permissions.flatMap((permission) => [permission, ...(PERMISSION_ALIASES[permission] ?? [])]))];
}

export function resolveDataScope(scopes: string[]): string {
  const normalize = (scope: string): string =>
    ({ "10": "self", "20": "org", "30": "org_and_children", "40": "park", "50": "tenant", "60": "custom" })[scope] ?? scope;
  const rank: Record<string, number> = { self: 1, org: 2, org_and_children: 3, park: 4, tenant: 5, custom: 6, all: 7 };
  return scopes
    .map(normalize)
    .reduce((current, scope) => ((rank[scope] ?? 0) > (rank[current] ?? 0) ? scope : current), "self");
}

@Injectable()
export class IdentityDirectoryService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>
  ) {}

  findByUsernameInScope(username: string, scope: TenantParkScope): Promise<UserEntity | null> {
    return this.usersRepository.findOne({
      where: {
        username,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      },
      relations: {
        roleLinks: {
          role: {
            permissionLinks: {
              permission: true
            }
          }
        }
      }
    });
  }

  findLoginCandidatesByUsername(username: string): Promise<UserEntity[]> {
    return this.usersRepository.find({
      where: {
        username,
        isDeleted: false
      },
      relations: {
        roleLinks: {
          role: {
            permissionLinks: {
              permission: true
            }
          }
        }
      },
      order: { tenantId: "ASC", parkId: "ASC", createTime: "ASC" }
    });
  }

  findByIdInScope(id: string, scope: TenantParkScope): Promise<UserEntity | null> {
    return this.usersRepository.findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      },
      relations: {
        roleLinks: {
          role: {
            permissionLinks: {
              permission: true
            }
          }
        }
      }
    });
  }

  findByIdForIdentity(id: string, tenantId: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { id, tenantId, isDeleted: false, isEnabled: true } });
  }

  async listLoginUsersByMobile(tenantId: string, mobile: string, parkId?: string): Promise<UserEntity[]> {
    return this.usersRepository.find({
      where: {
        tenantId,
        ...(parkId ? { parkId } : {}),
        mobile,
        isDeleted: false,
        isEnabled: true
      },
      relations: {
        roleLinks: {
          role: {
            permissionLinks: {
              permission: true
            }
          }
        }
      },
      order: { parkId: "ASC", createTime: "ASC" }
    });
  }

  async resolveJwtPrincipal(scope: TenantParkScope, id: string): Promise<JwtPrincipal> {
    const rows = await this.usersRepository.query<JwtPrincipalRow[]>(
      `WITH principal_user AS MATERIALIZED (
         SELECT
           candidate.*,
           EXISTS (
             SELECT 1
             FROM rel_user_role tenant_super_link
             INNER JOIN sys_role tenant_super_role
               ON tenant_super_role.id = tenant_super_link.role_id
              AND tenant_super_role.tenant_id = candidate.tenant_id
              AND tenant_super_role.code = '${PROTECTED_TENANT_SUPER_ROLE_CODE}'
              AND tenant_super_role.role_scope = 'platform'
              AND tenant_super_role.is_super = true
              AND tenant_super_role.is_system = true
              AND tenant_super_role.is_builtin = true
              AND tenant_super_role.is_enabled = true
              AND tenant_super_role.status = 'enabled'
              AND tenant_super_role.is_deleted = false
             WHERE tenant_super_link.user_id = candidate.id
               AND tenant_super_link.tenant_id = candidate.tenant_id
               AND tenant_super_link.is_deleted = false
           ) AS is_tenant_super
         FROM sys_user candidate
         WHERE candidate.id = $1::uuid
           AND candidate.tenant_id = $2
           AND candidate.is_deleted = false
       )
       SELECT
         usr.id AS user_id,
         usr.username AS user_username,
         usr.display_name AS user_display_name,
         usr.tenant_id AS user_tenant_id,
         usr.park_id AS user_park_id,
         usr.is_enabled AS user_is_enabled,
         usr.status AS user_status,
         usr.auth_version AS user_auth_version,
         usr.is_tenant_super,
         user_role.id AS role_link_id,
         role.code AS role_code,
         role.is_super AS role_is_super,
         role.data_scope AS role_data_scope,
         permission.code AS permission_code
       FROM principal_user usr
       LEFT JOIN rel_user_role user_role
         ON user_role.user_id = usr.id
        AND user_role.is_deleted = false
        AND user_role.tenant_id = usr.tenant_id
        AND user_role.park_id = $3
        AND EXISTS (
          SELECT 1
          FROM sys_role active_role
          WHERE active_role.id = user_role.role_id
            AND active_role.is_deleted = false
            AND active_role.is_enabled = true
            AND active_role.status = 'enabled'
            AND active_role.tenant_id = usr.tenant_id
            AND (active_role.role_scope = 'tenant' OR active_role.park_id = $3)
        )
       LEFT JOIN sys_role role
         ON role.id = user_role.role_id
        AND role.is_deleted = false
        AND role.is_enabled = true
        AND role.status = 'enabled'
        AND role.tenant_id = usr.tenant_id
        AND (role.role_scope = 'tenant' OR role.park_id = $3)
       LEFT JOIN rel_role_perm role_permission
         ON role_permission.role_id = role.id
        AND role_permission.is_deleted = false
        AND role_permission.tenant_id = usr.tenant_id
        AND role_permission.park_id = $3
        AND EXISTS (
          SELECT 1
          FROM sys_permission active_permission
          WHERE active_permission.id = role_permission.permission_id
            AND active_permission.is_deleted = false
            AND active_permission.is_enabled = true
            AND active_permission.status = 'enabled'
            AND active_permission.tenant_id = usr.tenant_id
        )
       LEFT JOIN sys_permission permission
         ON permission.id = role_permission.permission_id
        AND permission.is_deleted = false
        AND permission.is_enabled = true
        AND permission.status = 'enabled'
        AND permission.tenant_id = usr.tenant_id
       WHERE (
           usr.is_tenant_super
           OR
           (
             usr.park_id = $3
             AND NOT EXISTS (
               SELECT 1 FROM rel_user_park explicit_home
                WHERE explicit_home.user_id=usr.id AND explicit_home.tenant_id=usr.tenant_id
                  AND explicit_home.park_id=$3
             )
           )
           OR EXISTS (
             SELECT 1 FROM rel_user_park access
              WHERE access.user_id=usr.id AND access.tenant_id=usr.tenant_id AND access.park_id=$3
                AND access.status='enabled' AND access.is_deleted=false
           )
         )
         AND EXISTS (
           SELECT 1 FROM biz_park live_park
           WHERE live_park.tenant_id=usr.tenant_id AND live_park.park_id=$3
              AND live_park.status=1 AND live_park.is_deleted=false
         )
       ORDER BY user_role.create_time ASC, role_permission.create_time ASC`,
      [id, scope.tenantId, scope.parkId]
    );
    const first = rows[0];
    if (!first || !first.user_is_enabled || first.user_status !== "enabled") {
      throw new NotFoundException("User not found");
    }

    const roles = new Map<string, { code: string; isSuper: boolean; dataScope: string }>();
    const basePermissions: string[] = [];
    for (const row of rows) {
      if (row.role_link_id !== null && row.role_code !== null && row.role_data_scope !== null) {
        roles.set(row.role_link_id, {
          code: row.role_code,
          isSuper: row.role_is_super === true,
          dataScope: row.role_data_scope
        });
        if (row.permission_code !== null) {
          basePermissions.push(row.permission_code);
        }
      }
    }
    const activeRoles = [...roles.values()];
    const isTenantSuper = first.is_tenant_super === true;
    if (isTenantSuper && !activeRoles.some((role) => role.code === PROTECTED_TENANT_SUPER_ROLE_CODE)) {
      activeRoles.push({ code: PROTECTED_TENANT_SUPER_ROLE_CODE, isSuper: true, dataScope: "all" });
    }
    const isSuper = isTenantSuper || activeRoles.some((role) => role.isSuper) || basePermissions.includes("*");

    return {
      sub: first.user_id,
      username: first.user_username,
      realName: first.user_display_name,
      tenantId: first.user_tenant_id,
      parkId: scope.parkId,
      roles: activeRoles.map((role) => role.code),
      permissions: isSuper
        ? ["*"]
        : expandPermissionAliases([...new Set([...basePermissions, SYSTEM_PERMISSIONS.USER_ME])]),
      dataScope: isSuper ? "all" : resolveDataScope(activeRoles.map((role) => role.dataScope)),
      isSuper,
      isTenantSuper,
      authVersion: Number(first.user_auth_version)
    };
  }

  async recordSuccessfulLogin(scope: TenantParkScope, id: string, ipAddress: string | null): Promise<void> {
    await this.usersRepository.update(
      { id, tenantId: scope.tenantId, isDeleted: false },
      { lastLoginIp: ipAddress, lastLoginTime: new Date() }
    );
  }

  async recordPasswordFailure(
    user: UserEntity,
    config: PasswordLockoutConfig,
    now = new Date()
  ): Promise<PasswordFailureRecordResult> {
    return this.usersRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserEntity);
      const lockedUser = await repository.findOne({
        where: { id: user.id, tenantId: user.tenantId, parkId: user.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!lockedUser) {
        return { user, lockoutTriggered: false };
      }
      if (this.isPasswordLocked(lockedUser, now)) {
        return { user: lockedUser, lockoutTriggered: false };
      }

      const currentState = resetExpiredPasswordLock(this.toPasswordLockoutState(lockedUser), now);
      const result = evaluatePasswordFailure(currentState, config, now);
      Object.assign(lockedUser, result.state);
      const savedUser = await repository.save(lockedUser);
      return { user: savedUser, lockoutTriggered: result.lockoutTriggered };
    });
  }

  isPasswordLocked(user: UserEntity, now: Date): boolean {
    return isPasswordLocked(this.toPasswordLockoutState(user), now);
  }

  async refreshPasswordLockoutState(user: UserEntity, now = new Date()): Promise<UserEntity> {
    return this.usersRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserEntity);
      const lockedUser = await repository.findOne({
        where: { id: user.id, tenantId: user.tenantId, parkId: user.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!lockedUser) {
        return user;
      }

      const currentState = this.toPasswordLockoutState(lockedUser);
      const state = resetExpiredPasswordLock(currentState, now);
      if (this.samePasswordLockoutState(currentState, state)) {
        return Object.assign(user, currentState);
      }
      Object.assign(lockedUser, state);
      await repository.save(lockedUser);
      return Object.assign(user, state);
    });
  }

  async finalizePasswordLoginSuccess(
    user: UserEntity,
    config: PasswordLockoutConfig,
    now = new Date()
  ): Promise<PasswordLoginSuccessResult> {
    if (!config.enabled) {
      return { user, allowed: true, lockoutActive: false };
    }
    const expectedState = this.toPasswordLockoutState(user);

    return this.usersRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserEntity);
      const lockedUser = await repository.findOne({
        where: { id: user.id, tenantId: user.tenantId, parkId: user.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!lockedUser) {
        return { user, allowed: false, lockoutActive: false };
      }

      const currentState = this.toPasswordLockoutState(lockedUser);
      const latestState = resetExpiredPasswordLock(currentState, now);
      if (!this.samePasswordLockoutState(currentState, latestState)) {
        Object.assign(lockedUser, latestState);
        await repository.save(lockedUser);
      }
      Object.assign(user, latestState);

      const lockoutActive = isPasswordLocked(latestState, now);
      if (lockoutActive || !this.samePasswordLockoutState(latestState, expectedState)) {
        return { user, allowed: false, lockoutActive };
      }

      if (!config.resetOnSuccess) {
        return { user, allowed: true, lockoutActive: false };
      }

      const clearState = clearPasswordLockoutState();
      Object.assign(lockedUser, clearState);
      await repository.save(lockedUser);
      return { user: Object.assign(user, clearState), allowed: true, lockoutActive: false };
    });
  }

  private toPasswordLockoutState(user: UserEntity) {
    return {
      passwordFailedCount: user.passwordFailedCount,
      passwordFailedWindowStartedAt: user.passwordFailedWindowStartedAt,
      passwordLockedUntil: user.passwordLockedUntil,
      lastPasswordFailedAt: user.lastPasswordFailedAt
    };
  }

  private samePasswordLockoutState(
    left: ReturnType<IdentityDirectoryService["toPasswordLockoutState"]>,
    right: ReturnType<IdentityDirectoryService["toPasswordLockoutState"]>
  ): boolean {
    return (
      left.passwordFailedCount === right.passwordFailedCount &&
      left.passwordFailedWindowStartedAt?.getTime() === right.passwordFailedWindowStartedAt?.getTime() &&
      left.passwordLockedUntil?.getTime() === right.passwordLockedUntil?.getTime() &&
      left.lastPasswordFailedAt?.getTime() === right.lastPasswordFailedAt?.getTime()
    );
  }
}
