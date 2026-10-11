import {Body,Controller,Get,Param,ParseUUIDPipe,Post,Put,Query,UseInterceptors} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope} from "@jinhu/shared";
import {CurrentScope} from "../../shared/decorators/current-scope.decorator";
import {CurrentUser} from "../../shared/decorators/current-user.decorator";
import {RequireModule} from "../../shared/decorators/modules.decorator";
import {RequireAnyPermissions} from "../../shared/decorators/permissions.decorator";
import {IdempotencyInterceptor} from "../../shared/interceptors/idempotency.interceptor";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {CreateHrLeaveCancellationDto,UpdateHrLeaveCancellationDto,HrLeaveCancellationActionDto,HrLeaveCancellationListDto,HrLeaveCancellationPageDto,HrLeaveCancellationSourceQueryDto} from "./dto/hr-attendance-leave-cancellation.dto";
import {HrAttendanceLeaveCancellationService} from "./hr-attendance-leave-cancellation.service";

@Controller("hr/attendance/leave-cancellations") @RequireModule("hr")
export class HrAttendanceLeaveCancellationController {
 constructor(private readonly service:HrAttendanceLeaveCancellationService){}
 @Get("sources") @RequireAnyPermissions(HR_PERMISSIONS.HR_ATTENDANCE_REQUEST,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)
 sources(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrLeaveCancellationSourceQueryDto){return this.service.sources(s,a,q);}
 @Get() @RequireAnyPermissions(HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ,HR_PERMISSIONS.HR_ATTENDANCE_REQUEST,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE,HR_PERMISSIONS.HR_ATTENDANCE_APPROVE)
 list(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrLeaveCancellationListDto){return this.service.list(s,a,q);}
 @Get(":id/history") @RequireAnyPermissions(HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ,HR_PERMISSIONS.HR_ATTENDANCE_REQUEST,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE,HR_PERMISSIONS.HR_ATTENDANCE_APPROVE)
 history(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Query()q:HrLeaveCancellationPageDto){return this.service.history(s,a,id,q);}
 @Post() @RequireAnyPermissions(HR_PERMISSIONS.HR_ATTENDANCE_REQUEST,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE) @UseInterceptors(new IdempotencyInterceptor())
 create(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()d:CreateHrLeaveCancellationDto){return this.service.create(s,a,d);}
 @Put(":id") @RequireAnyPermissions(HR_PERMISSIONS.HR_ATTENDANCE_REQUEST,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE) @UseInterceptors(new IdempotencyInterceptor())
 update(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:UpdateHrLeaveCancellationDto){return this.service.update(s,a,id,d);}
 @Post(":id/actions") @RequireAnyPermissions(HR_PERMISSIONS.HR_ATTENDANCE_REQUEST,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE,HR_PERMISSIONS.HR_ATTENDANCE_APPROVE) @UseInterceptors(new IdempotencyInterceptor())
 act(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:HrLeaveCancellationActionDto){return this.service.act(s,a,id,d);}
}
