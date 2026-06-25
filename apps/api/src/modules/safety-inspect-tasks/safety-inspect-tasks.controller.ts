import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CheckInSafetyInspectTaskDto } from "./dto/check-in-safety-inspect-task.dto";
import { CreateSafetyInspectTaskDto } from "./dto/create-safety-inspect-task.dto";
import { GenerateSafetyInspectTasksDto } from "./dto/generate-safety-inspect-tasks.dto";
import { SafetyInspectTaskQueryDto } from "./dto/safety-inspect-task-query.dto";
import { SubmitSafetyInspectResultsDto } from "./dto/submit-safety-inspect-results.dto";
import { SafetyInspectTasksService } from "./safety-inspect-tasks.service";

@Controller("safety")
@RequireModule("safety")
export class SafetyInspectTasksController {
  constructor(private readonly service: SafetyInspectTasksService) {}

  @Get("my-inspect-tasks")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY)
  myTasks(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyInspectTaskQueryDto) {
    return this.service.myTasks(scope, query, user);
  }

  @Get("my-inspect-tasks/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY)
  myTaskDetail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.myTaskDetail(scope, id, user);
  }

  @Get("inspect-tasks")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyInspectTaskQueryDto) {
    return this.service.list(scope, query, user);
  }

  @Get("inspect-tasks/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.detail(scope, id, user);
  }

  @Post("inspect-tasks")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_CREATE)
  @AuditLog({ module: "安全巡检", action: "新增巡检任务", resource: "biz.safety_inspect_task", bizType: "biz_safety_inspect_task" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyInspectTaskDto) {
    return this.service.create(scope, user, dto);
  }

  @Post("inspect-tasks/:id/start")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_START)
  @AuditLog({ module: "安全巡检", action: "开始巡检任务", resource: "biz.safety_inspect_task", bizType: "biz_safety_inspect_task", bizIdParam: "id" })
  start(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.start(scope, user, id);
  }

  @Post("inspect-tasks/:id/check-in")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_CHECK_IN)
  @AuditLog({ module: "安全巡检", action: "巡检打卡", resource: "biz.safety_inspect_task", bizType: "biz_safety_inspect_task", bizIdParam: "id" })
  checkIn(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CheckInSafetyInspectTaskDto
  ) {
    return this.service.checkIn(scope, user, id, dto);
  }

  @Post("inspect-tasks/:id/submit-results")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_SUBMIT_RESULTS)
  @AuditLog({ module: "安全巡检", action: "提交巡检结果", resource: "biz.safety_inspect_task", bizType: "biz_safety_inspect_task", bizIdParam: "id" })
  submitResults(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SubmitSafetyInspectResultsDto
  ) {
    return this.service.submitResults(scope, user, id, dto);
  }

  @Post("inspect-tasks/:id/draft")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_SUBMIT_RESULTS)
  @AuditLog({ module: "安全巡检", action: "保存巡检草稿", resource: "biz.safety_inspect_task", bizType: "biz_safety_inspect_task", bizIdParam: "id" })
  saveDraft(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SubmitSafetyInspectResultsDto
  ) {
    return this.service.saveDraft(scope, user, id, dto);
  }

  @Post("inspect-plans/:id/generate-tasks")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_GENERATE)
  @AuditLog({
    module: "安全巡检",
    action: "巡检计划生成任务",
    resource: "biz.safety_inspect_task",
    bizType: "biz_safety_inspect_plan",
    bizIdParam: "id"
  })
  generateFromPlan(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: GenerateSafetyInspectTasksDto
  ) {
    return this.service.generateFromPlan(scope, user, id, dto);
  }
}
