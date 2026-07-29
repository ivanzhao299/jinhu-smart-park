import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors
} from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import {
  RequireAnyPermissions,
  RequirePermissions
} from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  AddHomestayGuestDto,
  CreateHomestayBookingDto,
  ExecuteHomestayTurnoverDto,
  HomestayBookingQueryDto,
  HomestayReasonDto,
  HomestayTurnoverQueryDto,
  HomestayUnitCandidateQueryDto,
  IssueHomestayCredentialDto,
  RegisterHomestayLedgerEntryDto,
  RescheduleHomestayBookingDto,
  UpsertHomestayRateDto,
  UpsertHomestayRateOverrideDto
} from "./dto/homestay.dto";
import { HomestayService } from "./homestay.service";

@Controller("homestay")
@RequireModule("homestay")
export class HomestayController {
  constructor(private readonly service: HomestayService) {}

  @Get("dashboard")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_DASHBOARD_READ)
  dashboard(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query("business_date") businessDate?: string
  ) {
    return this.service.dashboard(scope, actor, businessDate);
  }

  @Get("availability")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ)
  availability(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query("date_from") dateFrom: string,
    @Query("date_to") dateTo: string
  ) {
    return this.service.availability(scope, actor, dateFrom, dateTo);
  }

  @Get("unit-candidates")
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_RATE_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE,
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CREATE
  )
  unitCandidates(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HomestayUnitCandidateQueryDto
  ) {
    return this.service.listUnitCandidates(scope, actor, query);
  }

  @Get("rates/:unitId")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_RATE_READ)
  rateCalendar(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("unitId") unitId: string,
    @Query("date_from") dateFrom: string,
    @Query("date_to") dateTo: string
  ) {
    return this.service.getRateCalendar(scope, actor, unitId, dateFrom, dateTo);
  }

  @Put("rates/:unitId")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE)
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_rate", action: "配置基础日价", bizType: "biz_homestay_rate_config" })
  upsertRate(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("unitId") unitId: string,
    @Body() dto: UpsertHomestayRateDto
  ) {
    return this.service.upsertRate(scope, actor, unitId, dto);
  }

  @Post("rates/:unitId/overrides")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE)
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_rate_override", action: "配置日期覆盖价", bizType: "biz_homestay_rate_override" })
  upsertRateOverride(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("unitId") unitId: string,
    @Body() dto: UpsertHomestayRateOverrideDto
  ) {
    return this.service.upsertRateOverride(scope, actor, unitId, dto);
  }

  @Get("bookings")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ)
  listBookings(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HomestayBookingQueryDto
  ) {
    return this.service.listBookings(scope, actor, query);
  }

  @Get("bookings/:id")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ)
  getBooking(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string
  ) {
    return this.service.getBooking(scope, actor, id);
  }

  @Post("bookings")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CREATE)
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_booking", action: "创建订单", bizType: "biz_homestay_booking" })
  createBooking(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreateHomestayBookingDto,
    @Headers("x-idempotency-key") idempotencyKey?: string
  ) {
    return this.service.createBooking(scope, actor, dto, idempotencyKey);
  }

  @Post("bookings/:id/confirm")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM
  )
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_booking", action: "确认订单", bizType: "biz_homestay_booking", bizIdParam: "id" })
  confirmBooking(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string
  ) {
    return this.service.confirmBooking(scope, actor, id);
  }

  @Post("bookings/:id/cancel")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CANCEL
  )
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_booking", action: "取消订单", bizType: "biz_homestay_booking", bizIdParam: "id" })
  cancelBooking(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: HomestayReasonDto
  ) {
    return this.service.cancelBooking(scope, actor, id, dto.reason);
  }

  @Post("bookings/:id/no-show")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE
  )
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_booking", action: "登记未到店", bizType: "biz_homestay_booking", bizIdParam: "id" })
  markNoShow(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: HomestayReasonDto
  ) {
    return this.service.markNoShow(scope, actor, id, dto.reason);
  }

  @Post("bookings/:id/reschedule")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_RESCHEDULE
  )
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_booking", action: "订单改期", bizType: "biz_homestay_booking", bizIdParam: "id" })
  rescheduleBooking(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RescheduleHomestayBookingDto
  ) {
    return this.service.rescheduleBooking(scope, actor, id, dto);
  }

  @Post("bookings/:id/guests")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE
  )
  @AuditLog({ module: "民宿管理", resource: "rel.homestay_booking_guest", action: "登记入住人", bizType: "rel_homestay_booking_guest", bizIdParam: "id" })
  addGuest(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: AddHomestayGuestDto
  ) {
    return this.service.addGuest(scope, actor, id, dto);
  }

  @Post("bookings/:id/credentials")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE
  )
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_stay_credential", action: "发放入住凭证", bizType: "biz_homestay_stay_credential", bizIdParam: "id" })
  issueCredential(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: IssueHomestayCredentialDto
  ) {
    return this.service.issueCredential(scope, actor, id, dto);
  }

  @Post("bookings/:id/credentials/:credentialId/return")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE
  )
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_stay_credential", action: "回收入住凭证", bizType: "biz_homestay_stay_credential", bizIdParam: "credentialId" })
  returnCredential(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Param("credentialId") credentialId: string
  ) {
    return this.service.returnCredential(scope, actor, id, credentialId);
  }

  @Post("bookings/:id/check-in")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE
  )
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_booking", action: "办理入住", bizType: "biz_homestay_booking", bizIdParam: "id" })
  checkIn(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string
  ) {
    return this.service.checkIn(scope, actor, id);
  }

  @Post("bookings/:id/check-out")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
    SYSTEM_PERMISSIONS.HOMESTAY_STAY_MANAGE
  )
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_booking", action: "办理退房", bizType: "biz_homestay_booking", bizIdParam: "id" })
  checkOut(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string
  ) {
    return this.service.checkOut(scope, actor, id);
  }

  @Post("bookings/:id/ledger")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER,
    SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
  )
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ)
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_ledger", action: "登记费用收退款", bizType: "biz_homestay_ledger_entry", bizIdParam: "id" })
  registerLedgerEntry(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RegisterHomestayLedgerEntryDto
  ) {
    return this.service.registerLedgerEntry(scope, actor, id, dto);
  }

  @Get("turnovers")
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_READ)
  listTurnovers(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: HomestayTurnoverQueryDto
  ) {
    return this.service.listTurnovers(scope, actor, query);
  }

  @Post("turnovers/:id/actions/:action")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE)
  @AuditLog({ module: "民宿管理", resource: "biz.homestay_turnover", action: "执行保洁任务", bizType: "biz_homestay_turnover_task", bizIdParam: "id" })
  executeTurnover(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Param("action") action: "start" | "complete" | "inspect" | "exception",
    @Body() dto: ExecuteHomestayTurnoverDto
  ) {
    return this.service.executeTurnover(scope, actor, id, action, dto);
  }
}
