import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateSafetyEmergencyContactDto } from "./dto/create-safety-emergency-contact.dto";
import { SafetyEmergencyContactQueryDto } from "./dto/safety-emergency-contact-query.dto";
import { UpdateSafetyEmergencyContactDto } from "./dto/update-safety-emergency-contact.dto";
import { SafetyEmergencyService } from "./safety-emergency.service";

@Controller("safety/emergency-contacts")
@RequireModule("safety")
export class SafetyEmergencyContactsController {
  constructor(private readonly service: SafetyEmergencyService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyEmergencyContactQueryDto) {
    return this.service.listContacts(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.contactDetail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_CREATE)
  @AuditLog({ module: "安全应急", action: "新增", resource: "biz.safety_emergency_contact", bizType: "biz_safety_emergency_contact" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyEmergencyContactDto) {
    return this.service.createContact(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_UPDATE)
  @AuditLog({
    module: "安全应急",
    action: "修改",
    resource: "biz.safety_emergency_contact",
    bizType: "biz_safety_emergency_contact",
    bizIdParam: "id"
  })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSafetyEmergencyContactDto
  ) {
    return this.service.updateContact(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_DELETE)
  @AuditLog({
    module: "安全应急",
    action: "删除",
    resource: "biz.safety_emergency_contact",
    bizType: "biz_safety_emergency_contact",
    bizIdParam: "id"
  })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.softDeleteContact(scope, user, id);
  }
}
