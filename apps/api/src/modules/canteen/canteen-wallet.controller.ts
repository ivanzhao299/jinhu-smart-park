import { Controller, Get, Query } from "@nestjs/common";
import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { WalletTxnQueryDto } from "./dto/canteen.dto";
import { CanteenSubsidyService } from "./canteen-subsidy.service";

/**
 * 员工本人钱包（个人中心“我的餐补”）+ 收银按员工查。
 */
@Controller("canteen/wallet")
export class CanteenWalletController {
  constructor(private readonly subsidy: CanteenSubsidyService) {}

  @Get("me")
  @RequirePermissions(CANTEEN_PERMISSIONS.WALLET_VIEW)
  me(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal) {
    return this.subsidy.walletMe(scope, actor.sub);
  }

  @Get("me/txns")
  @RequirePermissions(CANTEEN_PERMISSIONS.WALLET_VIEW)
  meTxns(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: WalletTxnQueryDto
  ) {
    return this.subsidy.walletMeTxns(scope, actor.sub, query.page ?? 1, query.page_size ?? 20);
  }

  @Get("me/code")
  @RequirePermissions(CANTEEN_PERMISSIONS.WALLET_VIEW)
  meCode(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal) {
    return this.subsidy.walletMeCode(scope, actor.sub);
  }

  /** 收银按个人码/工号/手机号查（受限）。 */
  @Get("by-employee")
  @RequirePermissions(CANTEEN_PERMISSIONS.WALLET_LOOKUP)
  byEmployee(@CurrentScope() scope: TenantParkScope, @Query("employee_code") code: string) {
    return this.subsidy.lookupEmployee(scope, code);
  }
}
