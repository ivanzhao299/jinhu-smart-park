import { Controller, Get, Query } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  HrPerformanceLegacyPageQueryDto,
  HrPerformanceLegacyResultQueryDto,
  HrPerformanceLegacyRubricQueryDto,
} from "./dto/hr-performance-legacy.dto";
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
    HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ,
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
    HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ,
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
}
