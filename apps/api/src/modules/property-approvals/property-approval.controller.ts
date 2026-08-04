import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors
} from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  PropertyApprovalListQueryDto,
  PropertyApprovalDecisionDto,
  PropertyApprovalWithdrawDto
} from "./dto/property-approval.dto";
import { PropertyApprovalService } from "./property-approval.service";

@Controller("property/approvals")
@RequireModule("asset")
export class PropertyApprovalController {
  constructor(private readonly service: PropertyApprovalService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ)
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: PropertyApprovalListQueryDto
  ) {
    return this.service.list(scope, actor, query);
  }

  @Post(":requestId/decisions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_DECIDE)
  decide(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Body() dto: PropertyApprovalDecisionDto
  ) {
    return this.service.decide(scope, actor, requestId, dto);
  }

  @Get(":requestId")
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ)
  detail(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("requestId", new ParseUUIDPipe()) requestId: string
  ) {
    return this.service.detail(scope, actor, requestId);
  }

  @Post(":requestId/withdraw")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_WITHDRAW)
  withdraw(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Body() dto: PropertyApprovalWithdrawDto
  ) {
    return this.service.withdraw(scope, actor, requestId, dto);
  }
}
