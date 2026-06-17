import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { Public } from "../../shared/decorators/public.decorator";
import { resolveAuthClientIp } from "./auth-client-ip";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
import { type BindIdentityResult, type LoginResult, type MobileCodeResult, type WechatAuthorizeResult, type WechatCallbackResult } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { MobileLoginDto } from "./dto/mobile-login.dto";
import { MobileSendCodeDto } from "./dto/mobile-send-code.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { SelectContextDto } from "./dto/select-context.dto";
import { WechatAuthorizeDto } from "./dto/wechat-authorize.dto";
import { WechatBindDto } from "./dto/wechat-bind.dto";
import { WechatCallbackDto } from "./dto/wechat-callback.dto";
import { UsersService } from "../users/users.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly cls: ClsService,
    private readonly authRateLimitService: AuthRateLimitService
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<LoginResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "login",
      ipAddress: this.getIpAddress(request),
      identifier: dto.username
    });
    return this.authService.login(dto, {
      ipAddress: this.getIpAddress(request),
      userAgent: request.headers["user-agent"] ?? null,
      requestId: this.cls.getId() ?? null
    });
  }

  @Public()
  @Post("mobile/send-code")
  @HttpCode(200)
  sendMobileCode(@Body() dto: MobileSendCodeDto, @Req() request: Request): Promise<MobileCodeResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "mobile-send-code",
      ipAddress: this.getIpAddress(request),
      identifier: [dto.tenantId, dto.parkId ?? "all-parks", dto.mobile].join(":")
    });
    return this.authService.sendMobileCode(dto, this.getMeta(request));
  }

  @Public()
  @Post("mobile/login")
  @HttpCode(200)
  mobileLogin(@Body() dto: MobileLoginDto, @Req() request: Request): Promise<LoginResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "mobile-login",
      ipAddress: this.getIpAddress(request),
      identifier: [dto.tenantId, dto.parkId ?? "all-parks", dto.mobile].join(":")
    });
    return this.authService.mobileLogin(dto, this.getMeta(request));
  }

  @Public()
  @Post("wechat/authorize")
  @HttpCode(200)
  createWechatAuthorization(@Body() dto: WechatAuthorizeDto, @Req() request: Request): Promise<WechatAuthorizeResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "wechat-authorize",
      ipAddress: this.getIpAddress(request),
      identifier: dto.tenantId
    });
    return this.authService.createWechatAuthorization(dto, this.getMeta(request));
  }

  @Public()
  @Post("wechat/callback")
  @HttpCode(200)
  wechatCallback(@Body() dto: WechatCallbackDto, @Req() request: Request): Promise<WechatCallbackResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "wechat-callback",
      ipAddress: this.getIpAddress(request),
      identifier: dto.state
    });
    return this.authService.wechatCallback(dto, this.getMeta(request));
  }

  @Post("wechat/bind")
  @HttpCode(200)
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_ME)
  @AuditLog({ module: "认证中心", resource: "system.auth", action: "绑定微信身份" })
  bindWechatIdentity(@CurrentUser() user: JwtPrincipal, @Body() dto: WechatBindDto): Promise<BindIdentityResult> {
    return this.authService.bindWechatIdentity(user, dto);
  }

  @Public()
  @Post("select-context")
  @HttpCode(200)
  selectContext(@Body() dto: SelectContextDto, @Req() request: Request): Promise<LoginResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "select-context",
      ipAddress: this.getIpAddress(request),
      identifier: dto.ticket
    });
    return this.authService.selectContext(dto, this.getMeta(request));
  }

  @Public()
  @Post("token/refresh")
  @HttpCode(200)
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request): Promise<LoginResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "token-refresh",
      ipAddress: this.getIpAddress(request),
      identifier: dto.refreshToken
    });
    return this.authService.refresh(dto, this.getMeta(request));
  }

  @Get("me")
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_ME)
  me(@CurrentUser() user: JwtPrincipal) {
    return this.usersService.getCurrentUserContext({ tenantId: user.tenantId, parkId: user.parkId }, user.sub);
  }

  @Post("logout")
  @HttpCode(200)
  @RequirePermissions(SYSTEM_PERMISSIONS.USER_ME)
  @AuditLog({ module: "认证中心", resource: "system.auth", action: "退出登录" })
  logout(@CurrentUser() user: JwtPrincipal, @Body() dto: Partial<RefreshTokenDto>): Promise<{ userId: string }> {
    return this.authService.logout(user, dto?.refreshToken);
  }

  private getMeta(request: Request) {
    return {
      ipAddress: this.getIpAddress(request),
      userAgent: request.headers["user-agent"] ?? null,
      requestId: this.cls.getId() ?? null
    };
  }

  private getIpAddress(request: Request): string | null {
    return resolveAuthClientIp(request);
  }
}
