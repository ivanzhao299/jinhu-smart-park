import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { ChangeParkTenantRiskDto } from "./dto/change-park-tenant-risk.dto";
import { CreateParkTenantContactDto } from "./dto/create-park-tenant-contact.dto";
import { CreateParkTenantQualificationDto } from "./dto/create-park-tenant-qualification.dto";
import { CreateParkTenantDto } from "./dto/create-park-tenant.dto";
import { ParkTenantQueryDto } from "./dto/park-tenant-query.dto";
import { UpdateParkTenantContactDto } from "./dto/update-park-tenant-contact.dto";
import { UpdateParkTenantQualificationDto } from "./dto/update-park-tenant-qualification.dto";
import { UpdateParkTenantDto } from "./dto/update-park-tenant.dto";
import { ParkTenantContactsService } from "./park-tenant-contacts.service";
import { ParkTenantQualificationsService } from "./park-tenant-qualifications.service";
import { ParkTenantsService } from "./park-tenants.service";

@Controller("park-tenants")
@RequireModule("leasing")
export class ParkTenantsController {
  constructor(
    private readonly parkTenantsService: ParkTenantsService,
    private readonly contactsService: ParkTenantContactsService,
    private readonly qualificationsService: ParkTenantQualificationsService
  ) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: ParkTenantQueryDto) {
    return this.parkTenantsService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.parkTenantsService.detail(scope, id, user);
  }

  @Get(":id/360")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_READ, SYSTEM_PERMISSIONS.PARK_TENANT_360)
  tenant360(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.parkTenantsService.tenant360(scope, id, user);
  }

  @Post(":id/change-risk-level")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_RISK_UPDATE)
  @AuditLog({ module: "租户企业风险", resource: "biz.park_tenant", action: "风险变更", bizType: "biz_park_tenant_risk_log", bizIdParam: "id" })
  changeRiskLevel(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ChangeParkTenantRiskDto
  ) {
    return this.parkTenantsService.changeRiskLevel(scope, user, id, dto);
  }

  @Get(":id/risk-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_RISK_LOG)
  riskLogs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.parkTenantsService.riskLogs(scope, user, id);
  }

  @Get(":parkTenantId/contacts")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_CONTACT_READ)
  listContacts(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("parkTenantId") parkTenantId: string) {
    return this.contactsService.list(scope, user, parkTenantId);
  }

  @Post(":parkTenantId/contacts")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_CONTACT_CREATE)
  @AuditLog({ module: "租户企业联系人", resource: "biz.park_tenant_contact", action: "新增", bizType: "biz_park_tenant_contact" })
  createContact(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("parkTenantId") parkTenantId: string,
    @Body() dto: CreateParkTenantContactDto
  ) {
    return this.contactsService.create(scope, user, parkTenantId, dto);
  }

  @Put(":parkTenantId/contacts/:contactId")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_CONTACT_UPDATE)
  @AuditLog({ module: "租户企业联系人", resource: "biz.park_tenant_contact", action: "修改", bizType: "biz_park_tenant_contact", bizIdParam: "contactId" })
  updateContact(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("parkTenantId") parkTenantId: string,
    @Param("contactId") contactId: string,
    @Body() dto: UpdateParkTenantContactDto
  ) {
    return this.contactsService.update(scope, user, parkTenantId, contactId, dto);
  }

  @Delete(":parkTenantId/contacts/:contactId")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_CONTACT_DELETE)
  @AuditLog({ module: "租户企业联系人", resource: "biz.park_tenant_contact", action: "删除", bizType: "biz_park_tenant_contact", bizIdParam: "contactId" })
  removeContact(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("parkTenantId") parkTenantId: string,
    @Param("contactId") contactId: string
  ) {
    return this.contactsService.softDelete(scope, user, parkTenantId, contactId);
  }

  @Get(":parkTenantId/qualifications")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_QUALIFICATION_READ)
  listQualifications(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("parkTenantId") parkTenantId: string) {
    return this.qualificationsService.list(scope, user, parkTenantId);
  }

  @Post(":parkTenantId/qualifications")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_QUALIFICATION_CREATE)
  @AuditLog({ module: "租户企业资质", resource: "biz.park_tenant_qualification", action: "新增", bizType: "biz_park_tenant_qualification" })
  createQualification(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("parkTenantId") parkTenantId: string,
    @Body() dto: CreateParkTenantQualificationDto
  ) {
    return this.qualificationsService.create(scope, user, parkTenantId, dto);
  }

  @Put(":parkTenantId/qualifications/:qualificationId")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_QUALIFICATION_UPDATE)
  @AuditLog({ module: "租户企业资质", resource: "biz.park_tenant_qualification", action: "修改", bizType: "biz_park_tenant_qualification", bizIdParam: "qualificationId" })
  updateQualification(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("parkTenantId") parkTenantId: string,
    @Param("qualificationId") qualificationId: string,
    @Body() dto: UpdateParkTenantQualificationDto
  ) {
    return this.qualificationsService.update(scope, user, parkTenantId, qualificationId, dto);
  }

  @Delete(":parkTenantId/qualifications/:qualificationId")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_QUALIFICATION_DELETE)
  @AuditLog({ module: "租户企业资质", resource: "biz.park_tenant_qualification", action: "删除", bizType: "biz_park_tenant_qualification", bizIdParam: "qualificationId" })
  removeQualification(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("parkTenantId") parkTenantId: string,
    @Param("qualificationId") qualificationId: string
  ) {
    return this.qualificationsService.softDelete(scope, user, parkTenantId, qualificationId);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_CREATE)
  @AuditLog({ module: "租户企业档案", resource: "biz.park_tenant", action: "新增", bizType: "biz_park_tenant" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateParkTenantDto) {
    return this.parkTenantsService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_UPDATE)
  @AuditLog({ module: "租户企业档案", resource: "biz.park_tenant", action: "修改", bizType: "biz_park_tenant", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateParkTenantDto
  ) {
    return this.parkTenantsService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_TENANT_DELETE)
  @AuditLog({ module: "租户企业档案", resource: "biz.park_tenant", action: "删除", bizType: "biz_park_tenant", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.parkTenantsService.softDelete(scope, user, id);
  }
}
