import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreateParkDto } from "./dto/create-park.dto";
import { ParkQueryDto } from "./dto/park-query.dto";
import { UpdateParkDto } from "./dto/update-park.dto";
import { ParksService } from "./parks.service";

@Controller("parks")
@RequireModule("asset")
export class ParksController {
  constructor(private readonly parksService: ParksService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: ParkQueryDto) {
    return this.parksService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.parksService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_CREATE)
  @AuditLog({ module: "园区管理", resource: "biz.park", action: "新增", bizType: "biz_park" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateParkDto) {
    return this.parksService.create(scope, user.sub, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_UPDATE)
  @AuditLog({ module: "园区管理", resource: "biz.park", action: "修改", bizType: "biz_park", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateParkDto
  ) {
    return this.parksService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARK_DELETE)
  @AuditLog({ module: "园区管理", resource: "biz.park", action: "删除", bizType: "biz_park", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.parksService.softDelete(scope, user, id);
  }
}
