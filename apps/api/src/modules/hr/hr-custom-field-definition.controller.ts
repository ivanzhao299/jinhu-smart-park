import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { HrCustomFieldDefinitionQueryDto, ReviewHrCustomFieldDefinitionDto } from "./dto/hr-custom-field-definition.dto";
import { HrCustomFieldDefinitionService } from "./hr-custom-field-definition.service";

@Controller("hr/custom-field-definitions")
@RequireModule("hr")
export class HrCustomFieldDefinitionController {
  constructor(private readonly service: HrCustomFieldDefinitionService) {}

  @Get("legacy")
  @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)
  legacyDefinitions(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: HrCustomFieldDefinitionQueryDto) {
    return this.service.list(scope, actor, query);
  }

  @Put("legacy/:id/review")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)
  @AuditLog({ module: "人力资源管理", resource: "hr.custom_field_definition", action: "复核玉舟自定义字段元数据", bizType: "hr_custom_field_definition", bizIdParam: "id", captureBody: false })
  reviewDefinition(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewHrCustomFieldDefinitionDto
  ) {
    return this.service.review(scope, actor, id, dto);
  }
}
