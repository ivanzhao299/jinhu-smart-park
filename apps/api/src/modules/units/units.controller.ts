import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { SkipResponseWrap } from "../../shared/decorators/skip-response-wrap.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import type { UploadedFilePayload } from "../files/files.service";
import { CreateUnitDto } from "./dto/create-unit.dto";
import { TransitionUnitStatusDto } from "./dto/transition-unit-status.dto";
import { UnitExportDto } from "./dto/unit-export.dto";
import { UnitStatusLogQueryDto } from "./dto/unit-status-log-query.dto";
import { UnitQueryDto } from "./dto/unit-query.dto";
import { UpdateUnitDto } from "./dto/update-unit.dto";
import { UnitsService } from "./units.service";

@Controller("park-units")
@RequireModule("asset")
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: UnitQueryDto) {
    return this.unitsService.list(scope, query, user);
  }

  @Get("statistics")
  @RequirePermissions(SYSTEM_PERMISSIONS.ASSET_STATISTICS_READ)
  statistics(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.unitsService.statistics(scope, user);
  }

  @Get("import-template")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_IMPORT_TEMPLATE)
  @SkipResponseWrap()
  @Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @Header("Content-Disposition", "attachment; filename=\"unit-import-template.xlsx\"")
  importTemplate() {
    return new StreamableFile(this.unitsService.getImportTemplate());
  }

  @Get("export")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_EXPORT)
  @SkipResponseWrap()
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Query() query: UnitQueryDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const csv = await this.unitsService.exportCsv(scope, query, user);
    await this.unitsService.recordExport(scope, { id: user.sub, username: user.username, realName: user.realName, roles: user.roles });
    response.setHeader("Content-Disposition", `attachment; filename="park-units-${Date.now()}.csv"`);
    return new StreamableFile(Buffer.from(`\uFEFF${csv}`, "utf8"));
  }

  @Post("export")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_EXPORT)
  @AuditLog({ module: "房源管理", resource: "biz.unit", action: "数据导出", bizType: "biz_unit" })
  @SkipResponseWrap()
  @Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  async exportExcel(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Body() dto: UnitExportDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const buffer = await this.unitsService.exportExcel(scope, dto, user);
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`金湖房源台账_${Date.now()}.xlsx`)}`);
    return new StreamableFile(buffer);
  }

  @Post("import")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_IMPORT)
  @AuditLog({ module: "房源管理", resource: "biz.unit", action: "批量导入", bizType: "biz_unit", captureBody: false })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  importExcel(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @UploadedFile() file?: UploadedFilePayload
  ) {
    return this.unitsService.importExcel(scope, user.sub, file);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.unitsService.detail(scope, id, user);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_CREATE)
  @AuditLog({ module: "房源管理", resource: "biz.unit", action: "新增", bizType: "biz_unit" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateUnitDto) {
    return this.unitsService.create(scope, user.sub, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_UPDATE)
  @AuditLog({ module: "房源管理", resource: "biz.unit", action: "修改", bizType: "biz_unit", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateUnitDto
  ) {
    return this.unitsService.update(scope, user, id, dto);
  }

  @Post(":id/photos")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_UPDATE)
  @AuditLog({ module: "房源管理", resource: "biz.unit", action: "上传照片", bizType: "biz_unit", bizIdParam: "id" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadPhoto(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body("remark") remark: string | undefined,
    @UploadedFile() file?: UploadedFilePayload
  ) {
    return this.unitsService.uploadPhoto(scope, user, id, file, remark);
  }

  @Post(":id/floorplan")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_UPDATE)
  @AuditLog({ module: "房源管理", resource: "biz.unit", action: "上传平面图", bizType: "biz_unit", bizIdParam: "id" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadFloorplan(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body("remark") remark: string | undefined,
    @UploadedFile() file?: UploadedFilePayload
  ) {
    return this.unitsService.uploadFloorplan(scope, user, id, file, remark);
  }

  @Post(":id/change-status")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_CHANGE_STATUS)
  @AuditLog({ module: "房源管理", resource: "biz.unit", action: "状态流转", bizType: "biz_unit", bizIdParam: "id" })
  changeStatus(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: TransitionUnitStatusDto
  ) {
    return this.unitsService.changeStatus(scope, user, id, dto);
  }

  @Get(":id/status-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_STATUS_LOG)
  statusLogs(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Query() query: UnitStatusLogQueryDto) {
    return this.unitsService.listStatusLogs(scope, user, id, query);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.UNIT_DELETE)
  @AuditLog({ module: "房源管理", resource: "biz.unit", action: "删除", bizType: "biz_unit", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.unitsService.softDelete(scope, user, id);
  }
}
