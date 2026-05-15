import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreateOrgDto } from "./dto/create-org.dto";
import { UpdateOrgDto } from "./dto/update-org.dto";
import { OrgsService } from "./orgs.service";

@Controller("orgs")
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ORG_LIST)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: PaginationQueryDto) {
    return this.orgsService.list(scope, query, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ORG_CREATE)
  @AuditLog({ module: "组织管理", resource: "system.org", action: "新增", bizType: "org" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateOrgDto) {
    return this.orgsService.create(scope, user.sub, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ORG_DETAIL)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.orgsService.detail(scope, id);
  }

  @Patch(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ORG_UPDATE)
  @AuditLog({ module: "组织管理", resource: "system.org", action: "修改", bizType: "org", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateOrgDto
  ) {
    return this.orgsService.update(scope, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ORG_DELETE)
  @AuditLog({ module: "组织管理", resource: "system.org", action: "删除", bizType: "org", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.orgsService.softDelete(scope, user.sub, id);
  }
}
