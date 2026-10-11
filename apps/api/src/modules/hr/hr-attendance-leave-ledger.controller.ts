import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequireAnyPermissions, RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreateHrLeaveQuotaDto, HrLeaveLedgerPageDto, HrLeaveQuotaListDto, HrLeaveTypeCodeDto, PutHrLeaveQuotaDto, PutHrLeaveTypeDto } from "./dto/hr-attendance-leave-ledger.dto";
import { HrAttendanceLeaveLedgerService } from "./hr-attendance-leave-ledger.service";

@Controller("hr/attendance") @RequireModule("hr")
export class HrAttendanceLeaveLedgerController {
 constructor(private readonly service: HrAttendanceLeaveLedgerService) {}
 @Get("leave-types") @RequireAnyPermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE, HR_PERMISSIONS.HR_ATTENDANCE_REQUEST, HR_PERMISSIONS.HR_ATTENDANCE_READ, HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ, HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ, HR_PERMISSIONS.HR_ATTENDANCE_APPROVE)
 types(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Query() q: HrLeaveLedgerPageDto) { return this.service.types(s, a, q); }
 @Get("leave-types/:code/history") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)
 typeHistory(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param() p: HrLeaveTypeCodeDto, @Query() q: HrLeaveLedgerPageDto) { return this.service.typeHistory(s, a, p.code, q); }
 @Put("leave-types/:code") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE) @UseInterceptors(new IdempotencyInterceptor())
 putType(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param() p: HrLeaveTypeCodeDto, @Body() d: PutHrLeaveTypeDto) { return this.service.putType(s, a, p.code, d); }
 @Get("leave-quotas") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)
 quotas(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Query() q: HrLeaveQuotaListDto) { return this.service.quotas(s, a, q); }
 @Get("leave-quotas/:id/history") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)
 quotaHistory(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("id", ParseUUIDPipe) id: string, @Query() q: HrLeaveLedgerPageDto) { return this.service.quotaHistory(s, a, id, q); }
 @Post("leave-quotas") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE) @UseInterceptors(new IdempotencyInterceptor())
 createQuota(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Body() d: CreateHrLeaveQuotaDto) { return this.service.createQuota(s, a, d); }
 @Put("leave-quotas/:id") @RequirePermissions(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE) @UseInterceptors(new IdempotencyInterceptor())
 putQuota(@CurrentScope() s: TenantParkScope, @CurrentUser() a: JwtPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() d: PutHrLeaveQuotaDto) { return this.service.putQuota(s, a, id, d); }
}
