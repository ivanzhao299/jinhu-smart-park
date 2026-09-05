import { ForbiddenException, Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { FilePropertyUnitAccessPort } from "./file-property-unit-access.port";

@Injectable()
export class HrLeafPropertyUnitAccessAdapter implements FilePropertyUnitAccessPort {
  readonly compositionMode = "hr_leaf" as const;

  assertAccess(_scope: TenantParkScope, _actor: JwtPrincipal, _unitId: string): Promise<never> {
    return Promise.reject(new ForbiddenException("Property file access is unavailable in the HR file module"));
  }

  allowedUnitIds(_scope: TenantParkScope, _actor: JwtPrincipal): Promise<never> {
    return Promise.reject(new ForbiddenException("Property file access is unavailable in the HR file module"));
  }
}
