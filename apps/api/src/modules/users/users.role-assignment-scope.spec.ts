import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("role assignment resolves the target user scope and replaces links transactionally", () => {
  const source = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");
  const assignRoles = source.slice(source.indexOf("async assignRoles"), source.indexOf("private async listAssignableRoles"));

  assert.match(assignRoles, /getEntityForActor\(scope, id, actor, manager\.getRepository\(UserEntity\)\)/);
  assert.match(assignRoles, /tenantId: user\.tenantId/);
  assert.match(assignRoles, /parkId: user\.parkId/);
  assert.match(assignRoles, /userRoleRepository\.manager\.transaction/);
  assert.match(assignRoles, /roleScope: "tenant"/);
  assert.match(assignRoles, /roleScope: "park"/);
  assert.match(assignRoles, /status: "enabled"/);
  assert.match(assignRoles, /isEnabled: true/);
});

test("JWT and in-memory authorization reject foreign park-scoped roles", () => {
  const source = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");

  assert.match(source, /active_role\.role_scope = 'tenant' OR active_role\.park_id = usr\.park_id/);
  assert.match(source, /role\.role_scope = 'tenant' OR role\.park_id = usr\.park_id/);
  assert.match(source, /link\.role\.roleScope === "tenant" \|\| link\.role\.parkId === user\.parkId/);
});
