import { Controller, Get, Query } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceLegacyAssessmentMasterQueryDto } from "./dto/hr-performance-legacy-assessment-master.dto";
import { HrPerformanceLegacyAssessmentValueQueryDto } from "./dto/hr-performance-legacy-assessment-value.dto";
import { HrPerformanceLegacyWebAssQueryDto } from "./dto/hr-performance-legacy-web-ass-query.dto";
import {
  HrPerformanceLegacyPageQueryDto,
  HrPerformanceLegacyPersonSummaryQueryDto,
  HrPerformanceLegacyResultQueryDto,
  HrPerformanceLegacyRubricQueryDto,
} from "./dto/hr-performance-legacy.dto";
import { HrPerformanceLegacyPersonSummaryRoutineQueryDto } from "./dto/hr-performance-legacy-person-summary.dto";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

@Controller("hr/performance-legacy")
@RequireModule("hr")
export class HrPerformanceLegacyController {
  constructor(private readonly service: HrPerformanceLegacyService) {}

  @Get("templates")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,
  )
  templates(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyPageQueryDto,
  ) {
    return this.service.templates(scope, actor, query);
  }

  @Get("levels")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,
  )
  levels(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyPageQueryDto,
  ) {
    return this.service.levels(scope, actor, query);
  }

  @Get("dimensions")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,
  )
  dimensions(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyPageQueryDto,
  ) {
    return this.service.dimensions(scope, actor, query);
  }

  @Get("guides")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,
  )
  guides(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyPageQueryDto,
  ) {
    return this.service.guides(scope, actor, query);
  }

  @Get("rubric")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,
  )
  rubric(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyRubricQueryDto,
  ) {
    return this.service.rubric(scope, actor, query);
  }

  @Get("results")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
  )
  results(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyResultQueryDto,
  ) {
    return this.service.results(scope, actor, query);
  }

  @Get("masters")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
  )
  masters(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyResultQueryDto,
  ) {
    return this.service.masters(scope, actor, query);
  }

  @Get("query-reports/person-summary")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
  )
  personSummary(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyPersonSummaryRoutineQueryDto,
  ) {
    return this.service.personSummary(scope, actor, query);
  }

  @Get("query-reports/assessment-master")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
  )
  assessmentMasterQuery(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyAssessmentMasterQueryDto,
  ) {
    return this.service.assessmentMasterQuery(scope, actor, query);
  }

  @Get("query-reports/assessment-value")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
  )
  assessmentValueQuery(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyAssessmentValueQueryDto,
  ) {
    return this.service.assessmentValueQuery(scope, actor, query);
  }

  @Get("query-reports/assessment-value-of-person")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
  )
  assessmentValueOfPersonQuery(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyPersonSummaryQueryDto,
  ) {
    return this.service.assessmentValueOfPersonQuery(scope, actor, query);
  }

  @Get("query-reports/web-ass-query")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
  )
  webAssQuery(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyWebAssQueryDto,
  ) {
    return this.service.webAssQuery(scope, actor, query);
  }
}
