import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { TenantsModule } from "../tenants/tenants.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthPreValidationRateLimitMiddleware } from "./auth-prevalidation-rate-limit.middleware";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthService } from "./auth.service";
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
    TenantsModule,
    UsersModule
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, AuthPreValidationRateLimitMiddleware, JwtStrategy],
  exports: [AuthService]
})
export class AuthModule implements NestModule {
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
