import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  CreateHrRewardCaseDto,
  CreateHrRewardCategoryDto,
  HrRewardCorrectionDto,
  HrRewardLinkDto,
  HrRewardListDto,
  HrRewardReviewDto,
  UpdateHrRewardDraftDto,
  VersionHrRewardCategoryDto,
} from "./dto/hr-rewards.dto";
import { HrRewardsService } from "./hr-rewards.service";
@Controller("hr/rewards")
@RequireModule("hr")
export class HrRewardsController {
  constructor(private readonly service: HrRewardsService) {}
  @Get("categories")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_REWARD_READ,
    HR_PERMISSIONS.HR_REWARD_TEAM_READ,
    HR_PERMISSIONS.HR_REWARD_SELF_READ,
  )
  categories(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
  ) {
    return this.service.categories(s, a);
  }
  @Get("options") @RequirePermissions(HR_PERMISSIONS.HR_REWARD_MANAGE) options(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
  ) {
    return this.service.options(s, a);
  }
  @Get("cases")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_REWARD_READ,
    HR_PERMISSIONS.HR_REWARD_TEAM_READ,
    HR_PERMISSIONS.HR_REWARD_SELF_READ,
  )
  cases(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Query() q: HrRewardListDto,
  ) {
    return this.service.list(s, a, q);
  }
  @Get("cases/:id")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_REWARD_READ,
    HR_PERMISSIONS.HR_REWARD_TEAM_READ,
    HR_PERMISSIONS.HR_REWARD_SELF_READ,
  )
  caseDetail(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(s, a, id);
  }
  @Post("categories")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.reward_category",
    action: "创建奖惩类别",
    bizType: "hr_reward_category",
    captureBody: false,
  })
  createCategory(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrRewardCategoryDto,
  ) {
    return this.service.createCategory(s, a, d);
  }
  @Post("categories/:id/versions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.reward_category",
    action: "发布奖惩类别版本",
    bizType: "hr_reward_category",
    bizIdParam: "id",
    captureBody: false,
  })
  versionCategory(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: VersionHrRewardCategoryDto,
  ) {
    return this.service.versionCategory(s, a, id, d);
  }
  @Post("cases")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.reward_case",
    action: "创建奖惩草稿",
    bizType: "hr_reward_case",
    captureBody: false,
  })
  createCase(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrRewardCaseDto,
  ) {
    return this.service.createCase(s, a, d);
  }
  @Put("cases/:id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.reward_case",
    action: "修改奖惩草稿",
    bizType: "hr_reward_case",
    bizIdParam: "id",
    captureBody: false,
  })
  updateCase(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: UpdateHrRewardDraftDto,
  ) {
    return this.service.updateDraft(s, a, id, d);
  }
  @Post("cases/:id/submit")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.reward_case",
    action: "办理奖惩流程",
    bizType: "hr_reward_case",
    bizIdParam: "id",
    captureBody: false,
  })
  submit(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: HrRewardReviewDto,
  ) {
    return this.service.act(s, a, id, "submit", d);
  }
  @Post("cases/:id/resubmit")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_MANAGE)
  @AuditLog({ module: "人力资源管理", resource: "hr.reward_case", action: "重新提交奖惩流程", bizType: "hr_reward_case", bizIdParam: "id", captureBody: false })
  resubmit(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() d: HrRewardReviewDto) {
    return this.service.act(s, a, id, "resubmit", d);
  }
  @Post("cases/:id/withdraw")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_MANAGE)
  @AuditLog({ module: "人力资源管理", resource: "hr.reward_case", action: "撤回奖惩流程", bizType: "hr_reward_case", bizIdParam: "id", captureBody: false })
  withdraw(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() d: HrRewardReviewDto) {
    return this.service.act(s, a, id, "withdraw", d);
  }
  @Post("cases/:id/approve")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_REVIEW)
  @AuditLog({ module: "人力资源管理", resource: "hr.reward_case", action: "批准奖惩流程", bizType: "hr_reward_case", bizIdParam: "id", captureBody: false })
  approve(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() d: HrRewardReviewDto) {
    return this.service.act(s, a, id, "approve", d);
  }
  @Post("cases/:id/return")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_REWARD_REVIEW)
  @AuditLog({ module: "人力资源管理", resource: "hr.reward_case", action: "退回奖惩流程", bizType: "hr_reward_case", bizIdParam: "id", captureBody: false })
  returnCase(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string, @Body() d: HrRewardReviewDto) {
    return this.service.act(s, a, id, "return", d);
  }
  @Post("cases/:id/corrections")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_REWARD_MANAGE,
    HR_PERMISSIONS.HR_REWARD_SELF_READ,
  )
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.reward_correction",
    action: "追加奖惩更正申诉",
    bizType: "hr_reward_case",
    bizIdParam: "id",
    captureBody: false,
  })
  correction(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: HrRewardCorrectionDto,
  ) {
    return this.service.correct(s, a, id, d);
  }
  @Post("cases/:id/links")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_REWARD_LINK_PAYROLL,
    HR_PERMISSIONS.HR_REWARD_LINK_PERFORMANCE,
  )
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.reward_link",
    action: "创建奖惩外部引用",
    bizType: "hr_reward_case",
    bizIdParam: "id",
    captureBody: false,
  })
  link(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: HrRewardLinkDto,
  ) {
    return this.service.link(s, a, id, d);
  }
}
