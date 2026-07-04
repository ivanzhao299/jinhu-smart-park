import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { FloorEntity } from "../floors/entities/floor.entity";
import { OrgEntity } from "../orgs/entities/org.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";
import { EngineeringInspectionEntity } from "./entities/engineering-inspection.entity";
import { EngineeringIssueEntity } from "./entities/engineering-issue.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";

export interface EngineeringReferenceItem {
  id: string;
}

export interface EngineeringReferenceResponse {
  projects: Array<EngineeringReferenceItem & { projectCode: string; projectName: string }>;
  plans: Array<EngineeringReferenceItem & { projectId: string; planCode: string; planName: string }>;
  dailyReports: Array<EngineeringReferenceItem & { projectId: string; planId: string | null; reportCode: string; reportDate: string }>;
  inspections: Array<EngineeringReferenceItem & { projectId: string; planId: string | null; dailyReportId: string | null; inspectionCode: string; inspectionTitle: string }>;
  issues: Array<EngineeringReferenceItem & { projectId: string; inspectionId: string | null; issueCode: string; issueTitle: string }>;
  orgs: Array<EngineeringReferenceItem & { orgCode: string; orgName: string; status: string }>;
  buildings: Array<EngineeringReferenceItem & { buildingCode: string; buildingName: string }>;
  floors: Array<EngineeringReferenceItem & { buildingId: string; floorCode: string; floorName: string }>;
  units: Array<EngineeringReferenceItem & { buildingId: string; floorId: string; unitCode: string; unitName: string }>;
  users: Array<EngineeringReferenceItem & { username: string; displayName: string | null; realName: string | null; status: string }>;
}

const REFERENCE_LIMIT = 200;

@Injectable()
export class EngineeringReferencesService {
  constructor(
    @InjectRepository(EngineeringProjectEntity)
    private readonly projectsRepository: Repository<EngineeringProjectEntity>,
    @InjectRepository(EngineeringPlanEntity)
    private readonly plansRepository: Repository<EngineeringPlanEntity>,
    @InjectRepository(EngineeringDailyReportEntity)
    private readonly dailyReportsRepository: Repository<EngineeringDailyReportEntity>,
    @InjectRepository(EngineeringInspectionEntity)
    private readonly inspectionsRepository: Repository<EngineeringInspectionEntity>,
    @InjectRepository(EngineeringIssueEntity)
    private readonly issuesRepository: Repository<EngineeringIssueEntity>,
    @InjectRepository(OrgEntity)
    private readonly orgsRepository: Repository<OrgEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter
  ) {}

  async getReferences(scope: TenantParkScope, actor: JwtPrincipal): Promise<EngineeringReferenceResponse> {
    const [projects, plans, dailyReports, inspections, issues, orgs, buildings, floors, units, users] = await Promise.all([
      this.listProjects(scope, actor),
      this.listPlans(scope, actor),
      this.listDailyReports(scope, actor),
      this.listInspections(scope, actor),
      this.listIssues(scope, actor),
      this.listOrgs(scope),
      this.listBuildings(scope),
      this.listFloors(scope),
      this.listUnits(scope),
      this.listUsers(scope)
    ]);

    return {
      projects,
      plans,
      dailyReports,
      inspections,
      issues,
      orgs,
      buildings,
      floors,
      units,
      users
    };
  }

  private async listProjects(scope: TenantParkScope, actor: JwtPrincipal): Promise<EngineeringReferenceResponse["projects"]> {
    const builder = this.projectsRepository.createQueryBuilder("project")
      .where("project.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("project.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("project.is_deleted = false")
      .orderBy("project.create_time", "DESC")
      .take(REFERENCE_LIMIT);
    await this.dataScopeAdapter.applyProjectScope(builder, scope, actor);
    const items = await builder.getMany();
    return items.map((item) => ({
      id: item.id,
      projectCode: item.projectCode,
      projectName: item.projectName
    }));
  }

  private async listPlans(scope: TenantParkScope, actor: JwtPrincipal): Promise<EngineeringReferenceResponse["plans"]> {
    const builder = this.plansRepository.createQueryBuilder("plan")
      .where("plan.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("plan.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("plan.is_deleted = false")
      .orderBy("plan.create_time", "DESC")
      .take(REFERENCE_LIMIT);
    await this.dataScopeAdapter.applyPlanScope(builder, scope, actor);
    const items = await builder.getMany();
    return items.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      planCode: item.planCode,
      planName: item.planName
    }));
  }

  private async listDailyReports(scope: TenantParkScope, actor: JwtPrincipal): Promise<EngineeringReferenceResponse["dailyReports"]> {
    const builder = this.dailyReportsRepository.createQueryBuilder("report")
      .where("report.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("report.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("report.is_deleted = false")
      .orderBy("report.report_date", "DESC")
      .take(REFERENCE_LIMIT);
    await this.dataScopeAdapter.applyDailyReportScope(builder, scope, actor);
    const items = await builder.getMany();
    return items.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      planId: item.planId,
      reportCode: item.reportCode,
      reportDate: item.reportDate
    }));
  }

  private async listInspections(scope: TenantParkScope, actor: JwtPrincipal): Promise<EngineeringReferenceResponse["inspections"]> {
    const builder = this.inspectionsRepository.createQueryBuilder("inspection")
      .where("inspection.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("inspection.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("inspection.is_deleted = false")
      .orderBy("inspection.create_time", "DESC")
      .take(REFERENCE_LIMIT);
    await this.dataScopeAdapter.applyInspectionScope(builder, scope, actor);
    const items = await builder.getMany();
    return items.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      planId: item.planId,
      dailyReportId: item.dailyReportId,
      inspectionCode: item.inspectionCode,
      inspectionTitle: item.inspectionTitle
    }));
  }

  private async listIssues(scope: TenantParkScope, actor: JwtPrincipal): Promise<EngineeringReferenceResponse["issues"]> {
    const builder = this.issuesRepository.createQueryBuilder("issue")
      .where("issue.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("issue.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("issue.is_deleted = false")
      .orderBy("issue.create_time", "DESC")
      .take(REFERENCE_LIMIT);
    await this.dataScopeAdapter.applyIssueScope(builder, scope, actor);
    const items = await builder.getMany();
    return items.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      inspectionId: item.inspectionId,
      issueCode: item.issueCode,
      issueTitle: item.issueTitle
    }));
  }

  private async listOrgs(scope: TenantParkScope): Promise<EngineeringReferenceResponse["orgs"]> {
    const items = await this.orgsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: "enabled"
      },
      order: {
        sortOrder: "ASC",
        orgCode: "ASC"
      },
      take: REFERENCE_LIMIT
    });
    return items.map((item) => ({
      id: item.id,
      orgCode: item.orgCode,
      orgName: item.orgName,
      status: item.status
    }));
  }

  private async listBuildings(scope: TenantParkScope): Promise<EngineeringReferenceResponse["buildings"]> {
    const items = await this.buildingsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: 1
      },
      order: {
        sortNo: "ASC",
        buildingCode: "ASC"
      },
      take: REFERENCE_LIMIT
    });
    return items.map((item) => ({
      id: item.id,
      buildingCode: item.buildingCode,
      buildingName: item.buildingName
    }));
  }

  private async listFloors(scope: TenantParkScope): Promise<EngineeringReferenceResponse["floors"]> {
    const items = await this.floorsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: 1
      },
      order: {
        buildingId: "ASC",
        floorNo: "ASC"
      },
      take: REFERENCE_LIMIT
    });
    return items.map((item) => ({
      id: item.id,
      buildingId: item.buildingId,
      floorCode: item.floorCode,
      floorName: item.floorName
    }));
  }

  private async listUnits(scope: TenantParkScope): Promise<EngineeringReferenceResponse["units"]> {
    const items = await this.unitsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: 1
      },
      order: {
        buildingId: "ASC",
        floorId: "ASC",
        unitCode: "ASC"
      },
      take: REFERENCE_LIMIT
    });
    return items.map((item) => ({
      id: item.id,
      buildingId: item.buildingId,
      floorId: item.floorId,
      unitCode: item.unitCode,
      unitName: item.unitName
    }));
  }

  private async listUsers(scope: TenantParkScope): Promise<EngineeringReferenceResponse["users"]> {
    const items = await this.usersRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        isEnabled: true,
        status: "enabled"
      },
      order: {
        displayName: "ASC",
        username: "ASC"
      },
      take: REFERENCE_LIMIT
    });
    return items.map((item) => ({
      id: item.id,
      username: item.username,
      displayName: item.displayName ?? null,
      realName: item.displayName ?? null,
      status: item.status
    }));
  }
}
