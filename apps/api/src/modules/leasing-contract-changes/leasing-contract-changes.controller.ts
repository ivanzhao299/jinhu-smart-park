import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateLeasingContractChangeDto } from "./dto/create-leasing-contract-change.dto";
import { LeasingContractChangeActionDto, RejectLeasingContractChangeDto } from "./dto/leasing-contract-change-action.dto";
import { LeasingContractChangeQueryDto } from "./dto/leasing-contract-change-query.dto";
import { UpdateLeasingContractChangeDto } from "./dto/update-leasing-contract-change.dto";
import { LeasingContractChangesService } from "./leasing-contract-changes.service";

@Controller("leasing/contract-changes")
@RequireModule("leasing")
export class LeasingContractChangesController {
  constructor(private readonly leasingContractChangesService: LeasingContractChangesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingContractChangeQueryDto) {
    return this.leasingContractChangesService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingContractChangesService.detail(scope, id, user);
  }

  @Post(":id/preview-finance-impact")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_PREVIEW)
  @AuditLog({ module: "合同变更", resource: "biz.leasing_contract_change", action: "财务影响预览", bizType: "biz_leasing_contract_change", bizIdParam: "id" })
  previewFinanceImpact(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingContractChangesService.previewFinanceImpact(scope, user, id);
  }

  @Post(":id/submit")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_SUBMIT)
  @AuditLog({ module: "合同变更", resource: "biz.leasing_contract_change", action: "提交审批", bizType: "biz_leasing_contract_change", bizIdParam: "id" })
  submit(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: LeasingContractChangeActionDto) {
    return this.leasingContractChangesService.submitForApproval(scope, user, id, dto);
  }

  @Post(":id/approve")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_APPROVE)
  @AuditLog({ module: "合同变更", resource: "biz.leasing_contract_change", action: "审批通过", bizType: "biz_leasing_contract_change", bizIdParam: "id" })
  approve(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: LeasingContractChangeActionDto) {
    return this.leasingContractChangesService.approve(scope, user, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_REJECT)
  @AuditLog({ module: "合同变更", resource: "biz.leasing_contract_change", action: "审批驳回", bizType: "biz_leasing_contract_change", bizIdParam: "id" })
  reject(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: RejectLeasingContractChangeDto) {
    return this.leasingContractChangesService.reject(scope, user, id, dto);
  }

  @Post(":id/effective")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_EFFECTIVE)
  @AuditLog({ module: "合同变更", resource: "biz.leasing_contract_change", action: "生效", bizType: "biz_leasing_contract_change", bizIdParam: "id" })
  effective(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: LeasingContractChangeActionDto) {
    return this.leasingContractChangesService.effective(scope, user, id, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_UPDATE)
  @AuditLog({ module: "合同变更", resource: "biz.leasing_contract_change", action: "修改", bizType: "biz_leasing_contract_change", bizIdParam: "id" })
  update(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string, @Body() dto: UpdateLeasingContractChangeDto) {
    return this.leasingContractChangesService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_DELETE)
  @AuditLog({ module: "合同变更", resource: "biz.leasing_contract_change", action: "删除", bizType: "biz_leasing_contract_change", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingContractChangesService.softDelete(scope, user, id);
  }
}

@Controller("leasing/contracts")
@RequireModule("leasing")
export class LeasingContractNestedChangesController {
  constructor(private readonly leasingContractChangesService: LeasingContractChangesService) {}

  @Post(":contractId/changes")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CHANGE_CREATE)
  @AuditLog({ module: "合同变更", resource: "biz.leasing_contract_change", action: "新增", bizType: "biz_leasing_contract_change", bizIdParam: "contractId" })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("contractId") contractId: string,
    @Body() dto: CreateLeasingContractChangeDto
  ) {
    return this.leasingContractChangesService.create(scope, user, contractId, dto);
  }
}
