import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { SYSTEM_PERMISSIONS, type AuthUser } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type { LoginDto } from "./dto/login.dto";
import { TenantsService } from "../tenants/tenants.service";
import { UsersService } from "../users/users.service";

export interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: AuthUser;
}

export interface LoginRequestMeta {
  ipAddress: string | null;
  userAgent: string | string[] | null;
  requestId?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly tenantsService: TenantsService
  ) {}

  async login(dto: LoginDto, meta: LoginRequestMeta): Promise<LoginResult> {
    await this.tenantsService.assertTenantActive(dto.tenantId);
    const user = await this.usersService.findByUsernameInScope(dto.username, {
      tenantId: dto.tenantId,
      parkId: dto.parkId
    });
    if (!user || user.isDeleted || !user.isEnabled) {
      await this.recordLogin(dto, meta, null, false, "Invalid username or password");
      throw new UnauthorizedException("Invalid username or password");
    }

    const passwordMatched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatched) {
      await this.recordLogin(dto, meta, user.id, false, "Invalid username or password");
      throw new UnauthorizedException("Invalid username or password");
    }

    const activeRoleLinks = user.roleLinks.filter(
      (link) => !link.isDeleted && link.role.isEnabled && !link.role.isDeleted
    );
    const basePermissions = activeRoleLinks.flatMap((link) =>
      link.role.permissionLinks
        .filter(
          (permissionLink) =>
            !permissionLink.isDeleted && permissionLink.permission.isEnabled && !permissionLink.permission.isDeleted
        )
        .map((permissionLink) => permissionLink.permission.code)
    );

    const permissions = this.expandPermissionAliases([...new Set(basePermissions)]);
    const isSuper = activeRoleLinks.some((link) => link.role.isSuper) || permissions.includes("*");
    const grantedPermissions = isSuper ? ["*"] : [...new Set([...permissions, SYSTEM_PERMISSIONS.USER_ME])];
    const dataScope = isSuper ? "all" : this.resolveDataScope(activeRoleLinks.map((link) => link.role.dataScope));
    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      realName: user.displayName,
      avatar_url: user.avatarUrl,
      gender: user.gender,
      tenantId: user.tenantId,
      parkId: user.parkId,
      roles: activeRoleLinks.map((link) => link.role.code),
      permissions: grantedPermissions,
      data_scope: dataScope,
      is_super: isSuper
    };

    const payload: JwtPrincipal = {
      sub: authUser.id,
      username: authUser.username,
      realName: authUser.realName,
      tenantId: authUser.tenantId,
      parkId: authUser.parkId,
      roles: authUser.roles,
      permissions: authUser.permissions,
      dataScope,
      isSuper
    };

    const result: LoginResult = {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: "Bearer",
      expiresIn: this.configService.get<string>("JWT_EXPIRES_IN", "2h"),
      user: authUser
    };
    await this.usersService.recordSuccessfulLogin({ tenantId: user.tenantId, parkId: user.parkId }, user.id, meta.ipAddress);
    await this.recordLogin(dto, meta, user.id, true, "success");
    return result;
  }

  private async recordLogin(
    dto: LoginDto,
    meta: LoginRequestMeta,
    userId: string | null,
    success: boolean,
    message: string
  ): Promise<void> {
    await this.auditService.recordLogin({
      tenantId: dto.tenantId,
      parkId: dto.parkId,
      userId,
      username: dto.username,
      ipAddress: meta.ipAddress,
      userAgent: Array.isArray(meta.userAgent) ? meta.userAgent.join(";") : meta.userAgent,
      loginMethod: "password",
      success,
      message,
      requestId: meta.requestId ?? null
    });
  }

  private resolveDataScope(scopes: string[]): string {
    const normalize = (scope: string): string =>
      ({ "10": "self", "20": "org", "30": "org_and_children", "40": "park", "50": "tenant", "60": "custom" })[scope] ?? scope;
    const rank: Record<string, number> = { self: 1, org: 2, org_and_children: 3, park: 4, tenant: 5, custom: 6, all: 7 };
    return scopes
      .map(normalize)
      .reduce((current, scope) => ((rank[scope] ?? 0) > (rank[current] ?? 0) ? scope : current), "self");
  }

  private expandPermissionAliases(permissions: string[]): string[] {
    const aliases: Record<string, string[]> = {
      "system:role:list": ["role:read"],
      "system:role:detail": ["role:read"],
      "system:role:create": ["role:create", "role:copy"],
      "system:role:update": ["role:update", "role:disable"],
      "system:role:delete": ["role:delete"],
      "system:role:assign-permissions": ["role:update"],
      "role:read": ["system:role:list", "system:role:detail"],
      "role:create": ["system:role:create"],
      "role:update": ["system:role:update", "system:role:assign-permissions"],
      "role:copy": ["system:role:create"],
      "role:disable": ["system:role:update"],
      "role:delete": ["system:role:delete"],
      "system:permission:list": ["permission:read"],
      "system:permission:tree": ["permission:read"],
      "system:permission:create": ["permission:create"],
      "system:permission:update": ["permission:update"],
      "system:permission:delete": ["permission:delete"],
      "permission:read": ["system:permission:list", "system:permission:tree"],
      "permission:create": ["system:permission:create"],
      "permission:update": ["system:permission:update"],
      "permission:delete": ["system:permission:delete"],
      "system:data-scope:read": ["data_scope:read", "data-scope:read"],
      "system:data-scope:create": ["data_scope:create", "data-scope:create"],
      "system:data-scope:update": ["data_scope:update", "data-scope:update"],
      "system:data-scope:delete": ["data_scope:delete", "data-scope:delete"],
      "system:data-scope:assign": ["role:assign_data_scope", "data-scope:assign", "role:update"],
      "data_scope:read": ["system:data-scope:read"],
      "data_scope:create": ["system:data-scope:create"],
      "data_scope:update": ["system:data-scope:update"],
      "data_scope:delete": ["system:data-scope:delete"],
      "role:assign_data_scope": ["system:data-scope:assign", "role:update"],
      "system:field-policy:read": ["field_policy:read", "field-policy:read"],
      "system:field-policy:create": ["field_policy:create", "field-policy:create"],
      "system:field-policy:update": ["field_policy:update", "field-policy:update"],
      "system:field-policy:delete": ["field_policy:delete", "field-policy:delete"],
      "system:field-policy:assign": ["role:assign_field_policy", "field-policy:assign", "role:update"],
      "field_policy:read": ["system:field-policy:read"],
      "field_policy:create": ["system:field-policy:create"],
      "field_policy:update": ["system:field-policy:update"],
      "field_policy:delete": ["system:field-policy:delete"],
      "role:assign_field_policy": ["system:field-policy:assign", "role:update"],
      "system:code-rule:read": ["code_rule:read"],
      "system:code-rule:create": ["code_rule:create"],
      "system:code-rule:update": ["code_rule:update"],
      "system:code-rule:generate": ["code_rule:generate"],
      "code_rule:read": ["system:code-rule:read"],
      "code_rule:create": ["system:code-rule:create"],
      "code_rule:update": ["system:code-rule:update"],
      "code_rule:generate": ["system:code-rule:generate"],
      "system:module:read": ["module:read"],
      "system:module:create": ["module:manage"],
      "system:module:update": ["module:manage"],
      "module:read": ["system:module:read"],
      "module:manage": ["system:module:create", "system:module:update"],
      "system:plan:read": ["plan:read"],
      "system:plan:create": ["plan:manage"],
      "system:plan:update": ["plan:manage"],
      "plan:read": ["system:plan:read"],
      "plan:manage": ["system:plan:create", "system:plan:update"],
      "system:tenant-module:read": ["tenant_module:read"],
      "system:tenant-module:assign": ["tenant_module:manage"],
      "tenant_module:read": ["system:tenant-module:read"],
      "tenant_module:manage": ["system:tenant-module:assign"]
    };
    return [...new Set(permissions.flatMap((permission) => [permission, ...(aliases[permission] ?? [])]))];
  }
}
