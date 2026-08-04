import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreatePropertyOccupancyDto } from "./dto/property-occupancy.dto";
import type { PropertyOccupancyEntity } from "./entities/property-occupancy.entity";

export const PROPERTY_OCCUPANCY_PORT = Symbol("PROPERTY_OCCUPANCY_PORT");

export interface OccupancyReplacementInput {
  sourceDomain: string;
  sourceType: string;
  sourceId: string;
  startAt: string;
  endAt: string;
  status: "held" | "active";
}

export interface PropertyOccupancyPort {
  createInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePropertyOccupancyDto,
    idempotencyKey?: string,
    exclude?: { sourceType?: string; sourceId?: string }
  ): Promise<PropertyOccupancyEntity>;

  activateInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<PropertyOccupancyEntity>;

  releaseInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    reason: string,
    finalStatus?: "released" | "completed" | "cancelled"
  ): Promise<PropertyOccupancyEntity>;

  replacePeriodInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    expected: OccupancyReplacementInput,
    startAtValue: string,
    endAtValue: string,
    holdExpiresAtValue?: string
  ): Promise<PropertyOccupancyEntity>;
}
