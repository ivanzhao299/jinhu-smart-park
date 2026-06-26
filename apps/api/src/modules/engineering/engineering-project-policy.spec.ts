import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { EngineeringProjectAction, type EngineeringProjectTransitionContext } from "./domain/engineering-project-state-machine.types";
import { EngineeringProjectPolicy } from "./policies/engineering-project.policy";

function contextWithPermissions(actorPermissions?: string[]): EngineeringProjectTransitionContext {
  return {
    tenantId: "tenant-a",
    parkId: "park-a",
    projectId: "00000000-0000-0000-0000-000000000101",
    actorUserId: "00000000-0000-0000-0000-000000000201",
    actorPermissions,
    reason: "权限测试"
  };
}

test("EngineeringProjectPolicy maps privileged actions to engineering permissions", () => {
  const policy = new EngineeringProjectPolicy();

  assert.equal(policy.requiredPermissionForAction(EngineeringProjectAction.SUBMIT), "ENGINEERING_PROJECT_SUBMIT");
  assert.equal(policy.requiredPermissionForAction(EngineeringProjectAction.APPROVE), "ENGINEERING_PROJECT_APPROVE");
  assert.equal(policy.requiredPermissionForAction(EngineeringProjectAction.CLOSE), "ENGINEERING_PROJECT_CLOSE");
});

test("EngineeringProjectPolicy enforces actor permissions when provided", () => {
  const policy = new EngineeringProjectPolicy();

  assert.doesNotThrow(() =>
    policy.assertCanPerform(EngineeringProjectAction.SUBMIT, contextWithPermissions(["ENGINEERING_PROJECT_SUBMIT"]))
  );
  assert.throws(
    () => policy.assertCanPerform(EngineeringProjectAction.SUBMIT, contextWithPermissions(["ENGINEERING_PROJECT_UPDATE"])),
    ForbiddenException
  );
});
