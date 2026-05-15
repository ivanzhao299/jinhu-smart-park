import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { BuildingQueryDto } from "./dto/building-query.dto";
import { CreateBuildingDto } from "./dto/create-building.dto";
import { UpdateBuildingDto } from "./dto/update-building.dto";
import { BuildingsService } from "./buildings.service";

@Controller("buildings")
@RequireModule("asset")
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.BUILDING_READ)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: BuildingQueryDto) {
    return this.buildingsService.list(scope, query);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.BUILDING_READ)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.buildingsService.detail(scope, id);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.BUILDING_CREATE)
  @AuditLog({ module: "楼栋管理", resource: "biz.building", action: "新增", bizType: "biz_building" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateBuildingDto) {
    return this.buildingsService.create(scope, user.sub, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.BUILDING_UPDATE)
  @AuditLog({ module: "楼栋管理", resource: "biz.building", action: "修改", bizType: "biz_building", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateBuildingDto
  ) {
    return this.buildingsService.update(scope, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.BUILDING_DELETE)
  @AuditLog({ module: "楼栋管理", resource: "biz.building", action: "删除", bizType: "biz_building", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.buildingsService.softDelete(scope, user.sub, id);
  }
}
