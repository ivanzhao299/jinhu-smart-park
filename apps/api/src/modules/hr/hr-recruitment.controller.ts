import { Body,Controller,Get,Param,ParseUUIDPipe,Post,Query,UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS,type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions,RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateHrCandidateDto,CreateHrRequisitionDto,HrCandidateConvertDto,HrCandidateStageDto,HrRecruitmentListDto } from "./dto/hr-recruitment.dto";
import { HrRecruitmentService } from "./hr-recruitment.service";
@Controller("hr/recruitment") @RequireModule("hr")
export class HrRecruitmentController {
 constructor(private readonly service:HrRecruitmentService){}
 @Get("requisitions") @RequireAnyPermissions(HR_PERMISSIONS.HR_REQUISITION_READ,HR_PERMISSIONS.HR_REQUISITION_TEAM_READ) listRequisitions(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrRecruitmentListDto){return this.service.listRequisitions(s,a,q);}
 @Post("requisitions") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_REQUISITION_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.requisition",action:"创建招聘需求",bizType:"hr_recruitment_requisition",captureBody:false}) createRequisition(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()d:CreateHrRequisitionDto){return this.service.createRequisition(s,a,d);}
 @Get("candidates") @RequirePermissions(HR_PERMISSIONS.HR_CANDIDATE_READ) listCandidates(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrRecruitmentListDto){return this.service.listCandidates(s,a,q);}
 @Get("candidates/:id") @RequirePermissions(HR_PERMISSIONS.HR_CANDIDATE_READ,HR_PERMISSIONS.HR_CANDIDATE_SENSITIVE_READ) candidateDetail(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.candidateDetail(s,a,id);}
 @Post("candidates") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_CANDIDATE_MANAGE) @AuditLog({module:"人力资源管理",resource:"hr.candidate",action:"创建候选人",bizType:"hr_candidate",captureBody:false}) createCandidate(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()d:CreateHrCandidateDto){return this.service.createCandidate(s,a,d);}
 @Post("candidates/:id/stage-actions") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_CANDIDATE_STAGE) @AuditLog({module:"人力资源管理",resource:"hr.candidate_stage",action:"办理候选人阶段",bizType:"hr_candidate",bizIdParam:"id",captureBody:false}) move(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrCandidateStageDto){return this.service.moveCandidate(s,a,id,d);}
 @Post("candidates/:id/convert") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_CANDIDATE_CONVERT) @AuditLog({module:"人力资源管理",resource:"hr.candidate_conversion",action:"候选人转预入职",bizType:"hr_candidate",bizIdParam:"id",captureBody:false}) convert(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrCandidateConvertDto){return this.service.convert(s,a,id,d);}
}
