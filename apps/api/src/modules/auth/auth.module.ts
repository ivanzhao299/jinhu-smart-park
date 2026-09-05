import { DynamicModule, MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { TenantStatusModule } from "../tenants/tenant-status.module";
import { UsersModule } from "../users/users.module";
import { IdentityDirectoryModule } from "../users/identity-directory.module";
import { AuthController } from "./auth.controller";
import { AuthPreValidationRateLimitMiddleware } from "./auth-prevalidation-rate-limit.middleware";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AUTH_REFRESH_SCOPE_WRITER } from "./auth-refresh-scope-writer";
import { AuthService } from "./auth.service";
import { SmartParkRefreshScopeWriter } from "./smart-park-refresh-scope-writer";
import { AuthLoginTicketEntity } from "./entities/auth-login-ticket.entity";
import { AuthOauthStateEntity } from "./entities/auth-oauth-state.entity";
import { AuthOtpCodeEntity } from "./entities/auth-otp-code.entity";
import { AuthPolicyEntity } from "./entities/auth-policy.entity";
import { AuthRefreshTokenEntity } from "./entities/auth-refresh-token.entity";
import { UserIdentityEntity } from "./entities/user-identity.entity";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRES_IN", "2h") }
      })
    }),
    TypeOrmModule.forFeature([
      UserIdentityEntity,
      AuthRefreshTokenEntity,
      AuthOtpCodeEntity,
      AuthOauthStateEntity,
      AuthLoginTicketEntity,
      AuthPolicyEntity
    ]),
    AuditModule,
    TenantStatusModule,
    IdentityDirectoryModule,
    // /auth/me still uses the integrated user-context/menu projection.
    UsersModule
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, AuthPreValidationRateLimitMiddleware, JwtStrategy],
  exports: [AuthService]
})
export class AuthModule implements NestModule {
  static withParkScopeTransition(): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        SmartParkRefreshScopeWriter,
        {
          provide: AUTH_REFRESH_SCOPE_WRITER,
          useExisting: SmartParkRefreshScopeWriter
        }
      ]
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthPreValidationRateLimitMiddleware).forRoutes(
      { path: "auth/login", method: RequestMethod.POST },
      { path: "auth/token/refresh", method: RequestMethod.POST },
      { path: "auth/select-context", method: RequestMethod.POST },
      { path: "auth/mobile/send-code", method: RequestMethod.POST },
      { path: "auth/mobile/login", method: RequestMethod.POST },
      { path: "auth/wechat/authorize", method: RequestMethod.POST },
      { path: "auth/wechat/callback", method: RequestMethod.POST }
    );
  }
}
