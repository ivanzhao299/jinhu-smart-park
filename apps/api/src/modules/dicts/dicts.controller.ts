import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreateDictItemDto } from "./dto/create-dict-item.dto";
import { CreateDictTypeDto } from "./dto/create-dict-type.dto";
import { UpdateDictItemDto } from "./dto/update-dict-item.dto";
import { UpdateDictTypeDto } from "./dto/update-dict-type.dto";
import { DictsService } from "./dicts.service";

@Controller()
export class DictsController {
  constructor(private readonly dictsService: DictsService) {}

  @Get("dict-types")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_TYPE_LIST)
  listTypes(@CurrentScope() scope: TenantParkScope, @Query() query: PaginationQueryDto) {
    return this.dictsService.listTypes(scope, query);
  }

  @Post("dict-types")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_TYPE_CREATE)
  @AuditLog({ module: "字典管理", resource: "system.dict-type", action: "新增", bizType: "dict_type" })
  createType(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateDictTypeDto) {
    return this.dictsService.createType(scope, user.sub, dto);
  }

  @Get("dict-types/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_TYPE_DETAIL)
  detailType(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.dictsService.detailType(scope, id);
  }

  @Patch("dict-types/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_TYPE_UPDATE)
  @AuditLog({ module: "字典管理", resource: "system.dict-type", action: "修改", bizType: "dict_type", bizIdParam: "id" })
  updateType(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateDictTypeDto
  ) {
    return this.dictsService.updateType(scope, user.sub, id, dto);
  }

  @Delete("dict-types/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_TYPE_DELETE)
  @AuditLog({ module: "字典管理", resource: "system.dict-type", action: "停用", bizType: "dict_type", bizIdParam: "id" })
  deleteType(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.dictsService.deleteType(scope, user.sub, id);
  }

  @Get("dict-items")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_ITEM_LIST)
  listItems(
    @CurrentScope() scope: TenantParkScope,
    @Query() query: PaginationQueryDto,
    @Query("dict_type_id") dictTypeId?: string
  ) {
    return this.dictsService.listItems(scope, query, dictTypeId);
  }

  @Post("dict-items")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_ITEM_CREATE)
  @AuditLog({ module: "字典管理", resource: "system.dict-item", action: "新增", bizType: "dict_item" })
  createItem(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateDictItemDto) {
    return this.dictsService.createItem(scope, user.sub, dto);
  }

  @Get("dict-items/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_ITEM_DETAIL)
  detailItem(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.dictsService.detailItem(scope, id);
  }

  @Patch("dict-items/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_ITEM_UPDATE)
  @AuditLog({ module: "字典管理", resource: "system.dict-item", action: "修改", bizType: "dict_item", bizIdParam: "id" })
  updateItem(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateDictItemDto
  ) {
    return this.dictsService.updateItem(scope, user.sub, id, dto);
  }

  @Delete("dict-items/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.DICT_ITEM_DELETE)
  @AuditLog({ module: "字典管理", resource: "system.dict-item", action: "停用", bizType: "dict_item", bizIdParam: "id" })
  deleteItem(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.dictsService.deleteItem(scope, user.sub, id);
  }
}
