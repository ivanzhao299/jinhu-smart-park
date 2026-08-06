import { Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreatePropertyOccupancyDto } from "./dto/property-occupancy.dto";
import type {
  OccupancyReplacementInput,
  PropertyOccupancyPort
} from "./property-occupancy.port";
import { PropertyOccupanciesService } from "./property-occupancies.service";

@Injectable()
export class PropertyOccupancyAdapter implements PropertyOccupancyPort {
  constructor(private readonly occupancies: PropertyOccupanciesService) {}

  createInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePropertyOccupancyDto,
    idempotencyKey?: string,
    exclude?: { sourceType?: string; sourceId?: string }
  ) {
    return this.occupancies.createInTransaction(
      manager,
      scope,
      actor,
      dto,
      idempotencyKey,
      exclude
    );
  }

  activateInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ) {
    return this.occupancies.activateInTransaction(manager, scope, actor, id);
  }

  releaseInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    reason: string,
    finalStatus?: "released" | "completed" | "cancelled"
  ) {
    return this.occupancies.releaseInTransaction(
      manager,
      scope,
      actor,
      id,
      reason,
      finalStatus
    );
  }

  replacePeriodInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    expected: OccupancyReplacementInput,
    startAtValue: string,
    endAtValue: string,
    holdExpiresAtValue?: string
  ) {
    return this.occupancies.replacePeriodInTransaction(
      manager,
      scope,
      actor,
      id,
      expected,
      startAtValue,
      endAtValue,
      holdExpiresAtValue
    );
  }
}
