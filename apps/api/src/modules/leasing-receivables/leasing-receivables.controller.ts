import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateLeasingReceivableDto } from "./dto/create-leasing-receivable.dto";
import { GenerateReceivablesBatchDto } from "./dto/generate-receivables.dto";
import { LeasingReceivableQueryDto } from "./dto/leasing-receivable-query.dto";
import { LeasingReceivableStatusLogQueryDto } from "./dto/leasing-receivable-status-log-query.dto";
import { ReceivableAgingQueryDto, ReceivableOverdueQueryDto } from "./dto/receivable-aging-query.dto";
import { UpdateLeasingReceivableDto } from "./dto/update-leasing-receivable.dto";
import { LeasingReceivablesService } from "./leasing-receivables.service";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";

@Controller("leasing/receivables")
@RequireModule("leasing")
export class LeasingReceivablesController {
  constructor(private readonly leasingReceivablesService: LeasingReceivablesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingReceivableQueryDto) {
    return this.leasingReceivablesService.list(scope, query, user);
  }

  @Post("generate-batch")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_GENERATE_BATCH)
  @AuditLog({ module: "租赁应收", resource: "biz.leasing_receivable", action: "批量生成", bizType: "biz_leasing_receivable" })
  generateBatch(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: GenerateReceivablesBatchDto) {
    return this.leasingReceivablesService.generateBatch(scope, user, dto);
  }

  @Post("recalculate-overdue")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_OVERDUE)
  @AuditLog({ module: "租赁应收", resource: "biz.leasing_receivable", action: "重算逾期", bizType: "biz_leasing_receivable" })
  recalculateOverdue(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.leasingReceivablesService.recalculateOverdue(scope, user);
  }

  @Get("overdue")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_OVERDUE)
  overdue(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: ReceivableOverdueQueryDto) {
    return this.leasingReceivablesService.listOverdue(scope, query, user);
  }

  @Get("aging")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_AGING)
  aging(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: ReceivableAgingQueryDto) {
    return this.leasingReceivablesService.getAging(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingReceivablesService.detail(scope, id, user);
  }

  @Get(":id/status-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_STATUS_LOG)
  statusLogs(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: LeasingReceivableStatusLogQueryDto
  ) {
    return this.leasingReceivablesService.listStatusLogs(scope, user, id, query);
  }

  @Post()
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_CREATE)
  @AuditLog({ module: "租赁应收", resource: "biz.leasing_receivable", action: "新增", bizType: "biz_leasing_receivable" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateLeasingReceivableDto) {
    return this.leasingReceivablesService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_UPDATE)
  @AuditLog({ module: "租赁应收", resource: "biz.leasing_receivable", action: "修改", bizType: "biz_leasing_receivable", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateLeasingReceivableDto
  ) {
    return this.leasingReceivablesService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_DELETE)
  @AuditLog({ module: "租赁应收", resource: "biz.leasing_receivable", action: "删除", bizType: "biz_leasing_receivable", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingReceivablesService.softDelete(scope, user, id);
  }
}
