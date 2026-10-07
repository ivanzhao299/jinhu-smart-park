import { Controller, Get, Param, ParseIntPipe, Post, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { HrPreparedProfileBatchService } from "./hr-prepared-profile-batch.service";

@Controller("hr/imports/yuzhou/prepared-profile") @RequireModule("hr")
@RequireAnyPermissions(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)
export class HrPreparedProfileBatchController {
  constructor(private readonly service: HrPreparedProfileBatchService) {}
  @Get()
  list(@CurrentScope() scope:TenantParkScope,@CurrentUser() actor:JwtPrincipal) { return this.service.list(scope,actor); }
  @Post(":id/packages/:index/preview") @UseInterceptors(new IdempotencyInterceptor())
  @AuditLog({module:"人力资源管理",resource:"hr.incremental_import",action:"预览服务器档案导入包",bizType:"hr_incremental_import",captureBody:false})
  preview(@CurrentScope() scope:TenantParkScope,@CurrentUser() actor:JwtPrincipal,@Param("id") id:string,@Param("index",ParseIntPipe) index:number) {
    return this.service.preview(scope,actor,id,index);
  }
}
