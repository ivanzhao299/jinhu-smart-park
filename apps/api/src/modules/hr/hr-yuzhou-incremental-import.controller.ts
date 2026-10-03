import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";

@Controller("hr/imports/yuzhou/incremental") @RequireModule("hr")
export class HrYuzhouIncrementalImportController {
  constructor(private readonly service: HrYuzhouIncrementalImportService) {}

  @Post("preview") @UseInterceptors(new IdempotencyInterceptor()) @RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_MANAGE, HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE, HR_PERMISSIONS.HR_CONTRACT_MANAGE)
  @AuditLog({ module: "人力资源管理", resource: "hr.incremental_import", action: "预览玉舟增量导入", bizType: "hr_incremental_import", captureBody: false })
  preview(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: PreviewYuzhouIncrementalImportDto) { return this.service.preview(scope, actor, dto); }

  @Post(":id/commit") @UseInterceptors(new IdempotencyInterceptor()) @RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_MANAGE, HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE, HR_PERMISSIONS.HR_CONTRACT_MANAGE)
  @AuditLog({ module: "人力资源管理", resource: "hr.incremental_import", action: "提交玉舟增量导入", bizType: "hr_incremental_import", bizIdParam: "id", captureBody: false })
  commit(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string) { return this.service.commit(scope, actor, id); }

  @Get(":id") @RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ, HR_PERMISSIONS.HR_CONTRACT_READ)
  status(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string) { return this.service.status(scope, actor, id); }
}
