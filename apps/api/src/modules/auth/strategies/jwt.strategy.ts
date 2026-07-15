import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPrincipal, JwtSessionClaims } from "../../../shared/types/jwt-principal";
import { TenantsService } from "../../tenants/tenants.service";
import { UsersService } from "../../users/users.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET")
    });
  }

  async validate(payload: JwtSessionClaims): Promise<JwtPrincipal> {
    await this.tenantsService.assertTenantActive(payload.tenantId);
    try {
      return await this.usersService.resolveJwtPrincipal(
        { tenantId: payload.tenantId, parkId: payload.parkId },
        payload.sub
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException("Authentication context is no longer available");
      }
      throw error;
    }
  }
}
