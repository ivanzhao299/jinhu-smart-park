import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { UpdateHrCustomValueDto } from "./dto/hr-custom-value.dto";
import { HrService } from "./hr.service";
import { HrCustomValueService } from "./hr-custom-value.service";

@Controller("hr/employees/:id/custom-fields")
@RequireModule("hr")
export class HrCustomValueController {
  constructor(private readonly service: HrCustomValueService, private readonly hr: HrService) {}

  @Get()
  @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.hr.employeeCustomValues(scope, actor, id);
  }

  @Put(":definitionId")
  @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)
  @UseInterceptors(new IdempotencyInterceptor())
  @AuditLog({ module: "人力资源管理", resource: "hr.employee_custom_value", action: "维护员工扩展档案", bizType: "hr_employee", bizIdParam: "id", captureBody: false })
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("definitionId", new ParseUUIDPipe()) definitionId: string,
    @Body() dto: UpdateHrCustomValueDto) {
    return this.service.update(scope, actor, id, definitionId, dto);
  }
}
