import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { SYSTEM_PERMISSIONS, type AuthUser } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type { LoginDto } from "./dto/login.dto";
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
    private readonly auditService: AuditService
  ) {}

  async login(dto: LoginDto, meta: LoginRequestMeta): Promise<LoginResult> {
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
    const permissions = activeRoleLinks.flatMap((link) =>
      link.role.permissionLinks
        .filter(
          (permissionLink) =>
            !permissionLink.isDeleted && permissionLink.permission.isEnabled && !permissionLink.permission.isDeleted
        )
        .map((permissionLink) => permissionLink.permission.code)
    );

    const grantedPermissions = [...new Set([...permissions, SYSTEM_PERMISSIONS.USER_ME])];
    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      realName: user.displayName,
      tenantId: user.tenantId,
      parkId: user.parkId,
      roles: activeRoleLinks.map((link) => link.role.code),
      permissions: grantedPermissions
    };

    const payload: JwtPrincipal = {
      sub: authUser.id,
      username: authUser.username,
      realName: authUser.realName,
      tenantId: authUser.tenantId,
      parkId: authUser.parkId,
      roles: authUser.roles,
      permissions: authUser.permissions
    };

    const result: LoginResult = {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: "Bearer",
      expiresIn: this.configService.get<string>("JWT_EXPIRES_IN", "2h"),
      user: authUser
    };
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
}
