import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ClsService } from "nestjs-cls";
import type { Response } from "express";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { SkipResponseWrap } from "../../shared/decorators/skip-response-wrap.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileQueryDto } from "./dto/file-query.dto";
import { UploadFileDto } from "./dto/upload-file.dto";
import { FilesService } from "./files.service";
import { type UploadedFilePayload } from "./files.service";

@Controller("files")
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly cls: ClsService
  ) {}

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.FILE_UPLOAD)
  @AuditLog({ module: "附件中心", resource: "system.file", action: "附件上传", captureBody: true })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  upload(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Body() dto: UploadFileDto,
    @UploadedFile() file?: UploadedFilePayload
  ) {
    return this.filesService.upload(scope, user.sub, dto, file);
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.FILE_READ)
  list(@CurrentScope() scope: TenantParkScope, @Query() query: FileQueryDto) {
    return this.filesService.list(scope, query);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FILE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.filesService.detail(scope, id);
  }

  @Get(":id/download")
  @RequirePermissions(SYSTEM_PERMISSIONS.FILE_DOWNLOAD)
  @SkipResponseWrap()
  @Header("Cache-Control", "private, max-age=60")
  async download(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.filesService.prepareDownload(scope, id);
    await this.filesService.recordDownload(
      scope,
      { id: user.sub, username: user.username, realName: user.realName, roles: user.roles },
      result.file,
      this.cls.getId() ?? null
    );
    response.setHeader("Content-Type", result.file.mimeType);
    response.setHeader("Content-Length", result.file.fileSize);
    response.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(result.file.originalName)}"`);
    return new StreamableFile(this.filesService.createReadStream(result.absolutePath));
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.FILE_DELETE)
  @AuditLog({ module: "附件中心", resource: "system.file", action: "附件删除", bizType: "file", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.filesService.softDelete(scope, user.sub, id);
  }
}
