import { Controller, Get, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { PermissionsService } from "./permissions.service";

@Controller("permissions")
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_LIST)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.permissionsService.list(scope, query);
  }

  @Get("tree")
  @RequirePermissions(SYSTEM_PERMISSIONS.PERMISSION_TREE)
  tree(@CurrentScope() scope: TenantParkScope) {
    return this.permissionsService.tree(scope);
  }
}
