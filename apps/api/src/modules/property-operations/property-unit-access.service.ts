import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { UnitEntity } from "../units/entities/unit.entity";

@Injectable()
export class PropertyUnitAccessService {
  constructor(
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    private readonly dataScopeService: DataScopeService
  ) {}

  async assertAccess(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<UnitEntity> {
    const unit = await this.unitsRepository.findOne({
      where: { id: unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!unit) throw new NotFoundException("Unit not found");
    const allowedIds = await this.allowedUnitIds(scope, actor);
    if (allowedIds !== null && !allowedIds.includes(unitId)) {
      throw new ForbiddenException("Unit is outside current data scope");
    }
    return unit;
  }

  async allowedUnitIds(scope: TenantParkScope, actor: JwtPrincipal): Promise<string[] | null> {
    if (actor.isSuper || actor.permissions.includes("*")) return null;
    const filters = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit")
    ]);
    if (filters.every((filter) => filter.unrestricted)) return null;
    const builder = this.unitsRepository.createQueryBuilder("unit")
      .select("unit.id", "id")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.is_deleted = false");
    const columns = {
      park: "park_id",
      building: "building_id",
      floor: "floor_id",
      unit: "id"
    } as const;
    for (const filter of filters) {
      if (filter.unrestricted) continue;
      const column = columns[filter.dimension as keyof typeof columns];
      if (!column || filter.allowed_ids.length === 0) return [];
      const parameter = `propertyScope${filter.dimension.replace(/_/g, "")}Ids`;
      builder.andWhere(`unit.${column} IN (:...${parameter})`, { [parameter]: filter.allowed_ids });
    }
    const rows = await builder.getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }
}
