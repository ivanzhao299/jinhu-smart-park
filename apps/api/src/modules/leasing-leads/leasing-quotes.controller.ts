import { Body, Controller, Param, Post } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateContractDraftFromQuoteDto } from "../leasing-contracts/dto/create-contract-draft-from-quote.dto";
import { LeasingContractsService } from "../leasing-contracts/leasing-contracts.service";
import { ApproveLeasingQuoteDto, RejectLeasingQuoteDto, SubmitLeasingQuoteDto } from "./dto/leasing-quote-action.dto";
import { LeasingLeadsService } from "./leasing-leads.service";

@Controller("leasing/quotes")
@RequireModule("leasing")
export class LeasingQuotesController {
  constructor(
    private readonly leasingLeadsService: LeasingLeadsService,
    private readonly leasingContractsService: LeasingContractsService
  ) {}

  @Post(":quoteId/submit")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_QUOTE_SUBMIT)
  @AuditLog({ module: "招商报价方案", resource: "biz.leasing_quote", action: "提交审批", bizType: "biz_leasing_quote", bizIdParam: "quoteId" })
  submit(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("quoteId") quoteId: string,
    @Body() dto: SubmitLeasingQuoteDto
  ) {
    return this.leasingLeadsService.submitQuote(scope, user, quoteId, dto);
  }

  @Post(":quoteId/approve")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_QUOTE_APPROVE)
  @AuditLog({ module: "招商报价方案", resource: "biz.leasing_quote", action: "审批通过", bizType: "biz_leasing_quote", bizIdParam: "quoteId" })
  approve(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("quoteId") quoteId: string,
    @Body() dto: ApproveLeasingQuoteDto
  ) {
    return this.leasingLeadsService.approveQuote(scope, user, quoteId, dto);
  }

  @Post(":quoteId/reject")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_QUOTE_REJECT)
  @AuditLog({ module: "招商报价方案", resource: "biz.leasing_quote", action: "审批驳回", bizType: "biz_leasing_quote", bizIdParam: "quoteId" })
  reject(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("quoteId") quoteId: string,
    @Body() dto: RejectLeasingQuoteDto
  ) {
    return this.leasingLeadsService.rejectQuote(scope, user, quoteId, dto);
  }

  @Post(":quoteId/create-contract-draft")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_QUOTE_CREATE_CONTRACT, SYSTEM_PERMISSIONS.LEASING_CONTRACT_CREATE)
  @AuditLog({ module: "招商报价方案", resource: "biz.leasing_quote", action: "生成合同草稿", bizType: "biz_leasing_contract", bizIdParam: "quoteId" })
  createContractDraft(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("quoteId") quoteId: string,
    @Body() dto: CreateContractDraftFromQuoteDto
  ) {
    return this.leasingContractsService.createDraftFromApprovedQuote(scope, user, quoteId, dto);
  }
}
