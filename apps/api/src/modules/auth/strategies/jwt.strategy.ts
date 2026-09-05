import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPrincipal, JwtSessionClaims } from "../../../shared/types/jwt-principal";
import { TenantStatusService } from "../../tenants/tenant-status.service";
import { IdentityDirectoryService } from "../../users/identity-directory.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly tenantsService: TenantStatusService,
    private readonly usersService: IdentityDirectoryService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET")
    });
  }

  async validate(payload: JwtSessionClaims): Promise<JwtPrincipal> {
    const [tenantResult, principalResult] = await Promise.allSettled([
      this.tenantsService.assertTenantActive(payload.tenantId),
      this.usersService.resolveJwtPrincipal(
        { tenantId: payload.tenantId, parkId: payload.parkId },
        payload.sub
      )
    ]);

    if (tenantResult.status === "rejected") {
      throw tenantResult.reason;
    }
    if (principalResult.status === "rejected") {
      if (principalResult.reason instanceof NotFoundException) {
        throw new UnauthorizedException("Authentication context is no longer available");
      }
      throw principalResult.reason;
    }
    const principal = principalResult.value;
    if ((payload.authVersion ?? 1) !== (principal.authVersion ?? 1)) {
      throw new UnauthorizedException("Authentication session has been revoked");
    }
    return principal;
  }
}
