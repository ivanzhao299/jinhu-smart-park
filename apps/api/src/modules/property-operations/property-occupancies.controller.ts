import { Body, Controller, Get, Headers, Param, Post, Query, UseInterceptors } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import {
  RequireAnyPermissions,
  RequirePermissions
} from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditLog } from "../audit/decorators/audit-log.decorator";
import {
  CheckPropertyAvailabilityDto,
  CreatePropertyOccupancyDto,
  PropertyOccupancyQueryDto,
  ReleasePropertyOccupancyDto
} from "./dto/property-occupancy.dto";
import { PropertyOccupanciesService } from "./property-occupancies.service";

@Controller("property/occupancies")
@RequireModule("asset")
export class PropertyOccupanciesController {
  constructor(private readonly service: PropertyOccupanciesService) {}

  @Get()
  @RequirePermissions(
    SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
    SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_READ
  )
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Query() query: PropertyOccupancyQueryDto) {
    return this.service.list(scope, actor, query);
  }

  @Post("availability")
  @RequirePermissions(
    SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
    SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_READ
  )
  checkAvailability(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CheckPropertyAvailabilityDto
  ) {
    return this.service.checkAvailability(scope, actor, dto);
  }

  @Get(":id")
  @RequirePermissions(
    SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
    SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_READ
  )
  detail(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string
  ) {
    return this.service.detail(scope, actor, id);
  }

  @Post()
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_CREATE)
  @AuditLog({ module: "共享房产底座", resource: "biz.property_occupancy", action: "创建占用", bizType: "biz_property_occupancy" })
  create(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Body() dto: CreatePropertyOccupancyDto,
    @Headers("x-idempotency-key") idempotencyKey?: string
  ) {
    return this.service.create(scope, actor, dto, idempotencyKey);
  }

  @Post(":id/activate")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_ACTIVATE)
  @AuditLog({ module: "共享房产底座", resource: "biz.property_occupancy", action: "占用生效", bizType: "biz_property_occupancy", bizIdParam: "id" })
  activate(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal, @Param("id") id: string) {
    return this.service.activate(scope, actor, id);
  }

  @Post(":id/release")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequireAnyPermissions(
    SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_RELEASE,
    SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_FORCE_RELEASE
  )
  @AuditLog({ module: "共享房产底座", resource: "biz.property_occupancy", action: "释放占用", bizType: "biz_property_occupancy", bizIdParam: "id" })
  release(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string,
    @Body() dto: ReleasePropertyOccupancyDto,
    @Headers("x-idempotency-key") clientKey: string
  ) {
    return this.service.release(scope, actor, id, dto, clientKey);
  }
}
