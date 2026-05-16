import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateLeasingFollowDto } from "./dto/create-leasing-follow.dto";
import { CreateLeasingLeadDto } from "./dto/create-leasing-lead.dto";
import { CreateLeasingVisitDto } from "./dto/create-leasing-visit.dto";
import { LeasingLeadQueryDto } from "./dto/leasing-lead-query.dto";
import { UpdateLeasingFollowDto } from "./dto/update-leasing-follow.dto";
import { UpdateLeasingLeadDto } from "./dto/update-leasing-lead.dto";
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
