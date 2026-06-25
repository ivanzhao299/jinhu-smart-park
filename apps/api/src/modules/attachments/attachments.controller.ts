import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AttachmentsService } from "./attachments.service";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";
import { ListAttachmentsDto } from "./dto/list-attachments.dto";

@Controller("attachments")
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ATTACHMENT_LIST)
  list(
    @CurrentScope() scope: TenantParkScope,
    @Query() query: ListAttachmentsDto
  ) {
    return this.attachmentsService.list(scope, query, query.biz_type, query.biz_id);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ATTACHMENT_CREATE)
  @AuditLog({ module: "附件中心", resource: "system.attachment", action: "新增", bizType: "attachment" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateAttachmentDto) {
    return this.attachmentsService.create(scope, user.sub, dto);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ATTACHMENT_DETAIL)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.attachmentsService.detail(scope, id);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.ATTACHMENT_DELETE)
  @AuditLog({ module: "附件中心", resource: "system.attachment", action: "删除", bizType: "attachment", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.attachmentsService.softDelete(scope, user.sub, id);
  }
}
