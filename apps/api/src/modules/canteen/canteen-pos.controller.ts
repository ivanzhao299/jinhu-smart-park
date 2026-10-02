import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors
} from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CheckoutQrDto, CloseSessionDto, OpenSessionDto } from "./dto/canteen.dto";
import { CanteenCheckoutService } from "./canteen-checkout.service";
import { CanteenSessionService } from "./canteen-session.service";

@Controller("canteen/pos")
export class CanteenPosController {
  constructor(
    private readonly sessions: CanteenSessionService,
    private readonly checkout: CanteenCheckoutService
  ) {}

  /* ---------------- 收银班次 ---------------- */

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
}
