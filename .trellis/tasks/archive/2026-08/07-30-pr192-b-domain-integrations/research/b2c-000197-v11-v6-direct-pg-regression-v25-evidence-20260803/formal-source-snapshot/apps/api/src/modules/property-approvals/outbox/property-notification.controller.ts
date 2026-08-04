import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors
} from "@nestjs/common";
import { PROPERTY_BUSINESS_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import {
  PropertyNotificationListQueryDto,
  PropertyNotificationMarkReadDto
} from "./property-notification.dto";
import { PropertyNotificationService } from "./property-notification.service";

@Controller("property/notifications")
@RequireModule("asset")
export class PropertyNotificationController {
  constructor(private readonly service: PropertyNotificationService) {}

  @Get()
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_READ
  )
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Query() query: PropertyNotificationListQueryDto) {
    return this.service.list(scope, actor, query);
  }

  @Get(":notificationId")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_READ
  )
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("notificationId", new ParseUUIDPipe()) notificationId: string) {
    return this.service.detail(scope, actor, notificationId);
  }

  @Post(":notificationId/read")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_MARK_READ
  )
  markRead(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("notificationId", new ParseUUIDPipe()) notificationId: string,
    @Body() dto: PropertyNotificationMarkReadDto) {
    return this.service.markRead(scope, actor, notificationId, dto);
  }
}
