import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors
} from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CheckoutQrDto, CheckoutSubsidyDto, CloseSessionDto, LookupEmployeeDto, OpenSessionDto, SessionListQueryDto } from "./dto/canteen.dto";
import { CanteenCheckoutService } from "./canteen-checkout.service";
import { CanteenSessionService } from "./canteen-session.service";
import { CanteenSubsidyService } from "./canteen-subsidy.service";

@Controller("canteen/pos")
export class CanteenPosController {
  constructor(
    private readonly sessions: CanteenSessionService,
    private readonly checkout: CanteenCheckoutService,
    private readonly subsidy: CanteenSubsidyService
  ) {}

  /* ---------------- 收银班次 ---------------- */

  @Get("sessions")
  @RequirePermissions(CANTEEN_PERMISSIONS.SESSION_VIEW)
  listSessions(@CurrentScope() scope: TenantParkScope, @Query() query: SessionListQueryDto) {
    return this.sessions.list(scope, query);
  }

  @Post("sessions/open")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SESSION_OPEN)
  openSession(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: OpenSessionDto
  ) {
    return this.sessions.open(scope, actor, dto);
  }

  @Get("sessions/current")
  @RequirePermissions(CANTEEN_PERMISSIONS.SESSION_VIEW)
  currentSession(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal) {
    return this.sessions.current(scope, actor);
  }

  @Get("sessions/current/day-close")
  @RequirePermissions(CANTEEN_PERMISSIONS.SESSION_VIEW)
  previewDayClose(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal) {
    return this.sessions.previewCurrent(scope, actor);
  }

  @Post("sessions/:id/close")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SESSION_CLOSE)
  closeSession(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: CloseSessionDto
  ) {
    return this.sessions.close(scope, actor, id, dto.remark);
  }

  /* ---------------- 扫码收款 ---------------- */

  @Post("checkout/qr")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_CREATE)
  checkoutQr(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CheckoutQrDto,
    @Headers("x-idempotency-key") idempotencyKey: string
  ) {
    return this.checkout.checkoutQr(scope, actor, dto, idempotencyKey);
  }

  /* ---------------- 员工餐补 ---------------- */

  @Post("lookup-employee")
  @RequirePermissions(CANTEEN_PERMISSIONS.WALLET_LOOKUP)
  lookupEmployee(
    @CurrentScope() scope: TenantParkScope,
    @Body() dto: LookupEmployeeDto
  ) {
    return this.subsidy.lookupEmployee(scope, dto.employee_code);
  }

  @Post("checkout/subsidy")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.ORDER_CREATE)
  checkoutSubsidy(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CheckoutSubsidyDto,
    @Headers("x-idempotency-key") idempotencyKey: string
  ) {
    return this.subsidy.checkout(scope, actor, dto, idempotencyKey);
  }
}
