import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import { TenantsService } from "../../tenants/tenants.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly tenantsService: TenantsService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET")
    });
  }

  async validate(payload: JwtPrincipal): Promise<JwtPrincipal> {
    await this.tenantsService.assertTenantActive(payload.tenantId);
    return payload;
  }
}
