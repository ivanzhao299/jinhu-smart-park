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
import { HR_PERMISSIONS,SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireAnyPermissions } from "../../shared/decorators/permissions.decorator";
import { Public } from "../../shared/decorators/public.decorator";
import { SkipResponseWrap } from "../../shared/decorators/skip-response-wrap.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileQueryDto } from "./dto/file-query.dto";
import { UploadFileDto } from "./dto/upload-file.dto";
import { FilesService } from "./files.service";
import { type UploadedFilePayload } from "./files.service";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";

export function buildDownloadResponseHeaders(file: { mimeType: string; fileSize: string; originalName: string }) {
  const mimeType=/^[\w.+-]+\/[\w.+-]+$/u.test(file.mimeType)?file.mimeType:"application/octet-stream";
  const fileSize=/^\d+$/u.test(file.fileSize)?file.fileSize:"0";
  return {
    "Content-Type":mimeType,
    "Content-Length":fileSize,
    "Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  } as const;
}

const HR_FILE_READ_PERMISSIONS=[
  HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_READ,HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_TEAM_READ,HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_SELF_READ,
  HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_DOCUMENT_READ,HR_PERMISSIONS.HR_LIFECYCLE_DOCUMENT_READ,
  HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_READ,HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_TEAM_READ,HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_SELF_READ,
  HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_READ,HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ,HR_PERMISSIONS.HR_REWARD_DOCUMENT_READ,
] as const;
const HR_FILE_MANAGE_PERMISSIONS=[HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_MANAGE,HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_DOCUMENT_MANAGE,HR_PERMISSIONS.HR_LIFECYCLE_DOCUMENT_MANAGE,HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_MANAGE,HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_MANAGE,HR_PERMISSIONS.HR_TRAINING_DOCUMENT_MANAGE,HR_PERMISSIONS.HR_REWARD_DOCUMENT_MANAGE] as const;

@Controller("files")
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly cls: ClsService
  ) {}

  @Post()
  @RequireAnyPermissions(SYSTEM_PERMISSIONS.FILE_UPLOAD,...HR_FILE_MANAGE_PERMISSIONS)
  @AuditLog({ module: "附件中心", resource: "system.file", action: "附件上传", captureBody: false })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }),
    new IdempotencyInterceptor()
  )
  upload(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Body() dto: UploadFileDto,
    @UploadedFile() file?: UploadedFilePayload
  ) {
    return this.filesService.uploadForActor(scope, user, dto, file);
  }

  @Get()
  @RequireAnyPermissions(SYSTEM_PERMISSIONS.FILE_READ,...HR_FILE_READ_PERMISSIONS)
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Query() query: FileQueryDto
  ) {
    return this.filesService.list(scope, user, query);
  }

  @Public()
  @Get("public/brand-logos/:id")
  @SkipResponseWrap()
  @Header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
  async publicBrandLogo(@Param("id") id: string, @Res({ passthrough: true }) response: Response) {
    const result = await this.filesService.preparePublicBrandLogo(id);
    const stream=await this.filesService.openReadStream(result.absolutePath);
    response.setHeader("Content-Type", result.file.mimeType);
    response.setHeader("Content-Length", result.file.fileSize);
    response.setHeader("Content-Disposition", "inline");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(stream);
  }

  @Get(":id")
  @RequireAnyPermissions(SYSTEM_PERMISSIONS.FILE_READ,...HR_FILE_READ_PERMISSIONS)
  detail(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string
  ) {
    return this.filesService.detailForActor(scope, user, id);
  }

  @Get(":id/download")
  @RequireAnyPermissions(SYSTEM_PERMISSIONS.FILE_DOWNLOAD,...HR_FILE_READ_PERMISSIONS)
  @SkipResponseWrap()
  @Header("Cache-Control", "private, max-age=60")
  async download(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.filesService.prepareAuditedDownload(scope,user,id,this.cls.getId()??null);
    const stream=await this.filesService.openReadStream(result.absolutePath);
    const headers=buildDownloadResponseHeaders(result.file);
    response.setHeader("Content-Type",headers["Content-Type"]);
    response.setHeader("Content-Length",headers["Content-Length"]);
    response.setHeader("Content-Disposition",headers["Content-Disposition"]);
    return new StreamableFile(stream);
  }

  @Delete(":id")
  @RequireAnyPermissions(SYSTEM_PERMISSIONS.FILE_DELETE,...HR_FILE_MANAGE_PERMISSIONS)
  @AuditLog({ module: "附件中心", resource: "system.file", action: "附件删除", bizType: "file", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.filesService.softDeleteForActor(scope, user, id);
  }
}
