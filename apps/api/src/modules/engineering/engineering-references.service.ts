import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { ReferenceDataService } from "../reference-data/reference-data.service";
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
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter,
    private readonly referenceDataService: ReferenceDataService
  ) {}

  async getReferences(scope: TenantParkScope, actor: JwtPrincipal): Promise<EngineeringReferenceResponse> {
    const [projects, plans, dailyReports, inspections, issues, sharedReferences] = await Promise.all([
      this.listProjects(scope, actor),
      this.listPlans(scope, actor),
      this.listDailyReports(scope, actor),
      this.listInspections(scope, actor),
      this.listIssues(scope, actor),
      this.referenceDataService.getFormOptions(scope)
    ]);

    return {
      projects,
      plans,
      dailyReports,
      inspections,
      issues,
      orgs: sharedReferences.orgs,
      buildings: sharedReferences.buildings,
      floors: sharedReferences.floors,
      units: sharedReferences.units.map((item) => ({
        id: item.id,
        buildingId: item.buildingId,
        floorId: item.floorId,
        unitCode: item.unitCode,
        unitName: item.unitName
      })),
      users: sharedReferences.users.map((item) => ({
        id: item.id,
        username: item.username,
        displayName: item.displayName ?? null,
        realName: item.realName ?? null,
        status: item.status
      }))
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

}
