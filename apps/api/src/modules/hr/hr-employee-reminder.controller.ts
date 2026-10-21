import { Body,Controller,Get,Param,ParseUUIDPipe,Post,Query,UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS,type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions,RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { HrEmployeeReminderActionDto,HrEmployeeReminderGenerateDto,HrEmployeeReminderQueryDto } from "./dto/hr-employee-reminder.dto";
import { HrEmployeeReminderService } from "./hr-employee-reminder.service";
import { WorkflowMessageQueryDto } from "../workflow/dto/workflow-message-query.dto";
@Controller("hr/employee-reminders") @RequireModule("hr")
export class HrEmployeeReminderController {
 constructor(private readonly service:HrEmployeeReminderService){}
 @Get() @RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_PARK_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_TEAM_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_SELF_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE) list(@CurrentScope() s:TenantParkScope,@CurrentUser() a:JwtPrincipal,@Query() q:HrEmployeeReminderQueryDto){return this.service.list(s,a,q);}
 @Get("messages") @RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_PARK_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_TEAM_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_SELF_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE) messages(@CurrentScope() s:TenantParkScope,@CurrentUser() a:JwtPrincipal,@Query() q:WorkflowMessageQueryDto){return this.service.messagesForActor(s,a,q);}
 @Post("messages/:id/read") @UseInterceptors(new IdempotencyInterceptor()) @RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_PARK_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_TEAM_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_SELF_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE) readMessage(@CurrentScope() s:TenantParkScope,@CurrentUser() a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.markMessageRead(s,a,id);}
 @Get(":id") @RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_PARK_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_TEAM_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_SELF_READ,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE) detail(@CurrentScope() s:TenantParkScope,@CurrentUser() a:JwtPrincipal,@Param("id",new ParseUUIDPipe()) id:string){return this.service.detail(s,a,id);}
 @Post("preview") @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_RUN) preview(@CurrentScope() s:TenantParkScope,@CurrentUser() a:JwtPrincipal,@Body() d:HrEmployeeReminderGenerateDto){return this.service.preview(s,a,d);}
 @Post("generate") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_RUN) @AuditLog({module:"人力资源管理",resource:"hr.employee_reminder",action:"生成员工重要日期提醒",bizType:"hr_employee_reminder",captureBody:false}) generate(@CurrentScope() s:TenantParkScope,@CurrentUser() a:JwtPrincipal,@Body() d:HrEmployeeReminderGenerateDto){return this.service.generate(s,a,d);}
 @Post(":id/actions") @UseInterceptors(new IdempotencyInterceptor()) @RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_ACK,HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.employee_reminder",action:"办理员工重要日期提醒",bizType:"hr_employee_reminder",bizIdParam:"id",captureBody:false}) action(@CurrentScope() s:TenantParkScope,@CurrentUser() a:JwtPrincipal,@Param("id",new ParseUUIDPipe()) id:string,@Body() d:HrEmployeeReminderActionDto){return this.service.action(s,a,id,d);}
}
