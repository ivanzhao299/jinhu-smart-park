import { Body,Controller,Get,Param,ParseUUIDPipe,Post,Put,Query,UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS,type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { HrOnboardingActionDto,HrOnboardingListDto,HrOnboardingReviewDto,SaveHrOnboardingApplicationDto } from "./dto/hr-onboarding.dto";
import { HrOnboardingService } from "./hr-onboarding.service";

@Controller("hr/onboarding-applications") @RequireModule("hr")
export class HrOnboardingController {
 constructor(private readonly service:HrOnboardingService){}
 @Get() @RequirePermissions(HR_PERMISSIONS.HR_ONBOARDING_READ) list(@CurrentScope()s:TenantParkScope,@Query()q:HrOnboardingListDto){return this.service.list(s,q);}
 @Post() @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_ONBOARDING_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.onboarding_application",action:"创建入职申请",bizType:"hr_onboarding_application",captureBody:false}) create(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()d:SaveHrOnboardingApplicationDto){return this.service.create(s,a,d);}
 @Put(":id") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_ONBOARDING_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.onboarding_application",action:"修改入职申请",bizType:"hr_onboarding_application",bizIdParam:"id",captureBody:false}) update(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:SaveHrOnboardingApplicationDto){return this.service.update(s,a,id,d);}
 @Post(":id/actions") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_ONBOARDING_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.onboarding_application",action:"提交或取消入职申请",bizType:"hr_onboarding_application",bizIdParam:"id",captureBody:false}) act(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrOnboardingActionDto){return this.service.act(s,a,id,d);}
 @Post(":id/review") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW) @AuditLog({module:"人力资源管理",resource:"hr.onboarding_application",action:"审核入职申请",bizType:"hr_onboarding_application",bizIdParam:"id",captureBody:false}) review(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrOnboardingReviewDto){return this.service.review(s,a,id,d);}
 @Post(":id/confirm") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION) @AuditLog({module:"人力资源管理",resource:"hr.onboarding_application",action:"确认员工入职",bizType:"hr_onboarding_application",bizIdParam:"id",captureBody:false}) confirm(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.confirm(s,a,id);}
}
