import { Body, Controller, Param, Post, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { GenerateContractReceivablesDto } from "./dto/generate-receivables.dto";
import { LeasingReceivablesService } from "./leasing-receivables.service";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";

@Controller("leasing/contracts")
@RequireModule("leasing")
export class LeasingContractReceivablesController {
  constructor(private readonly leasingReceivablesService: LeasingReceivablesService) {}

  @Post(":contractId/generate-receivables")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_RECEIVABLE_GENERATE)
  @AuditLog({ module: "租赁应收", resource: "biz.leasing_receivable", action: "合同生成应收", bizType: "biz_leasing_receivable", bizIdParam: "contractId" })
  generateForContract(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("contractId") contractId: string,
    @Body() dto: GenerateContractReceivablesDto
  ) {
    return this.leasingReceivablesService.generateForContract(scope, user, contractId, dto);
  }
}
