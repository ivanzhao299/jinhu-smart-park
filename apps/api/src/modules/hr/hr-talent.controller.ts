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
  CreateHrCriticalPositionDto,
  CreateHrDevelopmentActionDto,
  CreateHrDevelopmentPlanDto,
  CreateHrSuccessionCandidateDto,
  CreateHrTalentProfileDto,
  CreateHrTalentReviewSessionDto,
  DecideHrTalentSubjectDto,
  HrTalentQueryDto,
  TransitionHrDevelopmentActionDto,
  TransitionHrDevelopmentPlanDto,
} from "./dto/hr-talent.dto";
import { HrTalentService } from "./hr-talent.service";

const readAtoms = [
  HR_PERMISSIONS.HR_TALENT_READ,
  HR_PERMISSIONS.HR_TALENT_TEAM_READ,
  HR_PERMISSIONS.HR_TALENT_SELF_READ,
] as const;
@Controller("hr/talent")
@RequireModule("hr")
export class HrTalentController {
  constructor(private readonly service: HrTalentService) {}
  @Get("options")
  @RequireAnyPermissions(
    ...readAtoms,
    HR_PERMISSIONS.HR_TALENT_PROFILE_CREATE,
    HR_PERMISSIONS.HR_TALENT_REVIEW,
    HR_PERMISSIONS.HR_SUCCESSION_MANAGE,
    HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE,
  )
  options(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal) {
    return this.service.options(s, a);
  }
  @Get("profiles") @RequireAnyPermissions(...readAtoms) profiles(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Query() q: HrTalentQueryDto,
  ) {
    return this.service.profiles(s, a, q);
  }
  @Post("profiles")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_TALENT_PROFILE_CREATE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.talent_profile",
    action: "冻结人才画像",
    bizType: "hr_talent_profile_snapshot",
    captureBody: false,
  })
  createProfile(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrTalentProfileDto,
  ) {
    return this.service.createProfile(s, a, d);
  }
  @Get("sessions")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_TALENT_READ,
    HR_PERMISSIONS.HR_TALENT_TEAM_READ,
    HR_PERMISSIONS.HR_TALENT_REVIEW,
  )
  sessions(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Query() q: HrTalentQueryDto,
  ) {
    return this.service.sessions(s, a, q);
  }
  @Post("sessions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_TALENT_REVIEW)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.talent_review",
    action: "创建人才盘点会",
    bizType: "hr_talent_review_session",
    captureBody: false,
  })
  createSession(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrTalentReviewSessionDto,
  ) {
    return this.service.createSession(s, a, d);
  }
  @Post("sessions/:id/activate")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_TALENT_REVIEW)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.talent_review",
    action: "启动人才盘点会",
    bizType: "hr_talent_review_session",
    bizIdParam: "id",
    captureBody: false,
  })
  activate(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.activateSession(s, a, id);
  }
  @Post("sessions/:id/close")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_TALENT_REVIEW)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.talent_review",
    action: "结束人才盘点会",
    bizType: "hr_talent_review_session",
    bizIdParam: "id",
    captureBody: false,
  })
  close(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.closeSession(s, a, id);
  }
  @Get("sessions/:id/subjects")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_TALENT_READ,
    HR_PERMISSIONS.HR_TALENT_TEAM_READ,
    HR_PERMISSIONS.HR_TALENT_REVIEW,
  )
  subjects(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.subjects(s, a, id);
  }
  @Post("subjects/:id/decisions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_TALENT_REVIEW)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.talent_decision",
    action: "记录九宫格决议",
    bizType: "hr_talent_review_subject",
    bizIdParam: "id",
    captureBody: false,
  })
  decide(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: DecideHrTalentSubjectDto,
  ) {
    return this.service.decide(s, a, id, d);
  }
  @Get("succession")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_SUCCESSION_READ,
    HR_PERMISSIONS.HR_SUCCESSION_MANAGE,
  )
  succession(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
  ) {
    return this.service.succession(s, a);
  }
  @Post("critical-positions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_SUCCESSION_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.succession",
    action: "设置关键岗位",
    bizType: "hr_critical_position",
    captureBody: false,
  })
  critical(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrCriticalPositionDto,
  ) {
    return this.service.createCriticalPosition(s, a, d);
  }
  @Post("succession")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_SUCCESSION_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.succession",
    action: "评估继任候选",
    bizType: "hr_succession_candidate_version",
    captureBody: false,
  })
  successor(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrSuccessionCandidateDto,
  ) {
    return this.service.createSuccessor(s, a, d);
  }
  @Get("development-plans")
  @RequireAnyPermissions(
    ...readAtoms,
    HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE,
    HR_PERMISSIONS.HR_DEVELOPMENT_SELF_ACTION,
  )
  plans(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal) {
    return this.service.plans(s, a);
  }
  @Post("development-plans")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.development",
    action: "创建个人发展计划",
    bizType: "hr_development_plan",
    captureBody: false,
  })
  plan(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrDevelopmentPlanDto,
  ) {
    return this.service.createPlan(s, a, d);
  }
  @Post("development-plans/:id/transitions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.development",
    action: "变更发展计划状态",
    bizType: "hr_development_plan",
    bizIdParam: "id",
    captureBody: false,
  })
  planTransition(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: TransitionHrDevelopmentPlanDto,
  ) {
    return this.service.transitionPlan(s, a, id, d);
  }
  @Post("development-plans/:id/actions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.development",
    action: "分配发展行动",
    bizType: "hr_development_plan",
    bizIdParam: "id",
    captureBody: false,
  })
  action(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: CreateHrDevelopmentActionDto,
  ) {
    return this.service.addAction(s, a, id, d);
  }
  @Post("development-actions/:id/transitions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_DEVELOPMENT_MANAGE,
    HR_PERMISSIONS.HR_DEVELOPMENT_SELF_ACTION,
  )
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.development_action",
    action: "更新发展行动",
    bizType: "hr_development_action",
    bizIdParam: "id",
    captureBody: false,
  })
  transition(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: TransitionHrDevelopmentActionDto,
  ) {
    return this.service.transitionAction(s, a, id, d);
  }
}
