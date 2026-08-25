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
  CreateHrCompetencyModelDto,
  CreateHrFeedback360CycleDto,
  CreateHrFeedbackNominationDto,
  CreateHrFeedbackQuestionnaireDto,
  DecideHrFeedbackNominationDto,
  HrFeedback360QueryDto,
  SubmitHrFeedback360Dto,
} from "./dto/hr-feedback360.dto";
import { HrFeedback360Service } from "./hr-feedback360.service";

@Controller("hr/feedback360-v2") @RequireModule("hr")
export class HrFeedback360Controller {
  constructor(private readonly service: HrFeedback360Service) {}
  @Get("options")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE,
    HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE,
    HR_PERMISSIONS.HR_FEEDBACK_NOMINATE,
    HR_PERMISSIONS.HR_FEEDBACK_NOMINATION_REVIEW,
    HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH,
  )
  options(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal) {
    return this.service.options(s, a);
  }
  @Get("models")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_FEEDBACK_READ,
    HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE,
  )
  models(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal) {
    return this.service.models(s, a);
  }
  @Post("models")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_model",
    action: "创建胜任力模型版本",
    bizType: "hr_competency_model",
    captureBody: false,
  })
  createModel(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrCompetencyModelDto,
  ) {
    return this.service.createModel(s, a, d);
  }
  @Post("models/:id/publish")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_model",
    action: "发布胜任力模型版本",
    bizType: "hr_competency_model_version",
    bizIdParam: "id",
    captureBody: false,
  })
  publishModel(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.publishModel(s, a, id);
  }
  @Post("questionnaires")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_questionnaire",
    action: "创建360问卷版本",
    bizType: "hr_feedback_questionnaire",
    captureBody: false,
  })
  createQuestionnaire(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrFeedbackQuestionnaireDto,
  ) {
    return this.service.createQuestionnaire(s, a, d);
  }
  @Post("questionnaires/:id/publish")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_questionnaire",
    action: "发布360问卷版本",
    bizType: "hr_feedback_questionnaire_version",
    bizIdParam: "id",
    captureBody: false,
  })
  publishQuestionnaire(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.publishQuestionnaire(s, a, id);
  }
  @Get("cycles")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_FEEDBACK_READ,
    HR_PERMISSIONS.HR_FEEDBACK_TEAM_READ,
    HR_PERMISSIONS.HR_FEEDBACK_SELF_READ,
  )
  cycles(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Query() q: HrFeedback360QueryDto,
  ) {
    return this.service.cycles(s, a, q);
  }
  @Post("cycles")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_cycle",
    action: "创建360评价周期",
    bizType: "hr_feedback360_cycle",
    captureBody: false,
  })
  createCycle(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrFeedback360CycleDto,
  ) {
    return this.service.createCycle(s, a, d);
  }
  @Post("cycles/:id/activate")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_cycle",
    action: "启动360提名",
    bizType: "hr_feedback360_cycle",
    bizIdParam: "id",
    captureBody: false,
  })
  activateCycle(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.activateCycle(s, a, id);
  }
  @Post("nominations")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_NOMINATE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_nomination",
    action: "提名360评价人",
    bizType: "hr_feedback360_nomination",
    captureBody: false,
  })
  nominate(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrFeedbackNominationDto,
  ) {
    return this.service.nominate(s, a, d);
  }
  @Get("nominations/pending")
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_NOMINATION_REVIEW)
  pending(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal) {
    return this.service.pendingNominations(s, a);
  }
  @Post("nominations/:id/decision")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_NOMINATION_REVIEW)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_nomination",
    action: "审批360评价人",
    bizType: "hr_feedback360_nomination",
    bizIdParam: "id",
    captureBody: false,
  })
  decide(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: DecideHrFeedbackNominationDto,
  ) {
    return this.service.decideNomination(s, a, id, d);
  }
  @Get("assignments/me") @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_RESPOND)
  tasks(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal) {
    return this.service.myAssignments(s, a);
  }
  @Post("assignments/:id/submit")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_RESPOND)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_response",
    action: "提交360评价",
    bizType: "hr_feedback360_assignment",
    bizIdParam: "id",
    captureBody: false,
  })
  submit(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: SubmitHrFeedback360Dto,
  ) {
    return this.service.submit(s, a, id, d);
  }
  @Post("subjects/:id/close")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_result",
    action: "关闭360评价收集",
    bizType: "hr_feedback360_subject",
    bizIdParam: "id",
    captureBody: false,
  })
  close(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.closeSubject(s, a, id);
  }
  @Post("subjects/:id/publish")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.feedback360_result",
    action: "发布360匿名结果",
    bizType: "hr_feedback360_subject",
    bizIdParam: "id",
    captureBody: false,
  })
  publish(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.publishResult(s, a, id);
  }
  @Get("results")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_FEEDBACK_RESULT_READ,
    HR_PERMISSIONS.HR_FEEDBACK_TEAM_READ,
    HR_PERMISSIONS.HR_FEEDBACK_SELF_READ,
  )
  results(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Query() q: HrFeedback360QueryDto,
  ) {
    return this.service.results(s, a, q);
  }
}
