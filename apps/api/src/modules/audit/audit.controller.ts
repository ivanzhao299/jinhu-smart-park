import { Controller, Get, Param, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { AuditService } from "./audit.service";
import { AuditQueryDto } from "./dto/audit-query.dto";

@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("login-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.AUDIT_READ)
  loginLogs(@CurrentScope() scope: TenantParkScope, @Query() query: AuditQueryDto) {
    return this.auditService.listLoginLogs(scope, query);
  }

  @Get("op-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.AUDIT_READ)
  opLogs(@CurrentScope() scope: TenantParkScope, @Query() query: AuditQueryDto) {
    return this.auditService.listOperationLogs(scope, query);
  }

  @Get("op-logs/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.AUDIT_READ)
  opLogDetail(@CurrentScope() scope: TenantParkScope, @Param("id") id: string) {
    return this.auditService.detailOperationLog(scope, id);
  }
}
