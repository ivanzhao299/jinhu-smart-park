import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { CreateLeasingContractUnitDto } from "./dto/create-leasing-contract-unit.dto";
import { CreateLeasingContractDto } from "./dto/create-leasing-contract.dto";
import {
  ArchiveLeasingContractDto,
  EffectiveLeasingContractDto,
  LeasingContractApprovalActionDto,
  RejectLeasingContractDto
} from "./dto/leasing-contract-approval-action.dto";
import { LeasingContractQueryDto } from "./dto/leasing-contract-query.dto";
import { LeasingContractStatusLogQueryDto } from "./dto/leasing-contract-status-log-query.dto";
import { UpdateLeasingContractUnitDto } from "./dto/update-leasing-contract-unit.dto";
import { UpdateLeasingContractDto } from "./dto/update-leasing-contract.dto";
import { LeasingContractsService } from "./leasing-contracts.service";

@Controller("leasing/contracts")
@RequireModule("leasing")
export class LeasingContractsController {
  constructor(private readonly leasingContractsService: LeasingContractsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_READ)
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Query() query: LeasingContractQueryDto) {
    return this.leasingContractsService.list(scope, query, user);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingContractsService.detail(scope, id, user);
  }

  @Get(":id/files")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_FILE_READ)
  files(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingContractsService.listFiles(scope, user, id);
  }

  @Get(":id/status-logs")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_STATUS_LOG)
  statusLogs(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Query() query: LeasingContractStatusLogQueryDto
  ) {
    return this.leasingContractsService.listStatusLogs(scope, user, id, query);
  }

  @Get(":contractId/units")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_UNIT_READ)
  listUnits(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("contractId") contractId: string) {
    return this.leasingContractsService.listUnits(scope, user, contractId);
  }

  @Post(":contractId/units")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_UNIT_CREATE)
  @AuditLog({ module: "租赁合同房源", resource: "rel.leasing_contract_unit", action: "新增", bizType: "rel_leasing_contract_unit", bizIdParam: "contractId" })
  createUnitLink(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("contractId") contractId: string,
    @Body() dto: CreateLeasingContractUnitDto
  ) {
    return this.leasingContractsService.createUnitLink(scope, user, contractId, dto);
  }

  @Put(":contractId/units/:relId")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_UNIT_UPDATE)
  @AuditLog({ module: "租赁合同房源", resource: "rel.leasing_contract_unit", action: "修改", bizType: "rel_leasing_contract_unit", bizIdParam: "relId" })
  updateUnitLink(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("contractId") contractId: string,
    @Param("relId") relId: string,
    @Body() dto: UpdateLeasingContractUnitDto
  ) {
    return this.leasingContractsService.updateUnitLink(scope, user, contractId, relId, dto);
  }

  @Delete(":contractId/units/:relId")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_UNIT_DELETE)
  @AuditLog({ module: "租赁合同房源", resource: "rel.leasing_contract_unit", action: "删除", bizType: "rel_leasing_contract_unit", bizIdParam: "relId" })
  removeUnitLink(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("contractId") contractId: string,
    @Param("relId") relId: string
  ) {
    return this.leasingContractsService.softDeleteUnitLink(scope, user, contractId, relId);
  }

  @Post(":contractId/recalculate")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_RECALCULATE)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "金额重算", bizType: "biz_leasing_contract", bizIdParam: "contractId" })
  recalculate(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("contractId") contractId: string) {
    return this.leasingContractsService.recalculate(scope, user, contractId);
  }

  @Post(":id/submit")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_SUBMIT)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "提交审批", bizType: "biz_leasing_contract", bizIdParam: "id" })
  submitApproval(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: LeasingContractApprovalActionDto
  ) {
    return this.leasingContractsService.submitForApproval(scope, user, id, dto);
  }

  @Post(":id/approve")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_APPROVE)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "审批通过", bizType: "biz_leasing_contract", bizIdParam: "id" })
  approve(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: LeasingContractApprovalActionDto
  ) {
    return this.leasingContractsService.approve(scope, user, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_REJECT)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "审批驳回", bizType: "biz_leasing_contract", bizIdParam: "id" })
  reject(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: RejectLeasingContractDto
  ) {
    return this.leasingContractsService.reject(scope, user, id, dto);
  }

  @Post(":id/void")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_VOID)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "作废", bizType: "biz_leasing_contract", bizIdParam: "id" })
  voidContract(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: LeasingContractApprovalActionDto
  ) {
    return this.leasingContractsService.voidContract(scope, user, id, dto);
  }

  @Post(":id/archive")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_ARCHIVE)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "签章归档", bizType: "biz_leasing_contract", bizIdParam: "id" })
  archive(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ArchiveLeasingContractDto
  ) {
    return this.leasingContractsService.archive(scope, user, id, dto);
  }

  @Post(":id/effective")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_EFFECTIVE)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "合同生效", bizType: "biz_leasing_contract", bizIdParam: "id" })
  effective(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: EffectiveLeasingContractDto
  ) {
    return this.leasingContractsService.effective(scope, user, id, dto);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_CREATE)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "新增", bizType: "biz_leasing_contract" })
  create(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Body() dto: CreateLeasingContractDto) {
    return this.leasingContractsService.create(scope, user, dto);
  }

  @Put(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_UPDATE)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "修改", bizType: "biz_leasing_contract", bizIdParam: "id" })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() user: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: UpdateLeasingContractDto
  ) {
    return this.leasingContractsService.update(scope, user, id, dto);
  }

  @Delete(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.LEASING_CONTRACT_DELETE)
  @AuditLog({ module: "租赁合同", resource: "biz.leasing_contract", action: "删除", bizType: "biz_leasing_contract", bizIdParam: "id" })
  remove(@CurrentScope() scope: TenantParkScope, @CurrentUser() user: JwtPrincipal, @Param("id") id: string) {
    return this.leasingContractsService.softDelete(scope, user, id);
  }
}
