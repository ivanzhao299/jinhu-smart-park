import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateLeasingInvoiceDto } from "./dto/create-leasing-invoice.dto";
import { LeasingInvoiceQueryDto } from "./dto/leasing-invoice-query.dto";
import { UpdateLeasingInvoiceDto } from "./dto/update-leasing-invoice.dto";
import { LeasingInvoicesService } from "./leasing-invoices.service";

@Controller("leasing/invoices")
@RequireModule("leasing")
export class LeasingInvoicesController {
  constructor(private readonly leasingInvoicesService: LeasingInvoicesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_INVOICE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingInvoiceQueryDto) {
    return this.leasingInvoicesService.list(scope, query, user);
  }

  @Get(":id/receivables")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_INVOICE_READ)
  receivables(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingInvoicesService.listReceivables(scope, id, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_INVOICE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingInvoicesService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_INVOICE_CREATE)
  @AuditLog({ module: "租赁发票", resource: "biz.leasing_invoice", action: "新增", bizType: "biz_leasing_invoice" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateLeasingInvoiceDto) {
    return this.leasingInvoicesService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_INVOICE_UPDATE)
  @AuditLog({ module: "租赁发票", resource: "biz.leasing_invoice", action: "修改", bizType: "biz_leasing_invoice", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateLeasingInvoiceDto
  ) {
    return this.leasingInvoicesService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_INVOICE_DELETE)
  @AuditLog({ module: "租赁发票", resource: "biz.leasing_invoice", action: "删除", bizType: "biz_leasing_invoice", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingInvoicesService.softDelete(scope, user, id);
  }
}
