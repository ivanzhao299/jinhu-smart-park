import { ForbiddenException, Injectable } from "@nestjs/common";
import { EngineeringProjectAction } from "../domain/engineering-project-state-machine.types";
import type { EngineeringProjectTransitionContext } from "../domain/engineering-project-state-machine.types";

export const ENGINEERING_PROJECT_ACTION_PERMISSIONS: Record<EngineeringProjectAction, string> = {
  [EngineeringProjectAction.SUBMIT]: "ENGINEERING_PROJECT_SUBMIT",
  [EngineeringProjectAction.APPROVE]: "ENGINEERING_PROJECT_APPROVE",
  [EngineeringProjectAction.CANCEL]: "ENGINEERING_PROJECT_CANCEL",
  [EngineeringProjectAction.START_PLANNING]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.START_EXECUTION]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.START_INSPECTION]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.REQUIRE_RECTIFICATION]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.START_ACCEPTANCE]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.ACCEPTANCE_PASSED]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.ACCEPTANCE_FAILED]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.MARK_TRANSFER_READY]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.MARK_SETTLEMENT_READY]: "ENGINEERING_PROJECT_UPDATE",
  [EngineeringProjectAction.CLOSE]: "ENGINEERING_PROJECT_CLOSE",
  [EngineeringProjectAction.ARCHIVE]: "ENGINEERING_PROJECT_ARCHIVE"
};

@Injectable()
export class EngineeringProjectPolicy {
  assertCanPerform(action: EngineeringProjectAction, context: EngineeringProjectTransitionContext): void {
    const requiredPermission = this.requiredPermissionForAction(action);
    if (!context.actorPermissions || context.actorPermissions.length === 0) {
      return;
    }
    if (!context.actorPermissions.includes(requiredPermission)) {
      throw new ForbiddenException(`Missing permission ${requiredPermission} for engineering project action ${action}`);
    }
  }

  requiredPermissionForAction(action: EngineeringProjectAction): string {
    return ENGINEERING_PROJECT_ACTION_PERMISSIONS[action];
  }
}
