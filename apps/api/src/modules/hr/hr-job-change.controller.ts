import { Body,Controller,Get,Param,ParseUUIDPipe,Post,Put,Query,UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS,type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions,RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { HrJobChangeActionDto,HrJobChangeListDto,HrJobChangeReviewDto,SaveHrJobChangeDto } from "./dto/hr-job-change.dto";
import { HrJobChangeService } from "./hr-job-change.service";

@Controller("hr/job-change-applications") @RequireModule("hr")
export class HrJobChangeController {
 constructor(private readonly service:HrJobChangeService){}
 @Get() @RequireAnyPermissions(HR_PERMISSIONS.HR_JOB_CHANGE_READ,HR_PERMISSIONS.HR_JOB_CHANGE_TEAM_READ,HR_PERMISSIONS.HR_JOB_CHANGE_SELF_READ) list(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrJobChangeListDto){return this.service.list(s,a,q);}
 @Get("options") @RequirePermissions(HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE) options(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal){return this.service.options(s,a);}
 @Post() @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.job_change_application",action:"创建岗位变更申请",bizType:"hr_job_change_application",captureBody:false}) create(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()d:SaveHrJobChangeDto){return this.service.create(s,a,d);}
 @Put(":id") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.job_change_application",action:"修改岗位变更申请",bizType:"hr_job_change_application",bizIdParam:"id",captureBody:false}) update(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:SaveHrJobChangeDto){return this.service.update(s,a,id,d);}
 @Post(":id/actions") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.job_change_application",action:"提交或取消岗位变更申请",bizType:"hr_job_change_application",bizIdParam:"id",captureBody:false}) act(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrJobChangeActionDto){return this.service.act(s,a,id,d);}
 @Post(":id/review") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_JOB_CHANGE_REVIEW) @AuditLog({module:"人力资源管理",resource:"hr.job_change_application",action:"审核岗位变更申请",bizType:"hr_job_change_application",bizIdParam:"id",captureBody:false}) review(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrJobChangeReviewDto){return this.service.review(s,a,id,d);}
 @Post(":id/apply") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_JOB_CHANGE_APPLY) @AuditLog({module:"人力资源管理",resource:"hr.job_change_application",action:"生效岗位变更",bizType:"hr_job_change_application",bizIdParam:"id",captureBody:false}) apply(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.apply(s,a,id);}
}
