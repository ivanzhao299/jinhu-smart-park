import { Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type { FilePropertyUnitAccessPort } from "./file-property-unit-access.port";

@Injectable()
export class IntegratedPropertyUnitAccessAdapter implements FilePropertyUnitAccessPort {
  readonly compositionMode = "integrated" as const;

  constructor(private readonly propertyUnitAccessService: PropertyUnitAccessService) {}

  assertAccess(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<unknown> {
    return this.propertyUnitAccessService.assertAccess(scope, actor, unitId);
  }

  allowedUnitIds(scope: TenantParkScope, actor: JwtPrincipal): Promise<string[] | null> {
    return this.propertyUnitAccessService.allowedUnitIds(scope, actor);
  }
}
