import { Controller, Get, Query } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceLegacyRelationQueryDto } from "./dto/hr-performance-legacy-relations.dto";
import { HrPerformanceLegacyPageQueryDto } from "./dto/hr-performance-legacy.dto";
import { HrPerformanceLegacyRelationsService } from "./hr-performance-legacy-relations.service";

@Controller("hr/performance-legacy/relations")
@RequireModule("hr")
export class HrPerformanceLegacyRelationsController {
  constructor(private readonly service: HrPerformanceLegacyRelationsService) {}

  @Get("sessions")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,
  )
  sessions(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyPageQueryDto,
  ) {
    return this.service.sessions(scope, actor, query);
  }

  @Get("score-sources")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_MANAGE,
  )
  scoreSources(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyRelationQueryDto,
  ) {
    return this.service.scoreSources(scope, actor, query);
  }

  @Get("source-person-assignments")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_MANAGE,
  )
  sourcePersonAssignments(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPerformanceLegacyRelationQueryDto,
  ) {
    return this.service.sourcePersonAssignments(scope, actor, query);
  }
}
