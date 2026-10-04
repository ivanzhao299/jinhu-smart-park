import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { UseInterceptors } from "@nestjs/common";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { RunPeriodDto } from "./dto/canteen.dto";
import { CanteenSubsidyGrantService } from "./canteen-subsidy-grant.service";

/**
 * 补贴月度发放 & 月末清零（管理端）。
 * run-grant / run-expire 为批量动作，幂等键 + 账期约束。
 */
@Controller("canteen/subsidy")
export class CanteenSubsidyController {
  constructor(private readonly grants: CanteenSubsidyGrantService) {}

  @Get("grants")
  @RequirePermissions(CANTEEN_PERMISSIONS.SUBSIDY_GRANT_VIEW)
  listGrants(
    @CurrentScope() scope: TenantParkScope,
    @Query("period") period?: string,
    @Query("employee_user_id") employeeUserId?: string,
    @Query("status") status?: string,
    @Query("page") page = 1,
    @Query("page_size") pageSize = 20
  ) {
    return this.grants.listGrants(
      scope,
      { period, employeeUserId, status },
      Number(page) || 1,
      Number(pageSize) || 20
    );
  }

  @Post("run-grant")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SUBSIDY_GRANT_GENERATE)
  runGrant(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: RunPeriodDto) {
    return this.grants.issuePeriod(scope, dto?.period, actor);
  }

  @Post("run-expire")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SUBSIDY_GRANT_EXPIRE)
  runExpire(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: RunPeriodDto) {
    return this.grants.runExpire(scope, dto?.period, actor);
  }
}
