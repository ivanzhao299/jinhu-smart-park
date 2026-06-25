import { Controller, Get } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { CurrentScope } from "../../shared/decorators/current-scope.decorator";
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import { RequireModule } from "../../shared/decorators/modules.decorator";
import { RequirePermissions } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
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
}
