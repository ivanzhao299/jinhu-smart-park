import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateEmergencyWorkOrderDto } from "./dto/create-emergency-work-order.dto";
import { CreateSafetyEmergencyEventDto } from "./dto/create-safety-emergency-event.dto";
import {
  CreateSafetyEmergencyTimelineDto,
  SafetyEmergencyActionDto,
  SafetyEmergencyReviewDto
} from "./dto/safety-emergency-action.dto";
import { SafetyEmergencyEventQueryDto } from "./dto/safety-emergency-event-query.dto";
import { SosSafetyEmergencyEventDto } from "./dto/sos-safety-emergency-event.dto";
import { UpdateSafetyEmergencyEventDto } from "./dto/update-safety-emergency-event.dto";
import { SafetyEmergencyService } from "./safety-emergency.service";

@Controller("safety/emergencies")
@RequireModule("safety")
export class SafetyEmergenciesController {
  constructor(private readonly service: SafetyEmergencyService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyEmergencyEventQueryDto) {
    return this.service.listEvents(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.eventDetail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CREATE)
  @AuditLog({ module: "安全应急", action: "上报", resource: "biz.safety_emergency_event", bizType: "biz_safety_emergency_event" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyEmergencyEventDto) {
    return this.service.createEvent(scope, user, dto);
  }

  @Post("sos")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_SOS)
  @AuditLog({ module: "安全应急", action: "一键上报", resource: "biz.safety_emergency_event", bizType: "biz_safety_emergency_event" })
  sos(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: SosSafetyEmergencyEventDto) {
    return this.service.sosEvent(scope, user, dto);
  }

  @Get(":id/timeline")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_TIMELINE_READ)
  timeline(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.eventTimeline(scope, user, id);
  }

  @Post(":id/timeline")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_TIMELINE_CREATE)
  @AuditLog({
    module: "安全应急",
    action: "追加处置记录",
    resource: "biz.safety_emergency_timeline",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  createTimeline(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateSafetyEmergencyTimelineDto
  ) {
    return this.service.addEventTimeline(scope, user, id, dto);
  }

  @Post(":id/respond")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_RESPOND)
  @AuditLog({
    module: "安全应急",
    action: "响应",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  respond(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SafetyEmergencyActionDto
  ) {
    return this.service.respondEvent(scope, user, id, dto);
  }

  @Post(":id/start-disposal")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_DISPOSE)
  @AuditLog({
    module: "安全应急",
    action: "开始处置",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  startDisposal(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SafetyEmergencyActionDto
  ) {
    return this.service.startDisposalEvent(scope, user, id, dto);
  }

  @Post(":id/control")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTROL)
  @AuditLog({
    module: "安全应急",
    action: "标记已控制",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  control(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SafetyEmergencyActionDto
  ) {
    return this.service.controlEvent(scope, user, id, dto);
  }

  @Post(":id/review")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_REVIEW)
  @AuditLog({
    module: "安全应急",
    action: "提交复盘",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  review(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SafetyEmergencyReviewDto
  ) {
    return this.service.reviewEvent(scope, user, id, dto);
  }

  @Post(":id/close")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CLOSE)
  @AuditLog({
    module: "安全应急",
    action: "关闭",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  close(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SafetyEmergencyActionDto
  ) {
    return this.service.closeEvent(scope, user, id, dto);
  }

  @Post(":id/upgrade")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_UPGRADE)
  @AuditLog({
    module: "安全应急",
    action: "升级",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  upgrade(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SafetyEmergencyActionDto
  ) {
    return this.service.upgradeEvent(scope, user, id, dto);
  }

  @Post(":id/cancel")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CANCEL)
  @AuditLog({
    module: "安全应急",
    action: "取消误报",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  cancel(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: SafetyEmergencyActionDto
  ) {
    return this.service.cancelEvent(scope, user, id, dto);
  }

  @Post(":id/create-work-order")
  @RequireModule("safety", "workorder")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CREATE_WORKORDER, SYSTEM_PERMISSIONS.WORKORDER_CREATE)
  @AuditLog({
    module: "安全应急",
    action: "应急转工单",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  createWorkOrder(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CreateEmergencyWorkOrderDto
  ) {
    return this.service.createWorkOrder(scope, user, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_UPDATE)
  @AuditLog({
    module: "安全应急",
    action: "修改",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSafetyEmergencyEventDto
  ) {
    return this.service.updateEvent(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_DELETE)
  @AuditLog({
    module: "安全应急",
    action: "删除",
    resource: "biz.safety_emergency_event",
    bizType: "biz_safety_emergency_event",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.softDeleteEvent(scope, user, id);
  }
}
