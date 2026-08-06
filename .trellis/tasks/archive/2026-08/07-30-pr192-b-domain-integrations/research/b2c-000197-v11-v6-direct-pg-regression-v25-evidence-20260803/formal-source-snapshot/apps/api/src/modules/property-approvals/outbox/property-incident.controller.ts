import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors
} from "@nestjs/common";
import {
  PROPERTY_BUSINESS_PERMISSIONS,
  type ApprovalRetryCommand,
  type TenantParkScope
} from "@jinhu/shared";
import { CurrentScope } from "../../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import {
  ApprovalIncidentListQueryDto,
  ApprovalIncidentRetryDto,
  EventIncidentListQueryDto,
  EventReplayDto
} from "./property-incident.dto";
import { PropertyIncidentService } from "./property-incident.service";

@Controller("property/event-delivery-incidents")
@RequireModule("asset")
export class PropertyEventIncidentController {
  constructor(private readonly service: PropertyIncidentService) {}

  @Get()
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_READ_INCIDENT
  )
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Query() query: EventIncidentListQueryDto) {
    return this.service.listEvents(scope, actor, query);
  }

  @Get(":dlqId")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_READ_INCIDENT
  )
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("dlqId", new ParseUUIDPipe()) dlqId: string) {
    return this.service.eventDetail(scope, actor, dlqId);
  }

  @Post(":dlqId/replay")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_READ_INCIDENT,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_REPLAY
  )
  replay(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("dlqId", new ParseUUIDPipe()) dlqId: string, @Body() dto: EventReplayDto) {
    return this.service.replayEvent(scope, actor, dlqId, dto);
  }
}

@Controller("property/approval-incidents")
@RequireModule("asset")
export class PropertyApprovalIncidentController {
  constructor(private readonly service: PropertyIncidentService) {}

  @Get()
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT
  )
  list(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Query() query: ApprovalIncidentListQueryDto) {
    return this.service.listApprovals(scope, actor, query);
  }

  @Get(":requestId")
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT
  )
  detail(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal,
    @Param("requestId", new ParseUUIDPipe()) requestId: string) {
    return this.service.approvalDetail(scope, actor, requestId);
  }

  // Canonical mutation remains /property/approvals/:requestId/retry. Primary
  // owner wires this method into that controller; no parallel incident mutation route.
  retry(scope: TenantParkScope, actor: JwtPrincipal, requestId: string, dto: ApprovalRetryCommand) {
    return this.service.retryApproval(scope, actor, requestId, dto);
  }
}

@Controller("property/approvals")
@RequireModule("asset")
export class PropertyApprovalIncidentRetryController {
  constructor(private readonly service: PropertyIncidentService) {}

  @Post(":requestId/retry")
  @UseInterceptors(new IdempotencyInterceptor())
  @RequirePermissions(
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT,
    PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_RETRY
  )
  retry(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Body() dto: ApprovalIncidentRetryDto
  ) {
    return this.service.retryApproval(scope, actor, requestId, dto);
  }
}
