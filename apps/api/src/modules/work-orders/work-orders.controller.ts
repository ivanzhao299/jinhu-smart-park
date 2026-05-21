import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { AssignWorkOrderDto } from "./dto/assign-work-order.dto";
import { CloseWorkOrderDto } from "./dto/close-work-order.dto";
import { ConfirmWorkOrderDto } from "./dto/confirm-work-order.dto";
import { CreateWorkOrderDto } from "./dto/create-work-order.dto";
import { EvaluateWorkOrderDto } from "./dto/evaluate-work-order.dto";
import { FinishWorkOrderDto } from "./dto/finish-work-order.dto";
import { ReasonWorkOrderDto } from "./dto/reason-work-order.dto";
import { UpdateWorkOrderDto } from "./dto/update-work-order.dto";
import { WaitMaterialWorkOrderDto } from "./dto/wait-material-work-order.dto";
import { CreateWorkOrderLogDto, WorkOrderLogQueryDto } from "./dto/work-order-log.dto";
import { CreateWorkOrderSlaRuleDto, UpdateWorkOrderSlaRuleDto, WorkOrderSlaRuleQueryDto } from "./dto/work-order-sla-rule.dto";
import { WorkOrderQueryDto } from "./dto/work-order-query.dto";
import { WorkOrderStatsQueryDto } from "./dto/work-order-stats-query.dto";
import { WorkOrdersService } from "./work-orders.service";

@Controller("work-orders")
@RequireModule("workorder")
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: WorkOrderQueryDto) {
    return this.workOrdersService.list(scope, query, user);
  }

  @Get("sla-rules")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_SLA_READ)
  listSlaRules(@CurrentScope() scope: TenantParkScope, @Query() query: WorkOrderSlaRuleQueryDto) {
    return this.workOrdersService.listSlaRules(scope, query);
  }

  @Post("sla-rules")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_SLA_CREATE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order_sla_rule", action: "新增", bizType: "biz_work_order_sla_rule" })
  createSlaRule(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateWorkOrderSlaRuleDto) {
    return this.workOrdersService.createSlaRule(scope, user, dto);
  }

  @Put("sla-rules/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_SLA_UPDATE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order_sla_rule", action: "修改", bizType: "biz_work_order_sla_rule", bizIdParam: "id" })
  updateSlaRule(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateWorkOrderSlaRuleDto
  ) {
    return this.workOrdersService.updateSlaRule(scope, user, id, dto);
  }

  @Delete("sla-rules/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_SLA_DELETE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order_sla_rule", action: "删除", bizType: "biz_work_order_sla_rule", bizIdParam: "id" })
  deleteSlaRule(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.workOrdersService.deleteSlaRule(scope, user, id);
  }

  @Post("recalculate-overdue")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_RECALCULATE_OVERDUE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "重算超时", bizType: "biz_work_order" })
  recalculateOverdue(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.workOrdersService.recalculateOverdue(scope, user);
  }

  @Get("overdue")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_OVERDUE)
  overdue(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: WorkOrderQueryDto) {
    return this.workOrdersService.overdue(scope, query, user);
  }

  @Get("stats")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_STATS)
  stats(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: WorkOrderStatsQueryDto) {
    return this.workOrdersService.stats(scope, query, user);
  }

  @Get(":id/logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_LOG_READ)
  logs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Query() query: WorkOrderLogQueryDto) {
    return this.workOrdersService.logs(scope, user, id, query);
  }

  @Post(":id/logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_LOG_CREATE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order_log", action: "新增", bizType: "biz_work_order_log", bizIdParam: "id" })
  createLog(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: CreateWorkOrderLogDto) {
    return this.workOrdersService.createLog(scope, user, id, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.workOrdersService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_CREATE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "新增", bizType: "biz_work_order" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateWorkOrderDto) {
    return this.workOrdersService.create(scope, user, dto);
  }

  @Post(":id/assign")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_ASSIGN)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "派单", bizType: "biz_work_order", bizIdParam: "id" })
  assign(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignWorkOrderDto
  ) {
    return this.workOrdersService.assign(scope, user, id, dto);
  }

  @Post(":id/reassign")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_REASSIGN)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "改派", bizType: "biz_work_order", bizIdParam: "id" })
  reassign(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignWorkOrderDto
  ) {
    return this.workOrdersService.reassign(scope, user, id, dto);
  }

  @Post(":id/accept")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_ACCEPT)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "接单", bizType: "biz_work_order", bizIdParam: "id" })
  accept(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.workOrdersService.accept(scope, user, id);
  }

  @Post(":id/start")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_START)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "开始处理", bizType: "biz_work_order", bizIdParam: "id" })
  start(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.workOrdersService.start(scope, user, id);
  }

  @Post(":id/wait-material")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_WAIT_MATERIAL)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "待物料", bizType: "biz_work_order", bizIdParam: "id" })
  waitMaterial(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: WaitMaterialWorkOrderDto
  ) {
    return this.workOrdersService.waitMaterial(scope, user, id, dto);
  }

  @Post(":id/finish")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_FINISH)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "完成处理", bizType: "biz_work_order", bizIdParam: "id" })
  finish(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: FinishWorkOrderDto
  ) {
    return this.workOrdersService.finish(scope, user, id, dto);
  }

  @Post(":id/confirm")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_CONFIRM)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "确认完成", bizType: "biz_work_order", bizIdParam: "id" })
  confirm(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ConfirmWorkOrderDto
  ) {
    return this.workOrdersService.confirm(scope, user, id, dto);
  }

  @Post(":id/evaluate")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_EVALUATE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "评价", bizType: "biz_work_order", bizIdParam: "id" })
  evaluate(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: EvaluateWorkOrderDto
  ) {
    return this.workOrdersService.evaluate(scope, user, id, dto);
  }

  @Post(":id/close")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_CLOSE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "关闭", bizType: "biz_work_order", bizIdParam: "id" })
  close(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: CloseWorkOrderDto
  ) {
    return this.workOrdersService.close(scope, user, id, dto);
  }

  @Post(":id/cancel")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_CANCEL)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "取消", bizType: "biz_work_order", bizIdParam: "id" })
  cancel(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReasonWorkOrderDto
  ) {
    return this.workOrdersService.cancel(scope, user, id, dto);
  }

  @Post(":id/return")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_RETURN)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "退回", bizType: "biz_work_order", bizIdParam: "id" })
  returnWorkOrder(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReasonWorkOrderDto
  ) {
    return this.workOrdersService.returnWorkOrder(scope, user, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_REJECT)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "驳回", bizType: "biz_work_order", bizIdParam: "id" })
  reject(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReasonWorkOrderDto
  ) {
    return this.workOrdersService.reject(scope, user, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_UPDATE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "修改", bizType: "biz_work_order", bizIdParam: "id" })
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.workOrdersService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_DELETE)
  @AuditLog({ module: "工单管理", resource: "biz.work_order", action: "删除", bizType: "biz_work_order", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.workOrdersService.softDelete(scope, user, id);
  }
}
