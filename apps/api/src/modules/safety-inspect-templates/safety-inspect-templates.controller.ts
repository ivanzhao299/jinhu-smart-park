import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { TenantParkScope } from "@jinhu/shared";
import { CreateSafetyInspectItemDto } from "./dto/create-safety-inspect-item.dto";
import { CreateSafetyInspectTemplateDto } from "./dto/create-safety-inspect-template.dto";
import { SafetyInspectTemplateQueryDto } from "./dto/safety-inspect-template-query.dto";
import { UpdateSafetyInspectItemDto } from "./dto/update-safety-inspect-item.dto";
import { UpdateSafetyInspectTemplateDto } from "./dto/update-safety-inspect-template.dto";
import { SafetyInspectTemplatesService } from "./safety-inspect-templates.service";

@Controller("safety/inspect-templates")
@RequireModule("safety")
export class SafetyInspectTemplatesController {
  constructor(private readonly service: SafetyInspectTemplatesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: SafetyInspectTemplateQueryDto) {
    return this.service.list(scope, query, user);
  }

  @Get(":templateId/items")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_ITEM_READ)
  listItems(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("templateId") templateId: string) {
    return this.service.listItems(scope, templateId, user);
  }

  @Post(":templateId/items")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_ITEM_CREATE)
  @AuditLog({ module: "安全巡检", action: "新增检查项", resource: "biz.safety_inspect_item", bizType: "biz_safety_inspect_item" })
  createItem(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("templateId") templateId: string,
    @Body() dto: CreateSafetyInspectItemDto
  ) {
    return this.service.createItem(scope, user, templateId, dto);
  }

  @Put(":templateId/items/:itemId")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_ITEM_UPDATE)
  @AuditLog({ module: "安全巡检", action: "修改检查项", resource: "biz.safety_inspect_item", bizType: "biz_safety_inspect_item", bizIdParam: "itemId" })
  updateItem(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("templateId") templateId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateSafetyInspectItemDto
  ) {
    return this.service.updateItem(scope, user, templateId, itemId, dto);
  }

  @Delete(":templateId/items/:itemId")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_ITEM_DELETE)
  @AuditLog({ module: "安全巡检", action: "删除检查项", resource: "biz.safety_inspect_item", bizType: "biz_safety_inspect_item", bizIdParam: "itemId" })
  softDeleteItem(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("templateId") templateId: string,
    @Param("itemId") itemId: string
  ) {
    return this.service.softDeleteItem(scope, user, templateId, itemId);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_CREATE)
  @AuditLog({ module: "安全巡检", action: "新增模板", resource: "biz.safety_inspect_template", bizType: "biz_safety_inspect_template" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateSafetyInspectTemplateDto) {
    return this.service.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_UPDATE)
  @AuditLog({ module: "安全巡检", action: "修改模板", resource: "biz.safety_inspect_template", bizType: "biz_safety_inspect_template", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateSafetyInspectTemplateDto
  ) {
    return this.service.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TEMPLATE_DELETE)
  @AuditLog({ module: "安全巡检", action: "删除模板", resource: "biz.safety_inspect_template", bizType: "biz_safety_inspect_template", bizIdParam: "id" })
  softDelete(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.service.softDeleteTemplate(scope, user, id);
  }
}
