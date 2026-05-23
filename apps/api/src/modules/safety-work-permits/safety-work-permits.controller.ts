import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions, RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateSafetyWorkPermitDto } from "./dto/create-safety-work-permit.dto";
import {
  CreateWorkPermitCheckHazardDto,
  CreateWorkPermitCheckWorkOrderDto,
  RejectSafetyWorkPermitDto,
  SafetyWorkPermitActionDto,
  SafetyWorkPermitCloseDto,
  SafetyWorkPermitPhotoActionDto,
  SafetyWorkPermitProcessCheckDto,
  SafetyWorkPermitStopDto
} from "./dto/safety-work-permit-action.dto";
import { SafetyWorkPermitQueryDto } from "./dto/safety-work-permit-query.dto";
import { UpdateSafetyWorkPermitDto } from "./dto/update-safety-work-permit.dto";
import { SafetyWorkPermitsService } from "./safety-work-permits.service";

@Controller("safety/work-permits")
@RequireModule("safety")
export class SafetyWorkPermitsController {
  constructor(private readonly service: SafetyWorkPermitsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyWorkPermitQueryDto) {
    return this.service.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.detail(scope, id, user);
  }

  @Get(":id/logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_READ)
  logs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.listLogs(scope, id, user);
  }

  @Get(":id/checks")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_READ)
  checks(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.listChecks(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_CREATE)
  @AuditLog({ module: "安全作业许可", action: "申请", resource: "biz.safety_work_permit", bizType: "biz_safety_work_permit" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyWorkPermitDto) {
    return this.service.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_UPDATE)
  @AuditLog({
    module: "安全作业许可",
    action: "修改",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSafetyWorkPermitDto
  ) {
    return this.service.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_DELETE)
  @AuditLog({
    module: "安全作业许可",
    action: "删除",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.softDelete(scope, user, id);
  }

  @Post(":id/submit")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_SUBMIT)
  @AuditLog({
    module: "安全作业许可",
    action: "提交审批",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  submit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: SafetyWorkPermitActionDto) {
    return this.service.submit(scope, user, id, dto);
  }

  @Post(":id/approve")
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_PROPERTY,
    SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_SAFETY,
    SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_OPERATION
  )
  @AuditLog({
    module: "安全作业许可",
    action: "审批通过",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  approve(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: SafetyWorkPermitActionDto) {
    return this.service.approve(scope, user, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_REJECT)
  @AuditLog({
    module: "安全作业许可",
    action: "审批驳回",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  reject(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: RejectSafetyWorkPermitDto) {
    return this.service.reject(scope, user, id, dto);
  }

  @Post(":id/void")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_VOID)
  @AuditLog({
    module: "安全作业许可",
    action: "作废",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  voidPermit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: SafetyWorkPermitActionDto) {
    return this.service.voidPermit(scope, user, id, dto);
  }

  @Post(":id/start")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_START)
  @AuditLog({
    module: "安全作业许可",
    action: "开工",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  start(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: SafetyWorkPermitPhotoActionDto) {
    return this.service.start(scope, user, id, dto);
  }

  @Post(":id/process-check")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_PROCESS_CHECK)
  @AuditLog({
    module: "安全作业许可",
    action: "过程巡查",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  processCheck(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SafetyWorkPermitProcessCheckDto
  ) {
    return this.service.processCheck(scope, user, id, dto);
  }

  @Post(":id/stop")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_STOP)
  @AuditLog({
    module: "安全作业许可",
    action: "违规停工",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  stop(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: SafetyWorkPermitStopDto) {
    return this.service.stop(scope, user, id, dto);
  }

  @Post(":id/finish")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_FINISH)
  @AuditLog({
    module: "安全作业许可",
    action: "完工",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  finish(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: SafetyWorkPermitPhotoActionDto) {
    return this.service.finish(scope, user, id, dto);
  }

  @Post(":id/close")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_CLOSE)
  @AuditLog({
    module: "安全作业许可",
    action: "完工收单",
    resource: "biz.safety_work_permit",
    bizType: "biz_safety_work_permit",
    bizIdParam: "id"
  })
  close(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: SafetyWorkPermitCloseDto) {
    return this.service.close(scope, user, id, dto);
  }

  @Post(":id/checks/:checkId/create-hazard")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_CREATE_HAZARD, SYSTEM_PERMISSIONS.SAFETY_HAZARD_CREATE)
  @AuditLog({
    module: "安全作业许可",
    action: "违规转隐患",
    resource: "biz.safety_work_permit_check",
    bizType: "biz_safety_work_permit_check",
    bizIdParam: "checkId"
  })
  createHazardFromCheck(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Param("checkId") checkId: string,
    @Body() dto: CreateWorkPermitCheckHazardDto
  ) {
    return this.service.createHazardFromCheck(scope, user, id, checkId, dto);
  }

  @Post(":id/checks/:checkId/create-work-order")
  @RequireModule("safety", "workorder")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_CREATE_WORKORDER, SYSTEM_PERMISSIONS.WORKORDER_CREATE)
  @AuditLog({
    module: "安全作业许可",
    action: "违规转工单",
    resource: "biz.safety_work_permit_check",
    bizType: "biz_safety_work_permit_check",
    bizIdParam: "checkId"
  })
  createWorkOrderFromCheck(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Param("checkId") checkId: string,
    @Body() dto: CreateWorkPermitCheckWorkOrderDto
  ) {
    return this.service.createWorkOrderFromCheck(scope, user, id, checkId, dto);
  }
}
