import {Body,Controller,Get,Param,Put,Query,UseInterceptors} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope} from "@jinhu/shared";
import {CurrentScope} from "../../shared/decorators/current-scope.decorator";
import {CurrentUser} from "../../shared/decorators/current-user.decorator";
import {RequireModule} from "../../shared/decorators/modules.decorator";
import {RequirePermissions} from "../../shared/decorators/permissions.decorator";
import {IdempotencyInterceptor} from "../../shared/interceptors/idempotency.interceptor";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrWorkCalendarDateDto,HrWorkCalendarHistoryDto,HrWorkCalendarRangeDto,PutHrWorkCalendarDto} from "./dto/hr-attendance-work-calendar.dto";
import {HrAttendanceWorkCalendarService} from "./hr-attendance-work-calendar.service";

@Controller("hr/attendance/work-calendar") @RequireModule("hr")
export class HrAttendanceWorkCalendarController {
 constructor(private readonly service:HrAttendanceWorkCalendarService){}
 @Get() @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)
 list(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrWorkCalendarRangeDto){return this.service.list(s,a,q);}
 @Get(":date/history") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)
 history(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param()p:HrWorkCalendarDateDto,@Query()q:HrWorkCalendarHistoryDto){return this.service.history(s,a,p.date,q);}
 @Put(":date") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE) @UseInterceptors(new IdempotencyInterceptor())
 put(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param()p:HrWorkCalendarDateDto,@Body()d:PutHrWorkCalendarDto){return this.service.put(s,a,p.date,d);}
}
