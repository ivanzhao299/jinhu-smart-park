import assert from "node:assert/strict";
import test from "node:test";
import type { RoleEntity } from "./entities/role.entity";
import { evaluateRoleAssignability } from "./role-assignability";

const scope = { tenantId: "tenant-a", parkId: "park-a" };

function role(values: Partial<RoleEntity>): RoleEntity {
  return {
    id: "role-1",
    code: "ROLE_1",
    name: "普通角色",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roleScope: "park",
    status: "enabled",
    isEnabled: true,
    isTemplate: false,
    isSystem: false,
    isBuiltin: false,
    isDeleted: false,
    ...values
  } as RoleEntity;
}

test("ordinary enabled tenant and park roles are assignable in the target scope", () => {
  assert.deepEqual(evaluateRoleAssignability(role({ roleScope: "tenant" }), scope), {
    isAssignable: true,
    isProtected: false,
    unassignableReasons: [],
    assignabilityLabel: "可分配"
  });
  assert.equal(evaluateRoleAssignability(role({ roleScope: "park" }), scope).isAssignable, true);
});

test("templates, protected roles, disabled roles and cross-scope roles expose reasons", () => {
  const template = evaluateRoleAssignability(role({ isTemplate: true }), scope);
  assert.equal(template.isAssignable, false);
  assert.equal(template.isProtected, true);
  assert.deepEqual(template.unassignableReasons, ["template"]);
  assert.equal(template.assignabilityLabel, "模板角色");

  const platform = evaluateRoleAssignability(role({ roleScope: "platform" }), scope);
  assert.equal(platform.isAssignable, false);
  assert.equal(platform.isProtected, true);
  assert(platform.unassignableReasons.includes("platform"));

  const disabledCrossPark = evaluateRoleAssignability(role({ parkId: "park-b", status: "disabled", isEnabled: false }), scope);
  assert.equal(disabledCrossPark.isAssignable, false);
  assert.deepEqual(disabledCrossPark.unassignableReasons, ["disabled", "cross_scope"]);
  assert.equal(disabledCrossPark.assignabilityLabel, "已停用、不属于当前目标园区");
});
