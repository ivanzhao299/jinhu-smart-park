import { BadRequestException, ConflictException, Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes, randomInt } from "crypto";
import { MoreThan, type Repository } from "typeorm";
import { SYSTEM_PERMISSIONS, type AuthUser } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type { LoginDto } from "./dto/login.dto";
import { TenantsService } from "../tenants/tenants.service";
import type { MobileLoginDto } from "./dto/mobile-login.dto";
import type { MobileSendCodeDto } from "./dto/mobile-send-code.dto";
import type { RefreshTokenDto } from "./dto/refresh-token.dto";
import type { SelectContextDto } from "./dto/select-context.dto";
import type { WechatAuthorizeDto } from "./dto/wechat-authorize.dto";
import type { WechatBindDto } from "./dto/wechat-bind.dto";
import type { WechatCallbackDto } from "./dto/wechat-callback.dto";
import { AuthLoginTicketEntity } from "./entities/auth-login-ticket.entity";
import { AuthOauthStateEntity } from "./entities/auth-oauth-state.entity";
import { AuthOtpCodeEntity } from "./entities/auth-otp-code.entity";
import { AuthRefreshTokenEntity } from "./entities/auth-refresh-token.entity";
import { UserIdentityEntity } from "./entities/user-identity.entity";
import { normalizePasswordLockoutConfig, type PasswordLockoutConfig } from "./auth-password-lockout.policy";
import { UsersService, type PasswordFailureRecordResult } from "../users/users.service";
import type { UserEntity } from "../users/entities/user.entity";

export interface LoginContextOption {
  userId: string;
  username: string;
  realName: string;
  tenantId: string;
  parkId: string;
}

export interface LoginResult {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: "Bearer";
  expiresIn?: string;
  user?: AuthUser;
  requiresContextSelection?: boolean;
  loginTicket?: string;
  contexts?: LoginContextOption[];
}

export interface MobileCodeResult {
  mobile: string;
  expiresIn: number;
  message: string;
  mockCode?: string;
}

export interface WechatAuthorizeResult {
  provider: "wechat_open";
  state: string;
  authorizationUrl: string;
  expiresIn: number;
  mock: boolean;
  message?: string;
}

export interface OAuthProviderProfile {
  provider: "wechat_open";
  providerUserId: string;
  providerUnionId: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  rawProfile: Record<string, unknown>;
}

export interface WechatCallbackResult extends LoginResult {
  requiresIdentityBinding?: boolean;
  bindTicket?: string;
  provider?: "wechat_open";
  profile?: {
    nickname: string | null;
    avatarUrl: string | null;
  };
}

export interface BindIdentityResult {
  provider: "wechat_open";
  providerUserId: string;
  userId: string;
  tenantId: string;
  parkId: string;
}

export interface LoginRequestMeta {
  ipAddress: string | null;
  userAgent: string | string[] | null;
  requestId?: string | null;
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly tenantsService: TenantsService,
    @InjectRepository(UserIdentityEntity)
    private readonly identityRepository: Repository<UserIdentityEntity>,
    @InjectRepository(AuthRefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<AuthRefreshTokenEntity>,
    @InjectRepository(AuthOtpCodeEntity)
    private readonly otpCodeRepository: Repository<AuthOtpCodeEntity>,
    @InjectRepository(AuthOauthStateEntity)
    private readonly oauthStateRepository: Repository<AuthOauthStateEntity>,
    @InjectRepository(AuthLoginTicketEntity)
    private readonly loginTicketRepository: Repository<AuthLoginTicketEntity>
  ) {}

  onModuleInit(): void {
    this.assertProductionAuthSafety();
  }

  async login(dto: LoginDto, meta: LoginRequestMeta): Promise<LoginResult> {
    const username = dto.username.trim();
    const passwordLockoutConfig = this.getPasswordLockoutConfig();
    const now = new Date();
    const scopedLogin = dto.tenantId && dto.parkId;
    const rawCandidates = scopedLogin
      ? [
          await this.usersService.findByUsernameInScope(username, {
            tenantId: dto.tenantId!,
            parkId: dto.parkId!
          })
        ].filter((user): user is UserEntity => Boolean(user))
      : await this.usersService.findLoginCandidatesByUsername(username);
    const candidates = rawCandidates;

    if (candidates.length === 0) {
      await this.recordLoginEvent(
        { tenantId: dto.tenantId ?? "unknown", parkId: dto.parkId ?? "unknown", username, loginMethod: "password" },
        meta,
        null,
        false,
        "Invalid username or password"
      );
      throw new UnauthorizedException("账号或密码错误");
    }

    const matchedUsers: UserEntity[] = [];
    for (const user of candidates) {
      if (await bcrypt.compare(dto.password, user.passwordHash)) {
        matchedUsers.push(user);
      }
    }

    if (matchedUsers.length === 0) {
      const firstCandidate = candidates[0]!;
      const failureResults = await this.recordPasswordFailures(candidates, passwordLockoutConfig, now);
      const lockoutTriggeredResults = failureResults.filter((result) => result.lockoutTriggered);
      if (lockoutTriggeredResults.length > 0) {
        await Promise.all(
          lockoutTriggeredResults.map((result) =>
            this.recordLoginEvent(
              { tenantId: result.user.tenantId, parkId: result.user.parkId, username, loginMethod: "password" },
              meta,
              result.user.id,
              false,
              "Password lockout triggered"
            )
          )
        );
      } else {
        const auditCandidate = failureResults[0]?.user ?? firstCandidate;
        await this.recordLoginEvent(
          { tenantId: auditCandidate.tenantId, parkId: auditCandidate.parkId, username, loginMethod: "password" },
          meta,
          auditCandidate.id,
          false,
          "Invalid username or password"
        );
      }
      throw new UnauthorizedException("账号或密码错误");
    }

    const latestMatchedUsers = passwordLockoutConfig.enabled
      ? await Promise.all(matchedUsers.map((user) => this.usersService.refreshPasswordLockoutState(user, now)))
      : matchedUsers;
    const unlockedMatchedUsers = passwordLockoutConfig.enabled
      ? latestMatchedUsers.filter((user) => !this.usersService.isPasswordLocked(user, now))
      : matchedUsers;
    if (unlockedMatchedUsers.length === 0) {
      const firstMatchedUser = latestMatchedUsers[0]!;
      await this.recordLoginEvent(
        { tenantId: firstMatchedUser.tenantId, parkId: firstMatchedUser.parkId, username, loginMethod: "password" },
        meta,
        firstMatchedUser.id,
        false,
        "Password lockout active"
      );
      throw new UnauthorizedException("账号或密码错误");
    }

    const enabledUsers = unlockedMatchedUsers.filter((user) => !user.isDeleted && user.isEnabled && user.status !== "disabled");
    if (enabledUsers.length === 0) {
      const firstMatchedUser = unlockedMatchedUsers[0]!;
      await this.recordLoginEvent(
        { tenantId: firstMatchedUser.tenantId, parkId: firstMatchedUser.parkId, username, loginMethod: "password" },
        meta,
        firstMatchedUser.id,
        false,
        "User is disabled"
      );
      throw new UnauthorizedException("账号已停用，请联系管理员");
    }

    for (const user of enabledUsers) {
      await this.tenantsService.assertTenantActive(user.tenantId);
    }

    const finalizedUsers = await this.finalizePasswordLoginUsers(enabledUsers, passwordLockoutConfig, now);
    if (finalizedUsers.length === 0) {
      const firstUser = enabledUsers[0]!;
      await this.recordLoginEvent(
        { tenantId: firstUser.tenantId, parkId: firstUser.parkId, username, loginMethod: "password" },
        meta,
        firstUser.id,
        false,
        "Password lockout active"
      );
      throw new UnauthorizedException("账号或密码错误");
    }

    if (finalizedUsers.length > 1) {
      const tenantIds = [...new Set(finalizedUsers.map((user) => user.tenantId))];
      if (tenantIds.length > 1) {
        const firstUser = finalizedUsers[0]!;
        await this.recordLoginEvent(
          { tenantId: firstUser.tenantId, parkId: firstUser.parkId, username, loginMethod: "password" },
          meta,
          firstUser.id,
          false,
          "Multiple tenant contexts require administrator cleanup"
        );
        throw new ConflictException("该账号关联多个租户，请联系管理员设置唯一登录租户");
      }
      const ticket = await this.createLoginTicket(tenantIds[0]!, "password", finalizedUsers.map((user) => user.id));
      return {
        requiresContextSelection: true,
        loginTicket: ticket,
        contexts: finalizedUsers.map((user) => this.toContextOption(user))
      };
    }

    const user = finalizedUsers[0]!;
    await this.ensureIdentity(user, "password", user.username);
    return this.issueLoginResult(user, meta, "password", user.username);
  }

  async sendMobileCode(dto: MobileSendCodeDto, meta: LoginRequestMeta): Promise<MobileCodeResult> {
    this.assertSmsLoginEnabled();
    await this.tenantsService.assertTenantActive(dto.tenantId);
    const scene = dto.scene ?? "login";
    const now = new Date();
    const resendSeconds = Number(this.configService.get<string>("AUTH_SMS_RESEND_SECONDS", "60"));
    const ttlSeconds = Number(this.configService.get<string>("AUTH_SMS_CODE_TTL_SECONDS", "300"));
    const recentCode = await this.otpCodeRepository.findOne({
      where: {
        tenantId: dto.tenantId,
        mobile: dto.mobile,
        scene,
        used: false,
        isDeleted: false,
        expiresAt: MoreThan(now)
      },
      order: { createTime: "DESC" }
    });

    if (recentCode && now.getTime() - recentCode.createTime.getTime() < resendSeconds * 1000) {
      throw new BadRequestException("Please wait before requesting another code");
    }

    const fixedCode = this.configService.get<string>("AUTH_SMS_FIXED_CODE", process.env.NODE_ENV === "production" ? "" : "123456");
    const code = fixedCode || String(randomInt(100000, 1000000));
    await this.otpCodeRepository.save(
      this.otpCodeRepository.create({
        tenantId: dto.tenantId,
        parkId: dto.parkId ?? null,
        mobile: dto.mobile,
        scene,
        codeHash: this.hashOtpCode(dto.mobile, code),
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
        ipAddress: meta.ipAddress,
        remark: "SMS provider integration reserved; code generated by auth center"
      })
    );

    const showMockCode = this.configService.get<string>("AUTH_SMS_CODE_VISIBLE", process.env.NODE_ENV === "production" ? "false" : "true") === "true";
    return {
      mobile: this.maskMobile(dto.mobile),
      expiresIn: ttlSeconds,
      message: "Verification code sent",
      ...(showMockCode ? { mockCode: code } : {})
    };
  }

  async mobileLogin(dto: MobileLoginDto, meta: LoginRequestMeta): Promise<LoginResult> {
    this.assertSmsLoginEnabled();
    await this.tenantsService.assertTenantActive(dto.tenantId);
    await this.verifyMobileCode(dto.tenantId, dto.parkId ?? null, dto.mobile, dto.code);
    const users = await this.usersService.listLoginUsersByMobile(dto.tenantId, dto.mobile, dto.parkId);
    if (users.length === 0) {
      if (dto.parkId) {
        await this.recordLoginEvent(
          { tenantId: dto.tenantId, parkId: dto.parkId, username: this.maskMobile(dto.mobile), loginMethod: "mobile" },
          meta,
          null,
          false,
          "Mobile is not bound to an enabled user"
        );
      }
      throw new UnauthorizedException("Mobile is not bound to an enabled user");
    }

    await Promise.all(users.map((user) => this.ensureIdentity(user, "mobile", dto.mobile)));
    if (!dto.parkId && users.length > 1) {
      const ticket = await this.createLoginTicket(dto.tenantId, "mobile", users.map((user) => user.id));
      return {
        requiresContextSelection: true,
        loginTicket: ticket,
        contexts: users.map((user) => this.toContextOption(user))
      };
    }

    const user = users[0]!;
    return this.issueLoginResult(user, meta, "mobile", this.maskMobile(dto.mobile));
  }

  async createWechatAuthorization(dto: WechatAuthorizeDto, _meta: LoginRequestMeta): Promise<WechatAuthorizeResult> {
    this.assertWechatLoginEnabled();
    await this.tenantsService.assertTenantActive(dto.tenantId);
    const provider = "wechat_open" as const;
    const redirectUri = dto.redirectUri ?? this.configService.get<string>("AUTH_WECHAT_REDIRECT_URI", "");
    if (!redirectUri) {
      throw new BadRequestException("WeChat redirect URI is not configured");
    }
    if (!this.isAllowedRedirectUri(redirectUri)) {
      throw new BadRequestException("Redirect URI is not allowed");
    }

    const ttlSeconds = Number(this.configService.get<string>("AUTH_OAUTH_STATE_TTL_SECONDS", "300"));
    const state = randomBytes(24).toString("hex");
    await this.oauthStateRepository.save(
      this.oauthStateRepository.create({
        tenantId: dto.tenantId,
        parkId: dto.parkId ?? null,
        provider,
        state,
        redirectUri,
        contextJson: {
          action: "login",
          provider,
          parkId: dto.parkId ?? null
        },
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        remark: "WeChat OAuth state"
      })
    );

    const appId = this.configService.get<string>("AUTH_WECHAT_APP_ID", "");
    const mock = !appId || this.isWechatMockEnabled();
    return {
      provider,
      state,
      authorizationUrl: mock
        ? this.buildMockWechatRedirectUrl(redirectUri, state)
        : this.buildWechatAuthorizeUrl(redirectUri, state, appId),
      expiresIn: ttlSeconds,
      mock,
      ...(mock ? { message: "WeChat OAuth is running in local mock mode" } : {})
    };
  }

  async wechatCallback(dto: WechatCallbackDto, meta: LoginRequestMeta): Promise<WechatCallbackResult> {
    this.assertWechatLoginEnabled();
    const oauthState = await this.oauthStateRepository.findOne({
      where: {
        provider: "wechat_open",
        state: dto.state,
        consumed: false,
        isDeleted: false,
        expiresAt: MoreThan(new Date())
      }
    });
    if (!oauthState?.tenantId) {
      throw new UnauthorizedException("OAuth state expired");
    }
    await this.tenantsService.assertTenantActive(oauthState.tenantId);

    const profile = await this.exchangeWechatCode(dto.code, oauthState);
    oauthState.consumed = true;
    oauthState.consumedTime = new Date();
    await this.oauthStateRepository.save(oauthState);

    const users = await this.findUsersByOAuthProfile(oauthState.tenantId, oauthState.parkId, profile);
    if (users.length === 0) {
      const bindTicket = await this.createIdentityBindTicket(oauthState.tenantId, oauthState.parkId, profile);
      await this.recordLoginEvent(
        {
          tenantId: oauthState.tenantId,
          parkId: oauthState.parkId ?? "0",
          username: profile.nickname ?? profile.providerUserId,
          loginMethod: profile.provider
        },
        meta,
        null,
        false,
        "WeChat identity is not bound to a platform account"
      );
      return {
        requiresIdentityBinding: true,
        bindTicket,
        provider: profile.provider,
        profile: {
          nickname: profile.nickname,
          avatarUrl: profile.avatarUrl
        }
      };
    }

    if (!oauthState.parkId && users.length > 1) {
      const ticket = await this.createLoginTicket(
        oauthState.tenantId,
        profile.provider,
        users.map((user) => user.id)
      );
      return {
        requiresContextSelection: true,
        loginTicket: ticket,
        contexts: users.map((user) => this.toContextOption(user))
      };
    }

    const user = users[0]!;
    await this.ensureIdentityFromProfile(user, profile);
    return this.issueLoginResult(user, meta, profile.provider, profile.nickname ?? profile.providerUserId);
  }

  async bindWechatIdentity(user: JwtPrincipal, dto: WechatBindDto): Promise<BindIdentityResult> {
    const ticket = await this.loginTicketRepository.findOne({
      where: {
        tenantId: user.tenantId,
        provider: "wechat_open_bind",
        ticket: dto.bindTicket,
        used: false,
        isDeleted: false,
        expiresAt: MoreThan(new Date())
      }
    });
    if (!ticket) {
      throw new UnauthorizedException("Bind ticket expired");
    }

    const profile = this.getOAuthProfileFromTicket(ticket.contextPayload);
    const parkId = this.readString(ticket.contextPayload, "parkId") ?? user.parkId;
    const currentUser = await this.usersService.findByIdInScope(user.sub, { tenantId: user.tenantId, parkId });
    if (!currentUser || !currentUser.isEnabled || currentUser.isDeleted) {
      throw new UnauthorizedException("Current user context is unavailable");
    }

    const existing = await this.identityRepository.findOne({
      where: {
        tenantId: user.tenantId,
        parkId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        isDeleted: false
      }
    });
    if (existing && existing.userId !== user.sub) {
      throw new ConflictException("WeChat identity is already bound to another account");
    }
    if (existing) {
      ticket.used = true;
      ticket.usedTime = new Date();
      await this.loginTicketRepository.save(ticket);
      return {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        userId: user.sub,
        tenantId: user.tenantId,
        parkId
      };
    }

    await this.identityRepository.save(
      this.identityRepository.create({
        tenantId: user.tenantId,
        parkId,
        userId: user.sub,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        providerUnionId: profile.providerUnionId,
        mobile: currentUser.mobile,
        email: currentUser.email,
        nickname: profile.nickname ?? currentUser.displayName,
        avatarUrl: profile.avatarUrl ?? currentUser.avatarUrl,
        rawProfileJson: profile.rawProfile,
        bindStatus: "bound",
        lastLoginTime: new Date(),
        createBy: user.sub,
        updateBy: user.sub
      })
    );
    ticket.used = true;
    ticket.usedTime = new Date();
    await this.loginTicketRepository.save(ticket);
    return {
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      userId: user.sub,
      tenantId: user.tenantId,
      parkId
    };
  }

  async selectContext(dto: SelectContextDto, meta: LoginRequestMeta): Promise<LoginResult> {
    await this.tenantsService.assertTenantActive(dto.tenantId);
    const ticket = await this.loginTicketRepository.findOne({
      where: {
        tenantId: dto.tenantId,
        ticket: dto.ticket,
        used: false,
        isDeleted: false,
        expiresAt: MoreThan(new Date())
      }
    });
    if (!ticket) {
      throw new UnauthorizedException("Login ticket expired");
    }

    const userIds = this.getTicketUserIds(ticket.contextPayload);
    if (!userIds.includes(dto.userId)) {
      throw new BadRequestException("Selected context is not allowed");
    }

    const user = await this.usersService.findByIdInScope(dto.userId, {
      tenantId: dto.tenantId,
      parkId: dto.parkId
    });
    if (!user || !user.isEnabled || user.isDeleted) {
      throw new UnauthorizedException("Selected user context is unavailable");
    }

    const loginMethod = ticket.provider;
    let selectedUser = user;
    if (loginMethod === "password") {
      const passwordLockoutConfig = this.getPasswordLockoutConfig();
      const now = new Date();
      if (passwordLockoutConfig.enabled) {
        selectedUser = await this.usersService.refreshPasswordLockoutState(selectedUser, now);
        if (this.usersService.isPasswordLocked(selectedUser, now)) {
          await this.recordLoginEvent(
            { tenantId: selectedUser.tenantId, parkId: selectedUser.parkId, username: selectedUser.username, loginMethod: "password" },
            meta,
            selectedUser.id,
            false,
            "Password lockout active"
          );
          throw new UnauthorizedException("账号或密码错误");
        }
      }
      const finalized = await this.usersService.finalizePasswordLoginSuccess(selectedUser, passwordLockoutConfig, now);
      if (!finalized.allowed) {
        await this.recordLoginEvent(
          { tenantId: finalized.user.tenantId, parkId: finalized.user.parkId, username: finalized.user.username, loginMethod: "password" },
          meta,
          finalized.user.id,
          false,
          finalized.lockoutActive ? "Password lockout active" : "Invalid username or password"
        );
        throw new UnauthorizedException("账号或密码错误");
      }
      selectedUser = finalized.user;
    }

    ticket.used = true;
    ticket.usedTime = new Date();
    await this.loginTicketRepository.save(ticket);
    return this.issueLoginResult(selectedUser, meta, loginMethod, selectedUser.username);
  }

  async refresh(dto: RefreshTokenDto, meta: LoginRequestMeta): Promise<LoginResult> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: {
        tokenHash,
        revoked: false,
        isDeleted: false,
        expiresAt: MoreThan(new Date())
      }
    });
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token expired");
    }

    const user = await this.usersService.findByIdInScope(refreshToken.userId, {
      tenantId: refreshToken.tenantId,
      parkId: refreshToken.parkId
    });
    if (!user || !user.isEnabled || user.isDeleted) {
      throw new UnauthorizedException("Refresh token user unavailable");
    }

    refreshToken.revoked = true;
    refreshToken.revokedTime = new Date();
    await this.refreshTokenRepository.save(refreshToken);
    return this.issueLoginResult(user, meta, "refresh_token", user.username);
  }

  isSmsLoginEnabled(): boolean {
    return !this.isProduction();
  }

  isWechatLoginEnabled(): boolean {
    return !this.isProduction();
  }

  async logout(user: JwtPrincipal, refreshToken?: string): Promise<{ userId: string }> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepository.update(
        {
          tenantId: user.tenantId,
          parkId: user.parkId,
          userId: user.sub,
          tokenHash,
          revoked: false,
          isDeleted: false
        },
        { revoked: true, revokedTime: new Date(), updateBy: user.sub }
      );
    }
    return { userId: user.sub };
  }

  private async issueLoginResult(
    user: UserEntity,
    meta: LoginRequestMeta,
    loginMethod: string,
    loginUsername: string
  ): Promise<LoginResult> {
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
      refreshToken: await this.createRefreshToken(user, meta),
      tokenType: "Bearer",
      expiresIn: this.configService.get<string>("JWT_EXPIRES_IN", "2h"),
      user: authUser
    };
    await this.usersService.recordSuccessfulLogin({ tenantId: user.tenantId, parkId: user.parkId }, user.id, meta.ipAddress);
    await this.recordLoginEvent(
      { tenantId: user.tenantId, parkId: user.parkId, username: loginUsername, loginMethod },
      meta,
      user.id,
      true,
      "success"
    );
    return result;
  }

  private async recordLoginEvent(
    login: { tenantId: string; parkId: string; username: string; loginMethod: string },
    meta: LoginRequestMeta,
    userId: string | null,
    success: boolean,
    message: string
  ): Promise<void> {
    await this.auditService.recordLogin({
      tenantId: login.tenantId,
      parkId: login.parkId,
      userId,
      username: login.username,
      ipAddress: meta.ipAddress,
      userAgent: this.normalizeUserAgent(meta.userAgent),
      loginMethod: login.loginMethod,
      success,
      message,
      requestId: meta.requestId ?? null
    });
  }

  private async recordPasswordFailures(users: UserEntity[], config: PasswordLockoutConfig, now: Date): Promise<PasswordFailureRecordResult[]> {
    if (!config.enabled) {
      return [];
    }

    const results: PasswordFailureRecordResult[] = [];
    for (const user of users) {
      if (this.usersService.isPasswordLocked(user, now)) {
        continue;
      }
      results.push(await this.usersService.recordPasswordFailure(user, config, now));
    }
    return results;
  }

  private async finalizePasswordLoginUsers(users: UserEntity[], config: PasswordLockoutConfig, now: Date): Promise<UserEntity[]> {
    const finalizedUsers: UserEntity[] = [];
    for (const user of users) {
      const result = await this.usersService.finalizePasswordLoginSuccess(user, config, now);
      if (result.allowed) {
        finalizedUsers.push(result.user);
      }
    }
    return finalizedUsers;
  }

  private getPasswordLockoutConfig(): PasswordLockoutConfig {
    return normalizePasswordLockoutConfig({
      enabled: this.readBooleanConfig("AUTH_PASSWORD_LOCKOUT_ENABLED", true),
      failureLimit: this.readNumberConfig("AUTH_PASSWORD_LOCKOUT_FAILURE_LIMIT"),
      windowMs: this.readNumberConfig("AUTH_PASSWORD_LOCKOUT_WINDOW_MS"),
      durationMs: this.readNumberConfig("AUTH_PASSWORD_LOCKOUT_DURATION_MS"),
      resetOnSuccess: this.readBooleanConfig("AUTH_PASSWORD_LOCKOUT_RESET_ON_SUCCESS", true)
    });
  }

  private readNumberConfig(key: string): number | undefined {
    const configured = Number(this.configService.get<string>(key, ""));
    return Number.isFinite(configured) ? configured : undefined;
  }

  private readBooleanConfig(key: string, fallback: boolean): boolean {
    const configured = (this.configService.get<string>(key, "") ?? "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(configured)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(configured)) {
      return false;
    }
    return fallback;
  }

  private async createRefreshToken(user: UserEntity, meta: LoginRequestMeta): Promise<string> {
    const rawToken = randomBytes(48).toString("hex");
    const expiresDays = Number(this.configService.get<string>("AUTH_REFRESH_EXPIRES_DAYS", "30"));
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        tenantId: user.tenantId,
        parkId: user.parkId,
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        userAgent: this.normalizeUserAgent(meta.userAgent),
        ipAddress: meta.ipAddress,
        expiresAt: new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000),
        createBy: user.id,
        updateBy: user.id
      })
    );
    return rawToken;
  }

  private async createLoginTicket(tenantId: string, provider: string, userIds: string[]): Promise<string> {
    const ticket = randomBytes(32).toString("hex");
    const ttlSeconds = Number(this.configService.get<string>("AUTH_LOGIN_TICKET_TTL_SECONDS", "300"));
    await this.loginTicketRepository.save(
      this.loginTicketRepository.create({
        tenantId,
        provider,
        ticket,
        contextPayload: { userIds },
        expiresAt: new Date(Date.now() + ttlSeconds * 1000)
      })
    );
    return ticket;
  }

  private async createIdentityBindTicket(
    tenantId: string,
    parkId: string | null,
    profile: OAuthProviderProfile
  ): Promise<string> {
    const ticket = randomBytes(32).toString("hex");
    const ttlSeconds = Number(this.configService.get<string>("AUTH_LOGIN_TICKET_TTL_SECONDS", "300"));
    await this.loginTicketRepository.save(
      this.loginTicketRepository.create({
        tenantId,
        provider: "wechat_open_bind",
        ticket,
        contextPayload: {
          type: "oauth_bind",
          provider: profile.provider,
          parkId,
          profile
        },
        expiresAt: new Date(Date.now() + ttlSeconds * 1000)
      })
    );
    return ticket;
  }

  private async ensureIdentity(user: UserEntity, provider: string, providerUserId: string): Promise<void> {
    const exists = await this.identityRepository.exists({
      where: {
        tenantId: user.tenantId,
        parkId: user.parkId,
        provider,
        providerUserId,
        isDeleted: false
      }
    });
    if (exists) {
      await this.identityRepository.update(
        {
          tenantId: user.tenantId,
          parkId: user.parkId,
          provider,
          providerUserId,
          isDeleted: false
        },
        { lastLoginTime: new Date(), updateBy: user.id }
      );
      return;
    }

    await this.identityRepository.save(
      this.identityRepository.create({
        tenantId: user.tenantId,
        parkId: user.parkId,
        userId: user.id,
        provider,
        providerUserId,
        mobile: user.mobile,
        email: user.email,
        nickname: user.displayName,
        avatarUrl: user.avatarUrl,
        bindStatus: "bound",
        lastLoginTime: new Date(),
        createBy: user.id,
        updateBy: user.id
      })
    );
  }

  private async ensureIdentityFromProfile(user: UserEntity, profile: OAuthProviderProfile): Promise<void> {
    const identity = await this.identityRepository.findOne({
      where: {
        tenantId: user.tenantId,
        parkId: user.parkId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        isDeleted: false
      }
    });
    if (!identity) {
      await this.identityRepository.save(
        this.identityRepository.create({
          tenantId: user.tenantId,
          parkId: user.parkId,
          userId: user.id,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
          providerUnionId: profile.providerUnionId,
          mobile: user.mobile,
          email: user.email,
          nickname: profile.nickname ?? user.displayName,
          avatarUrl: profile.avatarUrl ?? user.avatarUrl,
          rawProfileJson: profile.rawProfile,
          bindStatus: "bound",
          lastLoginTime: new Date(),
          createBy: user.id,
          updateBy: user.id
        })
      );
      return;
    }

    identity.providerUnionId = profile.providerUnionId ?? identity.providerUnionId;
    identity.nickname = profile.nickname ?? identity.nickname;
    identity.avatarUrl = profile.avatarUrl ?? identity.avatarUrl;
    identity.rawProfileJson = profile.rawProfile;
    identity.lastLoginTime = new Date();
    identity.updateBy = user.id;
    await this.identityRepository.save(identity);
  }

  private async findUsersByOAuthProfile(
    tenantId: string,
    parkId: string | null,
    profile: OAuthProviderProfile
  ): Promise<UserEntity[]> {
    const identities = await this.identityRepository.find({
      where: {
        tenantId,
        ...(parkId ? { parkId } : {}),
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        isDeleted: false
      },
      order: { createTime: "ASC" }
    });
    const users: UserEntity[] = [];
    for (const identity of identities) {
      const resolvedUser = await this.usersService.findByIdInScope(identity.userId, {
        tenantId: identity.tenantId,
        parkId: identity.parkId
      });
      if (resolvedUser?.isEnabled && !resolvedUser.isDeleted) {
        users.push(resolvedUser);
      }
    }
    return users;
  }

  private async exchangeWechatCode(code: string, oauthState: AuthOauthStateEntity): Promise<OAuthProviderProfile> {
    if (this.isProduction() && code.startsWith("mock:")) {
      throw new UnauthorizedException("WeChat mock callback is not allowed in production");
    }
    const appId = this.configService.get<string>("AUTH_WECHAT_APP_ID", "");
    const appSecret = this.configService.get<string>("AUTH_WECHAT_APP_SECRET", "");
    if (!appId || !appSecret || this.isWechatMockEnabled() || code.startsWith("mock:")) {
      return this.createMockWechatProfile(code, oauthState.state);
    }

    const accessTokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
    accessTokenUrl.searchParams.set("appid", appId);
    accessTokenUrl.searchParams.set("secret", appSecret);
    accessTokenUrl.searchParams.set("code", code);
    accessTokenUrl.searchParams.set("grant_type", "authorization_code");
    const tokenResponse = await fetch(accessTokenUrl);
    const tokenPayload = this.asRecord(await tokenResponse.json());
    const tokenError = this.readString(tokenPayload, "errmsg");
    if (!tokenResponse.ok || tokenError) {
      throw new UnauthorizedException(tokenError ?? "WeChat OAuth token exchange failed");
    }

    const openId = this.readString(tokenPayload, "openid");
    const accessToken = this.readString(tokenPayload, "access_token");
    if (!openId || !accessToken) {
      throw new UnauthorizedException("WeChat OAuth token response is incomplete");
    }

    const profileUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
    profileUrl.searchParams.set("access_token", accessToken);
    profileUrl.searchParams.set("openid", openId);
    profileUrl.searchParams.set("lang", "zh_CN");
    const profileResponse = await fetch(profileUrl);
    const profilePayload = this.asRecord(await profileResponse.json());
    const profileError = this.readString(profilePayload, "errmsg");
    if (!profileResponse.ok || profileError) {
      throw new UnauthorizedException(profileError ?? "WeChat profile fetch failed");
    }

    return {
      provider: "wechat_open",
      providerUserId: openId,
      providerUnionId: this.readString(profilePayload, "unionid"),
      nickname: this.readString(profilePayload, "nickname"),
      avatarUrl: this.readString(profilePayload, "headimgurl"),
      rawProfile: profilePayload
    };
  }

  private createMockWechatProfile(code: string, state: string): OAuthProviderProfile {
    const seed = code.startsWith("mock:") ? code.slice(5) : code;
    const providerUserId = `mock_${createHash("sha256").update(`${seed}:${state}`).digest("hex").slice(0, 32)}`;
    return {
      provider: "wechat_open",
      providerUserId,
      providerUnionId: null,
      nickname: "微信模拟用户",
      avatarUrl: null,
      rawProfile: {
        mode: "mock",
        seed,
        providerUserId
      }
    };
  }

  private buildWechatAuthorizeUrl(redirectUri: string, state: string, appId: string): string {
    const authorizeUrl = new URL(
      this.configService.get<string>("AUTH_WECHAT_AUTHORIZE_URL", "https://open.weixin.qq.com/connect/qrconnect")
    );
    authorizeUrl.searchParams.set("appid", appId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", this.configService.get<string>("AUTH_WECHAT_SCOPE", "snsapi_login"));
    authorizeUrl.searchParams.set("state", state);
    return `${authorizeUrl.toString()}#wechat_redirect`;
  }

  private buildMockWechatRedirectUrl(redirectUri: string, state: string): string {
    const url = new URL(redirectUri);
    url.searchParams.set("code", `mock:${state}`);
    url.searchParams.set("state", state);
    return url.toString();
  }

  private isWechatMockEnabled(): boolean {
    return (
      this.configService.get<string>("AUTH_WECHAT_MOCK_ENABLED", process.env.NODE_ENV === "production" ? "false" : "true") ===
      "true"
    );
  }

  private assertProductionAuthSafety(): void {
    if (!this.isProduction()) {
      return;
    }

    const fixedCode = this.configService.get<string>("AUTH_SMS_FIXED_CODE", "");
    if (fixedCode.trim().length > 0) {
      throw new Error("AUTH_SMS_FIXED_CODE must be empty in production");
    }

    const showMockCode = this.configService.get<string>("AUTH_SMS_CODE_VISIBLE", "false");
    if (showMockCode === "true") {
      throw new Error("AUTH_SMS_CODE_VISIBLE must be false in production");
    }

    if (this.isWechatMockEnabled()) {
      throw new Error("AUTH_WECHAT_MOCK_ENABLED must be false in production");
    }
  }

  private assertSmsLoginEnabled(): void {
    if (!this.isSmsLoginEnabled()) {
      throw new BadRequestException("短信验证码登录未启用");
    }
  }

  private assertWechatLoginEnabled(): void {
    if (!this.isWechatLoginEnabled()) {
      throw new BadRequestException("微信扫码登录未启用");
    }
  }

  private isProduction(): boolean {
    return this.configService.get<string>("NODE_ENV", process.env.NODE_ENV ?? "development") === "production";
  }

  private isAllowedRedirectUri(redirectUri: string): boolean {
    let url: URL;
    try {
      url = new URL(redirectUri);
    } catch {
      return false;
    }
    const configuredRedirectUri = this.configService.get<string>("AUTH_WECHAT_REDIRECT_URI", "");
    if (configuredRedirectUri && redirectUri === configuredRedirectUri) {
      return true;
    }
    const allowedOrigins = this.configService
      .get<string>("AUTH_WECHAT_ALLOWED_REDIRECT_ORIGINS", "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (allowedOrigins.includes(url.origin)) {
      return true;
    }
    return process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  }

  private getOAuthProfileFromTicket(payload: Record<string, unknown>): OAuthProviderProfile {
    const profile = this.asRecord(payload.profile);
    const provider = this.readString(profile, "provider");
    const providerUserId = this.readString(profile, "providerUserId");
    if (provider !== "wechat_open" || !providerUserId) {
      throw new UnauthorizedException("Bind ticket payload is invalid");
    }
    return {
      provider,
      providerUserId,
      providerUnionId: this.readString(profile, "providerUnionId"),
      nickname: this.readString(profile, "nickname"),
      avatarUrl: this.readString(profile, "avatarUrl"),
      rawProfile: this.asRecord(profile.rawProfile)
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private readString(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private async verifyMobileCode(tenantId: string, parkId: string | null, mobile: string, code: string): Promise<void> {
    const otpCode = await this.otpCodeRepository.findOne({
      where: {
        tenantId,
        mobile,
        scene: "login",
        used: false,
        isDeleted: false,
        expiresAt: MoreThan(new Date())
      },
      order: { createTime: "DESC" }
    });
    if (!otpCode || (parkId && otpCode.parkId && otpCode.parkId !== parkId)) {
      throw new UnauthorizedException("Invalid verification code");
    }
    if (otpCode.attemptCount >= 5) {
      throw new UnauthorizedException("Verification code attempts exceeded");
    }
    if (otpCode.codeHash !== this.hashOtpCode(mobile, code)) {
      otpCode.attemptCount += 1;
      await this.otpCodeRepository.save(otpCode);
      throw new UnauthorizedException("Invalid verification code");
    }
    otpCode.used = true;
    otpCode.usedTime = new Date();
    await this.otpCodeRepository.save(otpCode);
  }

  private toContextOption(user: UserEntity): LoginContextOption {
    return {
      userId: user.id,
      username: user.username,
      realName: user.displayName,
      tenantId: user.tenantId,
      parkId: user.parkId
    };
  }

  private getTicketUserIds(payload: Record<string, unknown>): string[] {
    const userIds = payload.userIds;
    if (!Array.isArray(userIds)) {
      return [];
    }
    return userIds.filter((item): item is string => typeof item === "string");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private hashOtpCode(mobile: string, code: string): string {
    return createHash("sha256").update(`${mobile}:${code}`).digest("hex");
  }

  private normalizeUserAgent(userAgent: string | string[] | null): string | null {
    return Array.isArray(userAgent) ? userAgent.join(";") : userAgent;
  }

  private maskMobile(mobile: string): string {
    return mobile.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
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
