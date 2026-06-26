import { Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { SelectQueryBuilder } from "typeorm";
import { DataScopeService } from "../../data-scopes/data-scope.service";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import { EngineeringAcceptanceEntity } from "../entities/engineering-acceptance.entity";
import { EngineeringDailyReportEntity } from "../entities/engineering-daily-report.entity";
import { EngineeringInspectionEntity } from "../entities/engineering-inspection.entity";
import { EngineeringIssueEntity } from "../entities/engineering-issue.entity";
import { EngineeringPlanEntity } from "../entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "../entities/engineering-project.entity";
import { EngineeringRectificationEntity } from "../entities/engineering-rectification.entity";

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
      builder.andWhere("(project.project_manager_id = :actorUserId OR project.engineering_director_id = :actorUserId OR project.create_by = :actorUserId)", {
        actorUserId: actor.sub
      });
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "org", "project", { org: "org_id" });
  }

  async applyPlanScope(builder: SelectQueryBuilder<EngineeringPlanEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    if (actor.dataScope === "self") {
      builder.andWhere("(plan.owner_user_id = :actorUserId OR plan.create_by = :actorUserId)", {
        actorUserId: actor.sub
      });
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "org", "plan", { org: "owner_org_id" });
  }

  async applyDailyReportScope(
    builder: SelectQueryBuilder<EngineeringDailyReportEntity>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    if (actor.dataScope === "self") {
      builder.andWhere("(report.create_by = :actorUserId OR report.submitted_by = :actorUserId)", {
        actorUserId: actor.sub
      });
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "org", "report", { org: "org_id" });
  }

  async applyInspectionScope(
    builder: SelectQueryBuilder<EngineeringInspectionEntity>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    if (actor.dataScope === "self") {
      builder.andWhere("(inspection.inspector_user_id = :actorUserId OR inspection.create_by = :actorUserId)", {
        actorUserId: actor.sub
      });
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "org", "inspection", { org: "org_id" });
  }

  async applyIssueScope(builder: SelectQueryBuilder<EngineeringIssueEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    if (actor.dataScope === "self") {
      builder.andWhere("(issue.responsible_user_id = :actorUserId OR issue.create_by = :actorUserId)", {
        actorUserId: actor.sub
      });
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "org", "issue", { org: "org_id" });
  }

  async applyRectificationScope(
    builder: SelectQueryBuilder<EngineeringRectificationEntity>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    if (actor.dataScope === "self") {
      builder.andWhere("(rectification.responsible_user_id = :actorUserId OR rectification.create_by = :actorUserId)", {
        actorUserId: actor.sub
      });
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "org", "rectification", { org: "org_id" });
  }

  async applyAcceptanceScope(builder: SelectQueryBuilder<EngineeringAcceptanceEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    if (actor.dataScope === "self") {
      builder.andWhere("(acceptance.responsible_user_id = :actorUserId OR acceptance.create_by = :actorUserId)", {
        actorUserId: actor.sub
      });
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "org", "acceptance", { org: "org_id" });
  }
}
