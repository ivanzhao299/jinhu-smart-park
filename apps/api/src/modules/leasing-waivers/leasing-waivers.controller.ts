import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateLeasingWaiverDto } from "./dto/create-leasing-waiver.dto";
import { LeasingWaiverApprovalDto, RejectLeasingWaiverDto } from "./dto/leasing-waiver-approval.dto";
import { LeasingWaiverQueryDto } from "./dto/leasing-waiver-query.dto";
import { LeasingWaiversService } from "./leasing-waivers.service";

@Controller("leasing/waivers")
@RequireModule("leasing")
export class LeasingWaiversController {
  constructor(private readonly leasingWaiversService: LeasingWaiversService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_WAIVER_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingWaiverQueryDto) {
    return this.leasingWaiversService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_WAIVER_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingWaiversService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_WAIVER_CREATE)
  @AuditLog({ module: "租赁豁免", resource: "biz.leasing_waiver", action: "新增", bizType: "biz_leasing_waiver" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateLeasingWaiverDto) {
    return this.leasingWaiversService.create(scope, user, dto);
  }

  @Post(":id/approve")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_WAIVER_APPROVE)
  @AuditLog({ module: "租赁豁免", resource: "biz.leasing_waiver", action: "审批通过", bizType: "biz_leasing_waiver", bizIdParam: "id" })
  approve(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: LeasingWaiverApprovalDto
  ) {
    return this.leasingWaiversService.approve(scope, user, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_WAIVER_REJECT)
  @AuditLog({ module: "租赁豁免", resource: "biz.leasing_waiver", action: "审批驳回", bizType: "biz_leasing_waiver", bizIdParam: "id" })
  reject(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RejectLeasingWaiverDto
  ) {
    return this.leasingWaiversService.reject(scope, user, id, dto);
  }
}
