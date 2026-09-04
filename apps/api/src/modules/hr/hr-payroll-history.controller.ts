import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import {
  RequireAnyPermissions,
  RequirePermissions,
} from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  CreateHrPayrollReconciliationDto,
  CreateHrPayrollReconciliationPolicyDto,
  HrPayrollCatalogQueryDto,
  HrPayrollFormulaReviewDto,
  HrPayrollHistoryQueryDto,
  HrPayrollReconciliationDetailQueryDto,
  HrPayrollReconciliationQueryDto,
  HrPayrollReconciliationReviewDto,
  HrPayrollReviewActionDto,
  HrPayrollTaxRuleQueryDto,
} from "./dto/hr-payroll-history.dto";
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

  @Get("history-tax-rules")
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)
  taxRules(@CurrentScope()scope:TenantParkScope,@CurrentUser()actor:JwtPrincipal,@Query()query:HrPayrollTaxRuleQueryDto){return this.service.listTaxRules(scope,actor,query);}

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

  @Post("history-formulas/:id/review")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.payroll_formula",
    action: "复核历史工资公式",
    bizType: "hr_payroll_formula_version",
    bizIdParam: "id",
    captureBody: false,
  })
  reviewFormula(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: HrPayrollFormulaReviewDto,
  ) {
    return this.service.reviewFormula(scope, actor, id, dto);
  }

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

  @Get("reconciliations")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE,
    HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,
  )
  reconciliations(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HrPayrollReconciliationQueryDto,
  ) {
    return this.service.listReconciliations(scope, actor, query);
  }

  @Get("reconciliations/setup")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE,
    HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,
  )
  reconciliationSetup(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
  ) {
    return this.service.reconciliationSetup(scope, actor);
  }

  @Post("reconciliation-policies")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.payroll_reconciliation_policy",
    action: "审核工资双轨净额映射",
    bizType: "hr_payroll_reconciliation_policy_version",
    captureBody: false,
  })
  createReconciliationPolicy(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreateHrPayrollReconciliationPolicyDto,
  ) {
    return this.service.createReconciliationPolicy(scope, actor, dto);
  }

  @Get("reconciliations/:id")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE,
    HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,
  )
  reconciliation(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: HrPayrollReconciliationDetailQueryDto,
  ) {
    return this.service.reconciliationDetail(scope, actor, id, query);
  }

  @Post("reconciliations/simulate")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.payroll_reconciliation",
    action: "执行工资双轨模拟",
    bizType: "hr_payroll_reconciliation_run",
    captureBody: false,
  })
  simulate(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreateHrPayrollReconciliationDto,
  ) {
    return this.service.simulateReconciliation(scope, actor, dto);
  }

  @Post("reconciliations/:id/review-actions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.payroll_reconciliation",
    action: "追加双轨差异复核",
    bizType: "hr_payroll_reconciliation_run",
    bizIdParam: "id",
    captureBody: false,
  })
  reviewReconciliation(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: HrPayrollReconciliationReviewDto,
  ) {
    return this.service.addReconciliationReview(scope, actor, id, dto);
  }
}
