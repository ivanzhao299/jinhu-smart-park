import type {ModuleMetadata, Provider} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { TenantStatusModule } from "../tenants/tenant-status.module";
import { IdentityDirectoryModule } from "../users/identity-directory.module";
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


export function authKernelMetadata(contextImports:NonNullable<ModuleMetadata["imports"]>,contextProvider:Provider):ModuleMetadata {return {
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
    ...contextImports
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, AuthPreValidationRateLimitMiddleware, JwtStrategy, contextProvider],
  exports: [AuthService]
};}
