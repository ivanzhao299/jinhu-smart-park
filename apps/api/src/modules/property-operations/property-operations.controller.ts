import { Body, Controller, Get, Headers, Param, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import { ConfigurePropertyUnitDto } from "./dto/configure-property-unit.dto";
import {
  PropertyModeTransitionListQueryDto,
  PropertyModeTransitionUnitListQueryDto,
  PropertyOperationListQueryDto
} from "./dto/property-control.dto";
import { TransitionOperatingModeDto } from "./dto/transition-operating-mode.dto";
import { PropertyOperationsService } from "./property-operations.service";

@Controller("property/units")
@RequireModule("asset")
export class PropertyOperationsController {
  constructor(private readonly service: PropertyOperationsService) {}

  @Get(":unitId/operation")
  @RequirePermissions(
    SYSTEM_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
    SYSTEM_PERMISSIONS.PROPERTY_OPERATION_READ
  )
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("unitId") unitId: string) {
    return this.service.detail(scope, actor, unitId);
  }

  @Put(":unitId/operation")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_OPERATION_UPDATE)
  @AuditLog({ module: "共享房产底座", resource: "biz.property_operation_config", action: "配置", bizType: "biz_property_operation_config", bizIdParam: "unitId" })
  configure(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("unitId") unitId: string,
    @Headers("x-idempotency-key") clientKey: string,
    @Body() dto: ConfigurePropertyUnitDto
  ) {
    return this.service.configure(scope, actor, unitId, dto, clientKey);
  }

  @Post(":unitId/mode-transitions")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE,
    SYSTEM_PERMISSIONS.PROPERTY_OPERATION_TRANSITION_MODE
  )
  @AuditLog({ module: "共享房产底座", resource: "biz.property_operation_config", action: "经营模式切换", bizType: "biz_property_mode_transition_log", bizIdParam: "unitId" })
  transitionMode(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("unitId") unitId: string,
    @Body() dto: TransitionOperatingModeDto,
    @Headers("x-idempotency-key") clientKey: string
  ) {
    return this.service.transitionMode(scope, actor, unitId, dto, clientKey);
  }

  @Get(":unitId/mode-transitions")
  @RequirePermissions(
    SYSTEM_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
    SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ
  )
  transitionLogs(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("unitId") unitId: string,
    @Query() query: PropertyModeTransitionUnitListQueryDto
  ) {
    return this.service.transitionLogs(scope, actor, unitId, query);
  }
}

@Controller("property/operations")
@RequireModule("asset")
export class PropertyOperationListController {
  constructor(private readonly service: PropertyOperationsService) {}

  @Get()
  @RequirePermissions(
    SYSTEM_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
    SYSTEM_PERMISSIONS.PROPERTY_OPERATION_READ
  )
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: PropertyOperationListQueryDto
  ) {
    return this.service.list(scope, actor, query);
  }
}

@Controller("property/mode-transitions")
@RequireModule("asset")
export class PropertyModeTransitionListController {
  constructor(private readonly service: PropertyOperationsService) {}

  @Get()
  @RequirePermissions(
    SYSTEM_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
    SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ
  )
  list(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: PropertyModeTransitionListQueryDto
  ) {
    return this.service.transitionLogsAggregate(scope, actor, query);
  }
}
