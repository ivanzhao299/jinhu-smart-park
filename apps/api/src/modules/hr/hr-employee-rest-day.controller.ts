import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrLeaveLedgerPageDto } from "./dto/hr-attendance-leave-ledger.dto";
import { PutHrEmployeeRestDayDto } from "./dto/hr-employee-rest-day.dto";
import { HrEmployeeRestDayService } from "./hr-employee-rest-day.service";
@Controller("hr/attendance/employee-rest-days") @RequireModule("hr") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)
export class HrEmployeeRestDayController {
 constructor(private readonly service: HrEmployeeRestDayService) {}
 @Get(":employeeId/:date") get(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("employeeId", ParseUUIDPipe) id: string, @Param("date") date: string) { return this.service.get(s, a, id, date); }
 @Get(":employeeId/:date/history") history(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("employeeId", ParseUUIDPipe) id: string, @Param("date") date: string, @Query() q: HrLeaveLedgerPageDto) { return this.service.history(s, a, id, date, q); }
 @Put(":employeeId/:date") @UseInterceptors(new IdempotencyInterceptor()) put(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("employeeId", ParseUUIDPipe) id: string, @Param("date") date: string, @Body() d: PutHrEmployeeRestDayDto) { return this.service.put(s, a, id, date, d); }
}
