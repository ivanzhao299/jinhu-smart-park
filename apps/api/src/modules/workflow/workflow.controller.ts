import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { WorkflowMessageQueryDto } from "./dto/workflow-message-query.dto";
import { UserMessageEntity } from "./entities/user-message.entity";
import { WorkflowService } from "./workflow.service";
import type { WorkflowInboxResponse } from "./workflow.types";

@Controller("workflow")
@RequireModule("workorder")
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get("inbox")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_READ)
  inbox(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal): Promise<WorkflowInboxResponse> {
    return this.workflowService.inbox(scope, actor);
  }

  @Get("messages")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_READ)
  messages(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Query() query: WorkflowMessageQueryDto
  ): Promise<PaginatedResult<UserMessageEntity>> {
    return this.workflowService.listMessages(scope, actor, query);
  }

  @Post("messages/read-all")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_READ)
  readAll(@CurrentScope() scope: TenantParkScope, @CurrentUser() actor: JwtPrincipal): Promise<{ updated: number }> {
    return this.workflowService.markAllMessagesRead(scope, actor);
  }

  @Post("messages/:id/read")
  @RequirePermissions(SYSTEM_PERMISSIONS.WORKORDER_READ)
  readOne(
    @CurrentScope() scope: TenantParkScope,
    @CurrentUser() actor: JwtPrincipal,
    @Param("id") id: string
  ): Promise<UserMessageEntity> {
    return this.workflowService.markMessageRead(scope, actor, id);
  }
}
