import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ClsService } from "nestjs-cls";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { Public } from "../../shared/decorators/public.decorator";
import { resolveAuthClientIp } from "./auth-client-ip";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import {
  applyRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshCookieConfig,
  readRefreshTokenCookie,
  type RefreshCookieConfig
} from "./auth-refresh-cookie";
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
    private readonly authRateLimitService: AuthRateLimitService,
    private readonly configService: ConfigService
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<LoginResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "login",
      ipAddress: this.getIpAddress(request),
      identifier: buildPasswordLoginRateLimitIdentifier(dto)
    });
    const result = await this.authService.login(dto, {
      ipAddress: this.getIpAddress(request),
      userAgent: request.headers["user-agent"] ?? null,
      requestId: this.cls.getId() ?? null
    });
    return this.withRefreshCookie(result, response);
  }

  @Public()
  @Post("mobile/send-code")
  @HttpCode(200)
  sendMobileCode(@Body() dto: MobileSendCodeDto, @Req() request: Request): Promise<MobileCodeResult> {
    if (this.authService.isSmsLoginEnabled()) {
      this.authRateLimitService.assertAllowed({
        endpoint: "mobile-send-code",
        ipAddress: this.getIpAddress(request),
        identifier: [dto.tenantId, dto.parkId ?? "all-parks", dto.mobile].join(":")
      });
    }
    return this.authService.sendMobileCode(dto, this.getMeta(request));
  }

  @Public()
  @Post("mobile/login")
  @HttpCode(200)
  async mobileLogin(
    @Body() dto: MobileLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<LoginResult> {
    if (this.authService.isSmsLoginEnabled()) {
      this.authRateLimitService.assertAllowed({
        endpoint: "mobile-login",
        ipAddress: this.getIpAddress(request),
        identifier: [dto.tenantId, dto.parkId ?? "all-parks", dto.mobile].join(":")
      });
    }
    const result = await this.authService.mobileLogin(dto, this.getMeta(request));
    return this.withRefreshCookie(result, response);
  }

  @Public()
  @Post("wechat/authorize")
  @HttpCode(200)
  createWechatAuthorization(@Body() dto: WechatAuthorizeDto, @Req() request: Request): Promise<WechatAuthorizeResult> {
    if (this.authService.isWechatLoginEnabled()) {
      this.authRateLimitService.assertAllowed({
        endpoint: "wechat-authorize",
        ipAddress: this.getIpAddress(request),
        identifier: [dto.tenantId, dto.parkId ?? "all-parks"].join(":")
      });
    }
    return this.authService.createWechatAuthorization(dto, this.getMeta(request));
  }

  @Public()
  @Post("wechat/callback")
  @HttpCode(200)
  async wechatCallback(
    @Body() dto: WechatCallbackDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<WechatCallbackResult> {
    if (this.authService.isWechatLoginEnabled()) {
      this.authRateLimitService.assertAllowed({
        endpoint: "wechat-callback",
        ipAddress: this.getIpAddress(request),
        identifier: dto.state
      });
    }
    const result = await this.authService.wechatCallback(dto, this.getMeta(request));
    return this.withRefreshCookie(result, response);
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
  async selectContext(
    @Body() dto: SelectContextDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<LoginResult> {
    this.authRateLimitService.assertAllowed({
      endpoint: "select-context",
      ipAddress: this.getIpAddress(request),
      identifier: dto.ticket
    });
    const result = await this.authService.selectContext(dto, this.getMeta(request));
    return this.withRefreshCookie(result, response);
  }

  @Public()
  @Post("token/refresh")
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<LoginResult> {
    const cookieConfig = getRefreshCookieConfig(this.configService);
    const cookieRefreshToken = readRefreshTokenCookie(request, cookieConfig);
    const bodyRefreshToken = dto.refreshToken;
    const refreshToken = this.resolveRefreshTokenForRefresh(cookieRefreshToken, bodyRefreshToken, response, cookieConfig);
    this.authRateLimitService.assertStableAllowed({
      endpoint: "token-refresh",
      ipAddress: this.getIpAddress(request),
      bucket: "refresh-attempt"
    });
    this.authRateLimitService.assertAllowed({
      endpoint: "token-refresh",
      ipAddress: this.getIpAddress(request),
      identifier: refreshToken
    });
    const result = await this.authService.refresh({ refreshToken }, this.getMeta(request));
    return this.withRefreshCookie(result, response, cookieConfig);
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
  async logout(
    @CurrentUser() user: JwtPrincipal,
    @Body() dto: Partial<RefreshTokenDto>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ userId: string }> {
    const cookieConfig = getRefreshCookieConfig(this.configService);
    const refreshTokens = this.resolveRefreshTokensForLogout(readRefreshTokenCookie(request, cookieConfig), dto?.refreshToken, cookieConfig);
    try {
      if (refreshTokens.length === 0) {
        return await this.authService.logout(user);
      }
      let result: { userId: string } | null = null;
      for (const refreshToken of refreshTokens) {
        result = await this.authService.logout(user, refreshToken);
      }
      return result ?? { userId: user.sub };
    } finally {
      clearRefreshTokenCookie(response, cookieConfig);
    }
  }

  @Public()
  @Post("logout-cookie")
  @HttpCode(200)
  async logoutCookie(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<{ cleared: true }> {
    this.authRateLimitService.assertStableAllowed({
      endpoint: "logout-cookie",
      ipAddress: this.getIpAddress(request),
      bucket: "logout-cookie"
    });
    const cookieConfig = getRefreshCookieConfig(this.configService);
    const refreshToken = readRefreshTokenCookie(request, cookieConfig);
    try {
      if (refreshToken) {
        await this.authService.logoutRefreshToken(refreshToken);
      }
    } catch {
      // Keep the endpoint idempotent and avoid exposing refresh-token state.
    } finally {
      clearRefreshTokenCookie(response, cookieConfig);
    }
    return { cleared: true };
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

  private withRefreshCookie(result: LoginResult, response: Response, cookieConfig = getRefreshCookieConfig(this.configService)): LoginResult {
    return applyRefreshTokenCookie(result, response, cookieConfig);
  }

  private resolveRefreshTokenForRefresh(
    cookieRefreshToken: string | null,
    bodyRefreshToken: string | undefined,
    response: Response,
    cookieConfig: RefreshCookieConfig
  ): string {
    if (cookieRefreshToken) {
      return cookieRefreshToken;
    }
    const refreshToken = cookieConfig.bodyCompat ? bodyRefreshToken : undefined;
    if (!refreshToken) {
      clearRefreshTokenCookie(response, cookieConfig);
      throw new UnauthorizedException("Refresh token expired");
    }
    return refreshToken;
  }

  private resolveRefreshTokensForLogout(
    cookieRefreshToken: string | null,
    bodyRefreshToken: string | undefined,
    cookieConfig: RefreshCookieConfig
  ): string[] {
    const tokens = [cookieRefreshToken, cookieConfig.bodyCompat ? bodyRefreshToken : undefined].filter(
      (token): token is string => Boolean(token)
    );
    return [...new Set(tokens)];
  }
}

export function buildPasswordLoginRateLimitIdentifier(dto: Pick<LoginDto, "tenantId" | "parkId" | "username">): string {
  const username = dto.username.trim() || "empty-username";
  if (dto.tenantId && dto.parkId) {
    return [dto.tenantId, dto.parkId, username].join(":");
  }
  return ["unscoped-tenant", "all-parks", username].join(":");
}
