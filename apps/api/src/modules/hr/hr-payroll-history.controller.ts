import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions, RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { HrPayrollCatalogQueryDto, HrPayrollHistoryQueryDto, HrPayrollReviewActionDto } from "./dto/hr-payroll-history.dto";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";

@Controller("hr/payroll")
@RequireModule("hr")
export class HrPayrollHistoryController {
  constructor(private readonly service:HrPayrollHistoryService){}

  @Get("history")
  @RequireAnyPermissions(HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ,HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ)
  history(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrPayrollHistoryQueryDto){return this.service.listHistory(scope,actor,query);}

  @Get("history/team-summary")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_HISTORY_TEAM_SUMMARY)
  teamSummary(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrPayrollHistoryQueryDto){return this.service.teamSummary(scope,actor,query);}

  @Get("history/:id")
  @RequireAnyPermissions(HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ,HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ)
  detail(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.historyDetail(scope,actor,id);}

  @Get("history/:id/items")
  @RequireAnyPermissions(HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ,HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ)
  items(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.historyItems(scope,actor,id);}

  @Get("history-books")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  books(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrPayrollCatalogQueryDto){return this.service.listBooks(scope,actor,query);}

  @Get("history-books/:id")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  book(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.bookDetail(scope,actor,id);}

  @Get("history-items")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  catalogItems(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrPayrollCatalogQueryDto){return this.service.listCatalogItems(scope,actor,query);}

  @Get("history-items/:id")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  catalogItem(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.catalogItemDetail(scope,actor,id);}

  @Get("history-formulas")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  formulas(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrPayrollCatalogQueryDto){return this.service.listFormulas(scope,actor,query);}

  @Get("history-formulas/:id")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  formula(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.formulaDetail(scope,actor,id);}

  @Get("history-review-cases")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  reviewCases(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrPayrollCatalogQueryDto){return this.service.listReviewCases(scope,actor,query);}

  @Get("history-review-cases/:id")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  reviewCase(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.reviewCaseDetail(scope,actor,id);}

  @Post("history-review-cases/:id/actions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW)
  @AuditLog({module:"人力资源管理",resource:"hr.payroll_review_action",action:"追加历史工资复核结论",bizType:"hr_payroll_review_case",bizIdParam:"id",captureBody:false})
  reviewAction(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()dto:HrPayrollReviewActionDto){return this.service.addReviewAction(scope,actor,id,dto);}
}
