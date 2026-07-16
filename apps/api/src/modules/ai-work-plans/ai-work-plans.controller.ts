import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { AiWorkPlansService } from "./ai-work-plans.service";
import {
  AiWorkPlanQueryDto,
  CreateAiWorkPlanDto,
  MaterializeAiWorkPlanDto,
  RejectAiWorkPlanDto,
  ReviewAiWorkPlanDto,
  UpdateAiWorkPlanTaskDto
} from "./dto/ai-work-plan.dto";

@Controller("ai/work-plans")
@RequireModule("ai")
export class AiWorkPlansController {
  constructor(private readonly service: AiWorkPlansService) {}

  @Post()
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.AI_ASSISTANT)
  @AuditLog({ module: "AI 工作编排", resource: "biz.ai_work_plan", action: "生成草案", bizType: "biz_ai_work_plan" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: CreateAiWorkPlanDto) {
    return this.service.create(scope, actor, dto);
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.AI_ASSISTANT)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: AiWorkPlanQueryDto) {
    return this.service.list(scope, actor, query);
  }

  @Get("directory")
  @RequirePermissions(SYSTEM_PERMISSIONS.AI_ASSISTANT)
  directory(@CurrentScope() scope: TenantParkScope) {
    return this.service.directorySnapshot(scope);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.AI_ASSISTANT)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id") id: string) {
    return this.service.detail(scope, actor, id);
  }

  @Patch(":id/tasks/:taskId")
  @RequirePermissions(SYSTEM_PERMISSIONS.AI_ASSISTANT)
  @AuditLog({ module: "AI 工作编排", resource: "biz.ai_work_plan_task", action: "校正任务", bizType: "biz_ai_work_plan_task", bizIdParam: "taskId" })
  updateTask(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() dto: UpdateAiWorkPlanTaskDto
  ) {
    return this.service.updateTask(scope, actor, id, taskId, dto);
  }

  @Post(":id/approve")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.AI_ASSISTANT, SYSTEM_PERMISSIONS.WORKORDER_ASSIGN)
  @AuditLog({ module: "AI 工作编排", resource: "biz.ai_work_plan", action: "批准", bizType: "biz_ai_work_plan", bizIdParam: "id" })
  approve(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReviewAiWorkPlanDto
  ) {
    return this.service.approve(scope, actor, id, dto);
  }

  @Post(":id/reject")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.AI_ASSISTANT, SYSTEM_PERMISSIONS.WORKORDER_ASSIGN)
  @AuditLog({ module: "AI 工作编排", resource: "biz.ai_work_plan", action: "驳回", bizType: "biz_ai_work_plan", bizIdParam: "id" })
  reject(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RejectAiWorkPlanDto
  ) {
    return this.service.reject(scope, actor, id, dto.reason);
  }

  @Post(":id/materialize")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.AI_ASSISTANT, SYSTEM_PERMISSIONS.WORKORDER_CREATE, SYSTEM_PERMISSIONS.WORKORDER_ASSIGN)
  @AuditLog({ module: "AI 工作编排", resource: "biz.ai_work_plan", action: "生成工单", bizType: "biz_ai_work_plan", bizIdParam: "id" })
  materialize(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: MaterializeAiWorkPlanDto
  ) {
    if (!dto.confirm) return this.service.detail(scope, actor, id);
    return this.service.materialize(scope, actor, id);
  }
}
