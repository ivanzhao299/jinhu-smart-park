import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { TenantParkScope } from "@jinhu/shared";
import { AssignRectifySafetyHazardDto } from "./dto/assign-rectify-safety-hazard.dto";
import { CreateHazardEmergencyDto } from "./dto/create-hazard-emergency.dto";
import { CreateHazardWorkOrderDto } from "./dto/create-hazard-work-order.dto";
import { CreateSafetyHazardDto } from "./dto/create-safety-hazard.dto";
import { RectifySafetyHazardDto } from "./dto/rectify-safety-hazard.dto";
import { ReasonSafetyHazardActionDto } from "./dto/reason-safety-hazard-action.dto";
import { RecheckSafetyHazardDto } from "./dto/recheck-safety-hazard.dto";
import { SafetyHazardQueryDto } from "./dto/safety-hazard-query.dto";
import { UpdateSafetyHazardDto } from "./dto/update-safety-hazard.dto";
import { SafetyHazardsService } from "./safety-hazards.service";

@Controller("safety/hazards")
@RequireModule("safety")
export class SafetyHazardsController {
  constructor(private readonly service: SafetyHazardsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyHazardQueryDto) {
    return this.service.list(scope, query, user);
  }

  @Get("overdue")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_OVERDUE)
  overdue(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyHazardQueryDto) {
    return this.service.overdue(scope, query, user);
  }

  @Post("recalculate-overdue")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_RECALCULATE_OVERDUE)
  @AuditLog({ module: "安全管理", action: "重算隐患超期", resource: "biz.safety_hazard", bizType: "biz_safety_hazard" })
  recalculateOverdue(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.service.recalculateOverdue(scope, user);
  }

  @Get(":id/status-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_READ)
  statusLogs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.statusLogs(scope, id, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_CREATE)
  @AuditLog({ module: "安全管理", action: "新增", resource: "biz.safety_hazard", bizType: "biz_safety_hazard" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyHazardDto) {
    return this.service.create(scope, user, dto);
  }

  @Post(":id/assign-rectify")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_ASSIGN_RECTIFY)
  @AuditLog({ module: "安全管理", action: "下达整改", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  assignRectify(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignRectifySafetyHazardDto
  ) {
    return this.service.assignRectify(scope, user, id, dto);
  }

  @Post(":id/rectify")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_RECTIFY)
  @AuditLog({ module: "安全管理", action: "整改完成", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  rectify(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RectifySafetyHazardDto
  ) {
    return this.service.rectify(scope, user, id, dto);
  }

  @Post(":id/recheck")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_RECHECK)
  @AuditLog({ module: "安全管理", action: "隐患复查", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  recheck(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RecheckSafetyHazardDto
  ) {
    return this.service.recheck(scope, user, id, dto);
  }

  @Post(":id/reject-rectify")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_REJECT_RECTIFY)
  @AuditLog({ module: "安全管理", action: "退回整改", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  rejectRectify(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReasonSafetyHazardActionDto
  ) {
    return this.service.rejectRectify(scope, user, id, dto);
  }

  @Post(":id/close")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_CLOSE)
  @AuditLog({ module: "安全管理", action: "关闭隐患", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  close(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReasonSafetyHazardActionDto
  ) {
    return this.service.close(scope, user, id, dto);
  }

  @Post(":id/upgrade")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_UPGRADE)
  @AuditLog({ module: "安全管理", action: "隐患升级", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  upgrade(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReasonSafetyHazardActionDto
  ) {
    return this.service.upgrade(scope, user, id, dto);
  }

  @Post(":id/create-work-order")
  @RequireModule("safety", "workorder")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_CREATE_WORKORDER, SYSTEM_PERMISSIONS.WORKORDER_CREATE)
  @AuditLog({ module: "安全管理", action: "隐患转工单", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  createWorkOrder(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateHazardWorkOrderDto
  ) {
    return this.service.createWorkOrder(scope, user, id, dto);
  }

  @Post(":id/to-emergency")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_TO_EMERGENCY, SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CREATE)
  @AuditLog({ module: "安全管理", action: "隐患转应急事件", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  toEmergency(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateHazardEmergencyDto
  ) {
    return this.service.toEmergency(scope, user, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_UPDATE)
  @AuditLog({ module: "安全管理", action: "修改", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSafetyHazardDto
  ) {
    return this.service.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_HAZARD_DELETE)
  @AuditLog({ module: "安全管理", action: "删除", resource: "biz.safety_hazard", bizType: "biz_safety_hazard", bizIdParam: "id" })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.softDelete(scope, user, id);
  }
}
