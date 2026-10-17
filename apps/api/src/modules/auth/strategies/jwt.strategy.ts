import {applicationRuntimeMode,type ApplicationRuntimeMode} from "../../../runtime/runtime-mode";
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPrincipal, JwtSessionClaims } from "../../../shared/types/jwt-principal";
import { TenantStatusService } from "../../tenants/tenant-status.service";
import { IdentityDirectoryService } from "../../users/identity-directory.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly runtimeMode:ApplicationRuntimeMode;
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
    this.runtimeMode=applicationRuntimeMode(config);
  }

  async validate(payload: JwtSessionClaims): Promise<JwtPrincipal> {
    if((payload.runtimeMode??"integrated")!==this.runtimeMode)throw new UnauthorizedException("Authentication deployment mode mismatch");
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
