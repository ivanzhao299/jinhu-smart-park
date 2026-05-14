import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { Public } from "../../shared/decorators/public.decorator";
import { AuthService } from "./auth.service";
import { type LoginResult } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cls: ClsService
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<LoginResult> {
    return this.authService.login(dto, {
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      requestId: this.cls.getId() ?? null
    });
  }

  @Post("logout")
  @HttpCode(200)
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_ME)
  @AuditLog({ module: "认证中心", resource: "system.auth", action: "退出登录" })
  logout(@CurrentUser() user: JwtPrincipal): { userId: string } {
    return { userId: user.sub };
  }
}
