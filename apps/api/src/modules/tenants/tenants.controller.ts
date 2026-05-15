import { Controller, Get, Param, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { TenantsService } from "./tenants.service";

@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get("current")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_READ)
  current(@CurrentScope() scope: TenantParkScope) {
    return this.tenantsService.current(scope);
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_READ)
  list(@CurrentUser() user: JwtPrincipal, @Query() query: PaginationQueryDto) {
    return this.tenantsService.list(user, query);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANT_READ)
  detail(@CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.tenantsService.detail(user, id);
  }
}
