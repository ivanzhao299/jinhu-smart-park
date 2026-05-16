import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { AssignLeasingLeadDto } from "./dto/assign-leasing-lead.dto";
import { ChangeLeasingLeadStatusDto } from "./dto/change-leasing-lead-status.dto";
import { ConvertLeasingLeadToParkTenantDto } from "./dto/convert-leasing-lead-to-park-tenant.dto";
import { CreateLeasingFollowDto } from "./dto/create-leasing-follow.dto";
import { CreateLeasingLeadDto } from "./dto/create-leasing-lead.dto";
import { CreateLeasingQuoteDto } from "./dto/create-leasing-quote.dto";
import { CreateLeasingVisitDto } from "./dto/create-leasing-visit.dto";
import { LeasingLeadStatusLogQueryDto } from "./dto/leasing-lead-status-log-query.dto";
import { LeasingLeadQueryDto } from "./dto/leasing-lead-query.dto";
import { MoveLeasingLeadToPoolDto } from "./dto/move-leasing-lead-to-pool.dto";
import { UpdateLeasingFollowDto } from "./dto/update-leasing-follow.dto";
import { UpdateLeasingLeadDto } from "./dto/update-leasing-lead.dto";
import { UpdateLeasingQuoteDto } from "./dto/update-leasing-quote.dto";
import { UpdateLeasingVisitDto } from "./dto/update-leasing-visit.dto";
import { LeasingLeadsService } from "./leasing-leads.service";

@Controller("leasing/leads")
@RequireModule("leasing")
export class LeasingLeadsController {
  constructor(private readonly leasingLeadsService: LeasingLeadsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingLeadQueryDto) {
    return this.leasingLeadsService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingLeadsService.detail(scope, id, user);
  }

  @Post(":id/change-status")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_CHANGE_STATUS)
  @AuditLog({ module: "招商线索", resource: "biz.leasing_lead", action: "状态流转", bizType: "biz_leasing_lead", bizIdParam: "id" })
  changeStatus(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ChangeLeasingLeadStatusDto
  ) {
    return this.leasingLeadsService.changeStatus(scope, user, id, dto);
  }

  @Post(":id/convert-to-park-tenant")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_CONVERT_TO_PARK_TENANT, SYSTEM_PERMISSIONS.PARK_TENANT_CREATE)
  @AuditLog({ module: "招商线索", resource: "biz.leasing_lead", action: "转租户企业", bizType: "biz_leasing_lead", bizIdParam: "id" })
  convertToParkTenant(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ConvertLeasingLeadToParkTenantDto
  ) {
    return this.leasingLeadsService.convertToParkTenant(scope, user, id, dto);
  }

  @Get(":id/status-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_STATUS_LOG)
  statusLogs(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: LeasingLeadStatusLogQueryDto
  ) {
    return this.leasingLeadsService.listStatusLogs(scope, user, id, query);
  }

  @Post(":id/assign")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_ASSIGN)
  @AuditLog({ module: "招商公海池", resource: "biz.leasing_lead", action: "分配线索", bizType: "biz_leasing_lead", bizIdParam: "id" })
  assign(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AssignLeasingLeadDto
  ) {
    return this.leasingLeadsService.assign(scope, user, id, dto);
  }

  @Post(":id/reclaim")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_RECLAIM)
  @AuditLog({ module: "招商公海池", resource: "biz.leasing_lead", action: "领取线索", bizType: "biz_leasing_lead", bizIdParam: "id" })
  reclaim(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingLeadsService.reclaim(scope, user, id);
  }

  @Post(":id/move-to-pool")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_MOVE_TO_POOL)
  @AuditLog({ module: "招商公海池", resource: "biz.leasing_lead", action: "移入公海池", bizType: "biz_leasing_lead", bizIdParam: "id" })
  moveToPool(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: MoveLeasingLeadToPoolDto
  ) {
    return this.leasingLeadsService.moveToPool(scope, user, id, dto);
  }

  @Get(":leadId/follows")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_FOLLOW_READ)
  listFollows(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("leadId") leadId: string) {
    return this.leasingLeadsService.listFollows(scope, user, leadId);
  }

  @Post(":leadId/follows")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_FOLLOW_CREATE)
  @AuditLog({ module: "招商线索跟进", resource: "biz.leasing_follow", action: "新增", bizType: "biz_leasing_follow", bizIdParam: "leadId" })
  createFollow(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Body() dto: CreateLeasingFollowDto
  ) {
    return this.leasingLeadsService.createFollow(scope, user, leadId, dto);
  }

  @Put(":leadId/follows/:followId")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_FOLLOW_UPDATE)
  @AuditLog({ module: "招商线索跟进", resource: "biz.leasing_follow", action: "修改", bizType: "biz_leasing_follow", bizIdParam: "followId" })
  updateFollow(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Param("followId") followId: string,
    @Body() dto: UpdateLeasingFollowDto
  ) {
    return this.leasingLeadsService.updateFollow(scope, user, leadId, followId, dto);
  }

  @Delete(":leadId/follows/:followId")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_FOLLOW_DELETE)
  @AuditLog({ module: "招商线索跟进", resource: "biz.leasing_follow", action: "删除", bizType: "biz_leasing_follow", bizIdParam: "followId" })
  removeFollow(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Param("followId") followId: string
  ) {
    return this.leasingLeadsService.softDeleteFollow(scope, user, leadId, followId);
  }

  @Get(":leadId/visits")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_VISIT_READ)
  listVisits(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("leadId") leadId: string) {
    return this.leasingLeadsService.listVisits(scope, user, leadId);
  }

  @Post(":leadId/visits")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_VISIT_CREATE)
  @AuditLog({ module: "招商看房记录", resource: "biz.leasing_visit", action: "新增", bizType: "biz_leasing_visit", bizIdParam: "leadId" })
  createVisit(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Body() dto: CreateLeasingVisitDto
  ) {
    return this.leasingLeadsService.createVisit(scope, user, leadId, dto);
  }

  @Put(":leadId/visits/:visitId")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_VISIT_UPDATE)
  @AuditLog({ module: "招商看房记录", resource: "biz.leasing_visit", action: "修改", bizType: "biz_leasing_visit", bizIdParam: "visitId" })
  updateVisit(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Param("visitId") visitId: string,
    @Body() dto: UpdateLeasingVisitDto
  ) {
    return this.leasingLeadsService.updateVisit(scope, user, leadId, visitId, dto);
  }

  @Delete(":leadId/visits/:visitId")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_VISIT_DELETE)
  @AuditLog({ module: "招商看房记录", resource: "biz.leasing_visit", action: "删除", bizType: "biz_leasing_visit", bizIdParam: "visitId" })
  removeVisit(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Param("visitId") visitId: string
  ) {
    return this.leasingLeadsService.softDeleteVisit(scope, user, leadId, visitId);
  }

  @Get(":leadId/quotes")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_QUOTE_READ)
  listQuotes(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("leadId") leadId: string) {
    return this.leasingLeadsService.listQuotes(scope, user, leadId);
  }

  @Post(":leadId/quotes")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_QUOTE_CREATE)
  @AuditLog({ module: "招商报价方案", resource: "biz.leasing_quote", action: "新增", bizType: "biz_leasing_quote", bizIdParam: "leadId" })
  createQuote(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Body() dto: CreateLeasingQuoteDto
  ) {
    return this.leasingLeadsService.createQuote(scope, user, leadId, dto);
  }

  @Put(":leadId/quotes/:quoteId")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_QUOTE_UPDATE)
  @AuditLog({ module: "招商报价方案", resource: "biz.leasing_quote", action: "修改", bizType: "biz_leasing_quote", bizIdParam: "quoteId" })
  updateQuote(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Param("quoteId") quoteId: string,
    @Body() dto: UpdateLeasingQuoteDto
  ) {
    return this.leasingLeadsService.updateQuote(scope, user, leadId, quoteId, dto);
  }

  @Delete(":leadId/quotes/:quoteId")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_QUOTE_DELETE)
  @AuditLog({ module: "招商报价方案", resource: "biz.leasing_quote", action: "删除", bizType: "biz_leasing_quote", bizIdParam: "quoteId" })
  removeQuote(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("leadId") leadId: string,
    @Param("quoteId") quoteId: string
  ) {
    return this.leasingLeadsService.softDeleteQuote(scope, user, leadId, quoteId);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_CREATE)
  @AuditLog({ module: "招商线索", resource: "biz.leasing_lead", action: "新增", bizType: "biz_leasing_lead" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateLeasingLeadDto) {
    return this.leasingLeadsService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_UPDATE)
  @AuditLog({ module: "招商线索", resource: "biz.leasing_lead", action: "修改", bizType: "biz_leasing_lead", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateLeasingLeadDto
  ) {
    return this.leasingLeadsService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_LEAD_DELETE)
  @AuditLog({ module: "招商线索", resource: "biz.leasing_lead", action: "删除", bizType: "biz_leasing_lead", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingLeadsService.softDelete(scope, user, id);
  }
}
