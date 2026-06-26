import { Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { SelectQueryBuilder } from "typeorm";
import { DataScopeService } from "../../data-scopes/data-scope.service";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import { EngineeringProjectEntity } from "../entities/engineering-project.entity";

@Injectable()
export class EngineeringDataScopeAdapter {
  constructor(private readonly dataScopeService: DataScopeService) {}

  async applyProjectScope(
    builder: SelectQueryBuilder<EngineeringProjectEntity>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    if (actor.dataScope === "self") {
      builder.andWhere("(project.project_manager_id = :actorUserId OR project.engineering_director_id = :actorUserId)", {
        actorUserId: actor.sub
      });
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "org", "project", { org: "org_id" });
  }
}
