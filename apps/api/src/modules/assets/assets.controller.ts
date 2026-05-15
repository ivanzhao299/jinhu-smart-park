import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { UnitsService } from "../units/units.service";
import { AssetStatisticsQueryDto } from "./dto/asset-statistics-query.dto";
import { AssetQueryDto } from "./dto/asset-query.dto";
import { CreateAssetBuildingDto } from "./dto/create-asset-building.dto";
import { CreateAssetFloorDto } from "./dto/create-asset-floor.dto";
import { CreateAssetParkDto } from "./dto/create-asset-park.dto";
import { CreateAssetUnitDto } from "./dto/create-asset-unit.dto";
import { UpdateAssetBuildingDto } from "./dto/update-asset-building.dto";
import { UpdateAssetFloorDto } from "./dto/update-asset-floor.dto";
import { UpdateAssetParkDto } from "./dto/update-asset-park.dto";
import { UpdateAssetUnitDto } from "./dto/update-asset-unit.dto";
import { UnitStatusBoardQueryDto } from "./dto/unit-status-board-query.dto";
import { AssetsService } from "./assets.service";

@Controller("assets")
@RequireModule("asset")
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly unitsService: UnitsService
  ) {}

  @Get("statistics")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_READ, SYSTEM_PERMISSIONS.ASSET_STATISTICS)
  statistics(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: AssetStatisticsQueryDto) {
    return this.unitsService.assetStatistics(scope, query, user);
  }

  @Get("unit-status-board")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_STATUS_BOARD, SYSTEM_PERMISSIONS.UNIT_READ)
  unitStatusBoard(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: UnitStatusBoardQueryDto) {
    return this.unitsService.unitStatusBoard(scope, query, user);
  }

  @Get("parks")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_PARK_LIST)
  listParks(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: AssetQueryDto) {
    return this.assetsService.listParks(scope, query, user);
  }

  @Post("parks")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_PARK_CREATE)
  @AuditLog({ module: "园区管理", resource: "asset.park", action: "新增", bizType: "asset_park" })
  createPark(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateAssetParkDto) {
    return this.assetsService.createPark(scope, user.sub, dto);
  }

  @Get("parks/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_PARK_DETAIL)
  detailPark(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.assetsService.detailPark(scope, id, user);
  }

  @Patch("parks/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_PARK_UPDATE)
  @AuditLog({ module: "园区管理", resource: "asset.park", action: "修改", bizType: "asset_park", bizIdParam: "id" })
  updatePark(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateAssetParkDto
  ) {
    return this.assetsService.updatePark(scope, user, id, dto);
  }

  @Delete("parks/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_PARK_DELETE)
  @AuditLog({ module: "园区管理", resource: "asset.park", action: "删除", bizType: "asset_park", bizIdParam: "id" })
  deletePark(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.assetsService.deletePark(scope, user, id);
  }

  @Get("buildings")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_BUILDING_LIST)
  listBuildings(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: AssetQueryDto) {
    return this.assetsService.listBuildings(scope, query, user);
  }

  @Post("buildings")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_BUILDING_CREATE)
  @AuditLog({ module: "楼栋管理", resource: "asset.building", action: "新增", bizType: "asset_building" })
  createBuilding(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateAssetBuildingDto) {
    return this.assetsService.createBuilding(scope, user.sub, dto);
  }

  @Get("buildings/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_BUILDING_DETAIL)
  detailBuilding(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.assetsService.detailBuilding(scope, id, user);
  }

  @Patch("buildings/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_BUILDING_UPDATE)
  @AuditLog({ module: "楼栋管理", resource: "asset.building", action: "修改", bizType: "asset_building", bizIdParam: "id" })
  updateBuilding(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateAssetBuildingDto
  ) {
    return this.assetsService.updateBuilding(scope, user, id, dto);
  }

  @Delete("buildings/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_BUILDING_DELETE)
  @AuditLog({ module: "楼栋管理", resource: "asset.building", action: "删除", bizType: "asset_building", bizIdParam: "id" })
  deleteBuilding(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.assetsService.deleteBuilding(scope, user, id);
  }

  @Get("floors")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_FLOOR_LIST)
  listFloors(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: AssetQueryDto) {
    return this.assetsService.listFloors(scope, query, user);
  }

  @Post("floors")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_FLOOR_CREATE)
  @AuditLog({ module: "楼层管理", resource: "asset.floor", action: "新增", bizType: "asset_floor" })
  createFloor(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateAssetFloorDto) {
    return this.assetsService.createFloor(scope, user.sub, dto);
  }

  @Get("floors/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_FLOOR_DETAIL)
  detailFloor(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.assetsService.detailFloor(scope, id, user);
  }

  @Patch("floors/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_FLOOR_UPDATE)
  @AuditLog({ module: "楼层管理", resource: "asset.floor", action: "修改", bizType: "asset_floor", bizIdParam: "id" })
  updateFloor(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateAssetFloorDto
  ) {
    return this.assetsService.updateFloor(scope, user, id, dto);
  }

  @Delete("floors/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_FLOOR_DELETE)
  @AuditLog({ module: "楼层管理", resource: "asset.floor", action: "删除", bizType: "asset_floor", bizIdParam: "id" })
  deleteFloor(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.assetsService.deleteFloor(scope, user, id);
  }

  @Get("units")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_UNIT_LIST)
  listUnits(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: AssetQueryDto) {
    return this.assetsService.listUnits(scope, query, user);
  }

  @Post("units")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_UNIT_CREATE)
  @AuditLog({ module: "房源管理", resource: "asset.unit", action: "新增", bizType: "asset_unit" })
  createUnit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateAssetUnitDto) {
    return this.assetsService.createUnit(scope, user.sub, dto);
  }

  @Get("units/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_UNIT_DETAIL)
  detailUnit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.assetsService.detailUnit(scope, id, user);
  }

  @Patch("units/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_UNIT_UPDATE)
  @AuditLog({ module: "房源管理", resource: "asset.unit", action: "修改", bizType: "asset_unit", bizIdParam: "id" })
  updateUnit(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateAssetUnitDto
  ) {
    return this.assetsService.updateUnit(scope, user, id, dto);
  }

  @Delete("units/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_UNIT_DELETE)
  @AuditLog({ module: "房源管理", resource: "asset.unit", action: "删除", bizType: "asset_unit", bizIdParam: "id" })
  deleteUnit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.assetsService.deleteUnit(scope, user, id);
  }
}
