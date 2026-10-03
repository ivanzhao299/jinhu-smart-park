import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import { UseInterceptors } from "@nestjs/common";
import {
  GenerateSettlementDto,
  SettlementListQueryDto,
  DisputeSettlementDto,
  SettleSettlementDto
} from "./dto/canteen.dto";
import { CanteenSettlementService } from "./canteen-settlement.service";

@Controller("canteen/settlements")
export class CanteenSettlementController {
  constructor(private readonly svc: CanteenSettlementService) {}

  @Post()
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_GENERATE)
  generate(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() body: GenerateSettlementDto) {
    return this.svc.generate(scope, actor, body.outlet_id, body.period);
  }

  @Get()
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_VIEW)
  list(@CurrentScope() scope: TenantParkScope, @Query() q: SettlementListQueryDto) {
    return this.svc.list(scope, { ...q, page: q.page ?? 1, page_size: q.page_size ?? 20 });
  }

  @Get(":id")
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_VIEW)
  detail(@CurrentScope() scope: TenantParkScope, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.svc.detail(scope, id);
  }

  @Get(":id/items")
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_VIEW)
  items(@CurrentScope() scope: TenantParkScope, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.svc.items(scope, id);
  }

  @Post(":id/submit")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_SUBMIT)
  submit(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.svc.submit(scope, actor, id);
  }

  @Post(":id/reconcile")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_RECONCILE)
  reconcile(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.svc.reconcile(scope, actor, id);
  }

  @Post(":id/dispute")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_DISPUTE)
  dispute(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: DisputeSettlementDto
  ) {
    return this.svc.dispute(scope, actor, id, body.diff_amount, body.diff_reason);
  }

  @Post(":id/approve")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_APPROVE)
  approve(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.svc.approve(scope, actor, id);
  }

  @Post(":id/settle")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(CANTEEN_PERMISSIONS.SETTLEMENT_SETTLE)
  settle(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: SettleSettlementDto
  ) {
    return this.svc.settle(scope, actor, id, body.settle_evidence_file_id, body.remark);
  }
}
