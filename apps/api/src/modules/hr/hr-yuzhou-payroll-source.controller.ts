import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { PreviewYuzhouPayrollSourceDto, YuzhouPayrollSourceHeadQueryDto } from "./dto/yuzhou-payroll-source.dto";
import { HrYuzhouPayrollSourceService } from "./hr-yuzhou-payroll-source.service";
@Controller("hr/imports/yuzhou/payroll") @RequireModule("hr")
export class HrYuzhouPayrollSourceController {
  constructor(private readonly service:HrYuzhouPayrollSourceService) {}
  @Post("preview") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ)
  @AuditLog({module:"人力资源管理",resource:"hr.yuzhou_payroll_source",action:"预览玉舟完整工资月来源",bizType:"hr_yuzhou_payroll_source",captureBody:false})
  preview(@CurrentScope() scope:TenantParkScope,@CurrentUser() actor:JwtPrincipal,@Body() dto:PreviewYuzhouPayrollSourceDto){return this.service.preview(scope,actor,dto.package);}
  @Post(":id/commit") @UseInterceptors(new IdempotencyInterceptor()) @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ)
  @AuditLog({module:"人力资源管理",resource:"hr.yuzhou_payroll_source",action:"提交玉舟完整工资月来源",bizType:"hr_yuzhou_payroll_source",bizIdParam:"id",captureBody:false})
  commit(@CurrentScope() scope:TenantParkScope,@CurrentUser() actor:JwtPrincipal,@Param("id",new ParseUUIDPipe()) id:string){return this.service.commit(scope,actor,id);}
  @Get("head") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ)
  head(@CurrentScope() scope:TenantParkScope,@CurrentUser() actor:JwtPrincipal,@Query() query:YuzhouPayrollSourceHeadQueryDto){return this.service.head(scope,actor,query);}
  @Get(":id") @RequirePermissions(HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ)
  status(@CurrentScope() scope:TenantParkScope,@CurrentUser() actor:JwtPrincipal,@Param("id",new ParseUUIDPipe()) id:string){return this.service.status(scope,actor,id);}
}
