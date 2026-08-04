import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { PROPERTY_BUSINESS_PERMISSIONS, SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  AddPartyRoleDto,
  CreatePartyDto,
  PartyQueryDto,
  UpdatePartyDto,
  VerifyPartyDto
} from "./dto/party.dto";
import { PartiesService } from "./parties.service";

@Controller("property/parties")
@RequireModule("asset")
export class PartiesController {
  constructor(private readonly service: PartiesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PARTY_READ)
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: PartyQueryDto
  ) {
    return this.service.list(scope, query, actor);
  }

  @Get(":id")
  @RequirePermissions(SYSTEM_PERMISSIONS.PARTY_READ)
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id") id: string) {
    return this.service.detail(scope, actor, id);
  }

  @Post()
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PARTY_CREATE)
  @AuditLog({ module: "共享房产底座", resource: "biz.party", action: "新增业务相对方", bizType: "biz_party", captureBody: false })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Headers("x-idempotency-key") clientKey: string | undefined,
    @Body() dto: CreatePartyDto
  ) {
    return this.service.create(scope, actor, dto, clientKey)
      .then((party) => this.service.projectForActor(party, actor));
  }

  @Put(":id")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PARTY_UPDATE)
  @AuditLog({ module: "共享房产底座", resource: "biz.party", action: "修改业务相对方", bizType: "biz_party", bizIdParam: "id", captureBody: false })
  update(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Headers("x-idempotency-key") clientKey: string | undefined,
    @Body() dto: UpdatePartyDto
  ) {
    return this.service.update(scope, actor, id, dto, clientKey)
      .then((party) => this.service.projectForActor(party, actor));
  }

  @Post(":id/verification")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY)
  @AuditLog({ module: "共享房产底座", resource: "biz.party", action: "核验业务相对方身份", bizType: "biz_party", bizIdParam: "id", captureBody: false })
  verify(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Headers("x-idempotency-key") clientKey: string | undefined,
    @Body() dto: VerifyPartyDto
  ) {
    return this.service.verify(scope, actor, id, dto, clientKey)
      .then((party) => this.service.projectForActor(party, actor));
  }

  @Post("roles")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PARTY_ROLE_MANAGE)
  @AuditLog({ module: "共享房产底座", resource: "rel.party_role", action: "新增业务角色", bizType: "rel_party_role" })
  addRole(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Body() dto: AddPartyRoleDto) {
    return this.service.addRole(scope, actor, dto);
  }

  @Delete("roles/:roleId")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PARTY_ROLE_MANAGE)
  @AuditLog({ module: "共享房产底座", resource: "rel.party_role", action: "移除业务角色", bizType: "rel_party_role", bizIdParam: "roleId" })
  removeRole(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("roleId") roleId: string) {
    return this.service.removeRole(scope, actor, roleId);
  }
}
