import {Body,Controller,Get,Param,ParseUUIDPipe,Post,Put,Query,UseInterceptors} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope} from "@jinhu/shared";
import {CurrentScope} from "../../shared/decorators/current-scope.decorator";
import {CurrentUser} from "../../shared/decorators/current-user.decorator";
import {RequireModule} from "../../shared/decorators/modules.decorator";
import {RequirePermissions} from "../../shared/decorators/permissions.decorator";
import {IdempotencyInterceptor} from "../../shared/interceptors/idempotency.interceptor";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {AuditLog} from "../audit/decorators/audit-log.decorator";
import {HrProbationActionDto,HrProbationListDto,HrProbationReviewDto,SaveHrProbationApplicationDto} from "./dto/hr-probation.dto";
import {HrProbationService} from "./hr-probation.service";

@Controller("hr/probation-applications") @RequireModule("hr")
export class HrProbationController {
 constructor(private readonly service:HrProbationService){}
 @Get() @RequirePermissions(HR_PERMISSIONS.HR_LIFECYCLE_READ) list(@CurrentScope()s:TenantParkScope,@Query()q:HrProbationListDto){return this.service.list(s,q);}
 @Post() @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN) @AuditLog({module:"人力资源管理",resource:"hr.probation_application",action:"创建转正申请",bizType:"hr_probation_application",captureBody:false}) create(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()d:SaveHrProbationApplicationDto){return this.service.create(s,a,d);}
 @Put(":id") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN) @AuditLog({module:"人力资源管理",resource:"hr.probation_application",action:"修改转正申请",bizType:"hr_probation_application",bizIdParam:"id",captureBody:false}) update(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:SaveHrProbationApplicationDto){return this.service.update(s,a,id,d);}
 @Post(":id/actions") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN) @AuditLog({module:"人力资源管理",resource:"hr.probation_application",action:"提交或取消转正申请",bizType:"hr_probation_application",bizIdParam:"id",captureBody:false}) act(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrProbationActionDto){return this.service.act(s,a,id,d);}
 @Post(":id/review") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_LIFECYCLE_REVIEW) @AuditLog({module:"人力资源管理",resource:"hr.probation_application",action:"审核转正申请",bizType:"hr_probation_application",bizIdParam:"id",captureBody:false}) review(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrProbationReviewDto){return this.service.review(s,a,id,d);}
 @Post(":id/confirm") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION) @AuditLog({module:"人力资源管理",resource:"hr.probation_application",action:"确认员工转正",bizType:"hr_probation_application",bizIdParam:"id",captureBody:false}) confirm(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.confirm(s,a,id);}
}
