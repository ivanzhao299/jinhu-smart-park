import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import {
  RequireAnyPermissions,
  RequirePermissions,
} from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  CreateHrEmployeeRecordDto,
  CreateHrLifecycleChecklistDto,
  CreateHrLifecycleTemplateDto,
  CreateHrLifecycleTemplateVersionDto,
  HrLifecycleItemActionDto,
  HrLifecycleListDto,
} from "./dto/hr-lifecycle.dto";
import { HrLifecycleService } from "./hr-lifecycle.service";
@Controller("hr")
@RequireModule("hr")
export class HrLifecycleController {
  constructor(private readonly service: HrLifecycleService) {}
  @Get("lifecycle/checklists")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_LIFECYCLE_READ,
    HR_PERMISSIONS.HR_LIFECYCLE_TEAM_READ,
    HR_PERMISSIONS.HR_LIFECYCLE_SELF_READ,
  )
  list(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Query() q: HrLifecycleListDto,
  ) {
    return this.service.list(s, a, q);
  }
  @Get("lifecycle/templates")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_LIFECYCLE_READ,
    HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE,
  )
  listTemplates(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
  ) {
    return this.service.listTemplates(s, a);
  }
  @Get("lifecycle/checklists/:id")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_LIFECYCLE_READ,
    HR_PERMISSIONS.HR_LIFECYCLE_TEAM_READ,
    HR_PERMISSIONS.HR_LIFECYCLE_SELF_READ,
  )
  detail(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(s, a, id);
  }
  @Post("lifecycle/templates")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.lifecycle_template",
    action: "发布生命周期模板",
    bizType: "hr_lifecycle_template",
    captureBody: false,
  })
  createTemplate(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrLifecycleTemplateDto,
  ) {
    return this.service.createTemplate(s, a, d);
  }
  @Post("lifecycle/templates/:id/versions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.lifecycle_template_version",
    action: "发布生命周期模板版本",
    bizType: "hr_lifecycle_template",
    bizIdParam: "id",
    captureBody: false,
  })
  publishTemplateVersion(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() d: CreateHrLifecycleTemplateVersionDto,
  ) {
    return this.service.publishTemplateVersion(s, a, id, d);
  }
  @Post("lifecycle/checklists")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.lifecycle_checklist",
    action: "创建生命周期清单",
    bizType: "hr_lifecycle_checklist",
    captureBody: false,
  })
  create(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Body() d: CreateHrLifecycleChecklistDto,
  ) {
    return this.service.createChecklist(s, a, d);
  }
  @Post("lifecycle/checklists/:checklistId/items/:itemId/actions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_LIFECYCLE_SELF_ACTION,
    HR_PERMISSIONS.HR_LIFECYCLE_REVIEW,
    HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN,
  )
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.lifecycle_item",
    action: "办理生命周期任务",
    bizType: "hr_lifecycle_checklist_item",
    bizIdParam: "itemId",
    captureBody: false,
  })
  act(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("checklistId", new ParseUUIDPipe()) checklistId: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() d: HrLifecycleItemActionDto,
  ) {
    return this.service.act(s, a, checklistId, itemId, d);
  }
  @Post("lifecycle/overdue-reminders")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN,
    HR_PERMISSIONS.HR_LIFECYCLE_REVIEW,
  )
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.lifecycle_overdue",
    action: "生成生命周期逾期提醒",
    bizType: "hr_lifecycle_checklist",
    captureBody: false,
  })
  remindOverdue(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
  ) {
    return this.service.sendOverdueReminders(s, a);
  }
  @Get("employees/:employeeId/records")
  @RequireAnyPermissions(
    HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ,
    HR_PERMISSIONS.HR_EMPLOYEE_RECORD_TEAM_READ,
    HR_PERMISSIONS.HR_EMPLOYEE_RECORD_SELF_READ,
  )
  records(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("employeeId", new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.service.listRecords(s, a, employeeId);
  }
  @Post("employees/:employeeId/records")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE)
  @AuditLog({
    module: "人力资源管理",
    resource: "hr.employee_record",
    action: "新增员工扩展档案",
    bizType: "hr_employee",
    bizIdParam: "employeeId",
    captureBody: false,
  })
  addRecord(
    @CurrentScope() s: TenantParkScope,
    @CurrentUser() a: JwtPrincipal,
    @Param("employeeId", new ParseUUIDPipe()) employeeId: string,
    @Body() d: CreateHrEmployeeRecordDto,
  ) {
    return this.service.createRecord(s, a, employeeId, d);
  }
}
