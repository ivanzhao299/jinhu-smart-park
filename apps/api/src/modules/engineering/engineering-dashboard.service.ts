import { Injectable } from "@nestjs/common";
import {
  EngineeringAcceptanceStatus,
  EngineeringProjectStatus,
  EngineeringRectificationStatus
} from "./domain/engineering-project.enums";
import type { EngineeringProjectRuntimeContext } from "./engineering-project.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringProjectAccessPolicy, EngineeringProjectPermission } from "./policies/engineering-project-access.policy";
import { EngineeringAcceptanceRepository } from "./repositories/engineering-acceptance.repository";
import { EngineeringDailyReportRepository } from "./repositories/engineering-daily-report.repository";
import { EngineeringInspectionRepository } from "./repositories/engineering-inspection.repository";
import { EngineeringIssueRepository } from "./repositories/engineering-issue.repository";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import { EngineeringRectificationRepository } from "./repositories/engineering-rectification.repository";

export interface EngineeringDashboardBucket {
  key: string;
  count: number;
}

export interface EngineeringDashboardContractorRanking {
  contractor_org_id: string | null;
  total_rectifications: number;
  closed_rectifications: number;
  overdue_rectifications: number;
  close_rate: number;
}

interface EngineeringDashboardCountBuilder {
  select(selection: string, alias: string): EngineeringDashboardCountBuilder;
  addSelect(selection: string, alias: string): EngineeringDashboardCountBuilder;
  groupBy(group: string): EngineeringDashboardCountBuilder;
  orderBy(sort: string, order?: "ASC" | "DESC"): EngineeringDashboardCountBuilder;
  getRawMany(): Promise<Array<{ key: string; count: string }>>;
}

export interface EngineeringDashboardOverview {
  summary: {
    project_total: number;
    executing_project_count: number;
    pending_rectification_count: number;
    overdue_rectification_count: number;
    today_inspection_count: number;
    weekly_daily_report_count: number;
    pending_acceptance_count: number;
    acceptance_pass_rate: number;
    rectification_close_rate: number;
  };
  project_status_distribution: EngineeringDashboardBucket[];
  project_type_distribution: EngineeringDashboardBucket[];
  plan_status_distribution: EngineeringDashboardBucket[];
  issue_severity_distribution: EngineeringDashboardBucket[];
  rectification_status_distribution: EngineeringDashboardBucket[];
  acceptance_status_distribution: EngineeringDashboardBucket[];
  contractor_rectification_ranking: EngineeringDashboardContractorRanking[];
  generated_at: string;
}

@Injectable()
export class EngineeringDashboardService {
  constructor(
    private readonly projectsRepository: EngineeringProjectRepository,
    private readonly plansRepository: EngineeringPlanRepository,
    private readonly dailyReportsRepository: EngineeringDailyReportRepository,
    private readonly inspectionsRepository: EngineeringInspectionRepository,
    private readonly issuesRepository: EngineeringIssueRepository,
    private readonly rectificationsRepository: EngineeringRectificationRepository,
    private readonly acceptancesRepository: EngineeringAcceptanceRepository,
    private readonly projectAccessPolicy: EngineeringProjectAccessPolicy,
    private readonly dataScopeAdapter: EngineeringDataScopeAdapter
  ) {}

  async overview(context: EngineeringProjectRuntimeContext, now: Date = new Date()): Promise<EngineeringDashboardOverview> {
    this.projectAccessPolicy.assertPermission(EngineeringProjectPermission.DASHBOARD_VIEW, { actorPermissions: context.actor.permissions });
    const window = getEngineeringDashboardDateWindow(now);

    const [
      projectTotal,
      executingProjectCount,
      pendingRectificationCount,
      overdueRectificationCount,
      todayInspectionCount,
      weeklyDailyReportCount,
      pendingAcceptanceCount,
      rectificationTotal,
      rectificationClosed,
      acceptanceReviewedTotal,
      acceptancePassed,
      projectStatusDistribution,
      projectTypeDistribution,
      planStatusDistribution,
      issueSeverityDistribution,
      rectificationStatusDistribution,
      acceptanceStatusDistribution,
      contractorRectificationRanking
    ] = await Promise.all([
      this.countProjects(context),
      this.countExecutingProjects(context),
      this.countPendingRectifications(context),
      this.countOverdueRectifications(context, window.today),
      this.countTodayInspections(context, window.today),
      this.countWeeklyDailyReports(context, window.weekStart, window.today),
      this.countPendingAcceptances(context),
      this.countRectifications(context),
      this.countClosedRectifications(context),
      this.countReviewedAcceptances(context),
      this.countPassedAcceptances(context),
      this.projectStatusDistribution(context),
      this.projectTypeDistribution(context),
      this.planStatusDistribution(context),
      this.issueSeverityDistribution(context),
      this.rectificationStatusDistribution(context),
      this.acceptanceStatusDistribution(context),
      this.contractorRectificationRanking(context, window.today)
    ]);

    return {
      summary: {
        project_total: projectTotal,
        executing_project_count: executingProjectCount,
        pending_rectification_count: pendingRectificationCount,
        overdue_rectification_count: overdueRectificationCount,
        today_inspection_count: todayInspectionCount,
        weekly_daily_report_count: weeklyDailyReportCount,
        pending_acceptance_count: pendingAcceptanceCount,
        acceptance_pass_rate: calculatePercent(acceptancePassed, acceptanceReviewedTotal),
        rectification_close_rate: calculatePercent(rectificationClosed, rectificationTotal)
      },
      project_status_distribution: projectStatusDistribution,
      project_type_distribution: projectTypeDistribution,
      plan_status_distribution: planStatusDistribution,
      issue_severity_distribution: issueSeverityDistribution,
      rectification_status_distribution: rectificationStatusDistribution,
      acceptance_status_distribution: acceptanceStatusDistribution,
      contractor_rectification_ranking: contractorRectificationRanking,
      generated_at: now.toISOString()
    };
  }

  private async countProjects(context: EngineeringProjectRuntimeContext): Promise<number> {
    const builder = this.projectsRepository.createScopedQueryBuilder(context);
    await this.dataScopeAdapter.applyProjectScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countExecutingProjects(context: EngineeringProjectRuntimeContext): Promise<number> {
    const builder = this.projectsRepository.createScopedQueryBuilder(context)
      .andWhere("project.status IN (:...statuses)", {
        statuses: [EngineeringProjectStatus.EXECUTING, EngineeringProjectStatus.INSPECTING, EngineeringProjectStatus.RECTIFYING]
      });
    await this.dataScopeAdapter.applyProjectScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countPendingRectifications(context: EngineeringProjectRuntimeContext): Promise<number> {
    const builder = this.rectificationsRepository.createScopedQueryBuilder(context)
      .andWhere("rectification.status IN (:...statuses)", {
        statuses: [
          EngineeringRectificationStatus.PENDING,
          EngineeringRectificationStatus.IN_PROGRESS,
          EngineeringRectificationStatus.SUBMITTED,
          EngineeringRectificationStatus.RECHECKING,
          EngineeringRectificationStatus.REJECTED
        ]
      });
    await this.dataScopeAdapter.applyRectificationScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countOverdueRectifications(context: EngineeringProjectRuntimeContext, today: string): Promise<number> {
    const builder = this.rectificationsRepository.createScopedQueryBuilder(context)
      .andWhere("(rectification.status = :overdue OR (rectification.deadline IS NOT NULL AND rectification.deadline < :today AND rectification.status NOT IN (:...doneStatuses)))", {
        overdue: EngineeringRectificationStatus.OVERDUE,
        today,
        doneStatuses: [EngineeringRectificationStatus.CLOSED, EngineeringRectificationStatus.PASSED]
      });
    await this.dataScopeAdapter.applyRectificationScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countTodayInspections(context: EngineeringProjectRuntimeContext, today: string): Promise<number> {
    const builder = this.inspectionsRepository.createScopedQueryBuilder(context)
      .andWhere("inspection.inspection_date = :today", { today });
    await this.dataScopeAdapter.applyInspectionScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countWeeklyDailyReports(context: EngineeringProjectRuntimeContext, weekStart: string, today: string): Promise<number> {
    const builder = this.dailyReportsRepository.createScopedQueryBuilder(context)
      .andWhere("report.report_date >= :weekStart", { weekStart })
      .andWhere("report.report_date <= :today", { today });
    await this.dataScopeAdapter.applyDailyReportScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countPendingAcceptances(context: EngineeringProjectRuntimeContext): Promise<number> {
    const builder = this.acceptancesRepository.createScopedQueryBuilder(context)
      .andWhere("acceptance.acceptance_status IN (:...statuses)", {
        statuses: [EngineeringAcceptanceStatus.SUBMITTED, EngineeringAcceptanceStatus.REVIEWING]
      });
    await this.dataScopeAdapter.applyAcceptanceScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countRectifications(context: EngineeringProjectRuntimeContext): Promise<number> {
    const builder = this.rectificationsRepository.createScopedQueryBuilder(context);
    await this.dataScopeAdapter.applyRectificationScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countClosedRectifications(context: EngineeringProjectRuntimeContext): Promise<number> {
    const builder = this.rectificationsRepository.createScopedQueryBuilder(context)
      .andWhere("rectification.status = :status", { status: EngineeringRectificationStatus.CLOSED });
    await this.dataScopeAdapter.applyRectificationScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countReviewedAcceptances(context: EngineeringProjectRuntimeContext): Promise<number> {
    const builder = this.acceptancesRepository.createScopedQueryBuilder(context)
      .andWhere("acceptance.acceptance_status IN (:...statuses)", {
        statuses: [
          EngineeringAcceptanceStatus.PASSED,
          EngineeringAcceptanceStatus.FAILED,
          EngineeringAcceptanceStatus.RECTIFICATION_REQUIRED,
          EngineeringAcceptanceStatus.CLOSED
        ]
      });
    await this.dataScopeAdapter.applyAcceptanceScope(builder, context, context.actor);
    return builder.getCount();
  }

  private async countPassedAcceptances(context: EngineeringProjectRuntimeContext): Promise<number> {
    const builder = this.acceptancesRepository.createScopedQueryBuilder(context)
      .andWhere("acceptance.acceptance_status IN (:...statuses)", {
        statuses: [EngineeringAcceptanceStatus.PASSED, EngineeringAcceptanceStatus.CLOSED]
      });
    await this.dataScopeAdapter.applyAcceptanceScope(builder, context, context.actor);
    return builder.getCount();
  }

  private projectStatusDistribution(context: EngineeringProjectRuntimeContext): Promise<EngineeringDashboardBucket[]> {
    return this.countBy(context, this.projectsRepository.createScopedQueryBuilder(context), "project.status", "project", (builder) =>
      this.dataScopeAdapter.applyProjectScope(builder, context, context.actor)
    );
  }

  private projectTypeDistribution(context: EngineeringProjectRuntimeContext): Promise<EngineeringDashboardBucket[]> {
    return this.countBy(context, this.projectsRepository.createScopedQueryBuilder(context), "project.project_type", "project", (builder) =>
      this.dataScopeAdapter.applyProjectScope(builder, context, context.actor)
    );
  }

  private planStatusDistribution(context: EngineeringProjectRuntimeContext): Promise<EngineeringDashboardBucket[]> {
    return this.countBy(context, this.plansRepository.createScopedQueryBuilder(context), "plan.status", "plan", (builder) =>
      this.dataScopeAdapter.applyPlanScope(builder, context, context.actor)
    );
  }

  private issueSeverityDistribution(context: EngineeringProjectRuntimeContext): Promise<EngineeringDashboardBucket[]> {
    return this.countBy(context, this.issuesRepository.createScopedQueryBuilder(context), "issue.severity", "issue", (builder) =>
      this.dataScopeAdapter.applyIssueScope(builder, context, context.actor)
    );
  }

  private rectificationStatusDistribution(context: EngineeringProjectRuntimeContext): Promise<EngineeringDashboardBucket[]> {
    return this.countBy(context, this.rectificationsRepository.createScopedQueryBuilder(context), "rectification.status", "rectification", (builder) =>
      this.dataScopeAdapter.applyRectificationScope(builder, context, context.actor)
    );
  }

  private acceptanceStatusDistribution(context: EngineeringProjectRuntimeContext): Promise<EngineeringDashboardBucket[]> {
    return this.countBy(context, this.acceptancesRepository.createScopedQueryBuilder(context), "acceptance.acceptance_status", "acceptance", (builder) =>
      this.dataScopeAdapter.applyAcceptanceScope(builder, context, context.actor)
    );
  }

  private async contractorRectificationRanking(context: EngineeringProjectRuntimeContext, today: string): Promise<EngineeringDashboardContractorRanking[]> {
    const builder = this.rectificationsRepository.createScopedQueryBuilder(context);
    await this.dataScopeAdapter.applyRectificationScope(builder, context, context.actor);
    const rows = await builder
      .select("rectification.contractor_org_id", "contractorOrgId")
      .addSelect("COUNT(rectification.id)", "total")
      .addSelect("SUM(CASE WHEN rectification.status = :closed THEN 1 ELSE 0 END)", "closed")
      .addSelect(
        "SUM(CASE WHEN rectification.status = :overdue OR (rectification.deadline IS NOT NULL AND rectification.deadline < :today AND rectification.status NOT IN (:...doneStatuses)) THEN 1 ELSE 0 END)",
        "overdue"
      )
      .setParameters({
        closed: EngineeringRectificationStatus.CLOSED,
        overdue: EngineeringRectificationStatus.OVERDUE,
        today,
        doneStatuses: [EngineeringRectificationStatus.CLOSED, EngineeringRectificationStatus.PASSED]
      })
      .groupBy("rectification.contractor_org_id")
      .orderBy("total", "DESC")
      .limit(10)
      .getRawMany<{ contractorOrgId: string | null; total: string; closed: string | null; overdue: string | null }>();

    return rows.map((row) => {
      const total = Number(row.total ?? 0);
      const closed = Number(row.closed ?? 0);
      return {
        contractor_org_id: row.contractorOrgId ?? null,
        total_rectifications: total,
        closed_rectifications: closed,
        overdue_rectifications: Number(row.overdue ?? 0),
        close_rate: calculatePercent(closed, total)
      };
    });
  }

  private async countBy<TBuilder extends EngineeringDashboardCountBuilder>(
    _context: EngineeringProjectRuntimeContext,
    builder: TBuilder,
    column: string,
    alias: string,
    applyScope: (builder: TBuilder) => Promise<void> | void
  ): Promise<EngineeringDashboardBucket[]> {
    await applyScope(builder);
    const rows = await builder
      .select(column, "key")
      .addSelect(`COUNT(${alias}.id)`, "count")
      .groupBy(column)
      .orderBy(column, "ASC")
      .getRawMany();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }
}

export function calculatePercent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

export function getEngineeringDashboardDateWindow(now: Date): { today: string; weekStart: string } {
  const today = toDateOnly(now);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return { today, weekStart: toDateOnly(start) };
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
