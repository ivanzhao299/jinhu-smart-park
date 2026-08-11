import { Controller, Get } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireAuthenticated } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { MobileService } from "./mobile.service";

@Controller("mobile/v1")
export class MobileController {
  constructor(private readonly mobileService: MobileService) {}

  @Get("bootstrap")
  @RequireAuthenticated()
  bootstrap(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal) {
    return this.mobileService.bootstrap(scope, user.sub);
  }
}
