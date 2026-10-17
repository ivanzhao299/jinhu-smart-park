import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrInsuranceOwnedPeriodService } from "./hr-insurance-owned-period.service";

/** Recheck named employee scope before cached financial write responses. */
@Injectable()
export class HrInsuranceOwnedWriteScopeGuard implements CanActivate {
  constructor(private readonly service: HrInsuranceOwnedPeriodService) {}
  async canActivate(context: ExecutionContext) {
    const action = context.getHandler().name;
    if (action !== "preview" && action !== "confirm" && action !== "correct" && action !== "close") throw new ForbiddenException("HR_INSURANCE_OWNED_FORBIDDEN");
    const request = context.switchToHttp().getRequest<{ user: JwtPrincipal; body: unknown }>();
    await this.service.authorizeWrite({ tenantId: request.user.tenantId, parkId: request.user.parkId }, request.user, action, request.body);
    return true;
  }
}
