import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("role assignment resolves the target user scope and replaces links transactionally", () => {
  const source = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");
  const assignRoles = source.slice(source.indexOf("async assignRoles"), source.indexOf("private async listAssignableRolePage"));

  assert.match(assignRoles, /getEntityForActor\(scope, id, actor, manager\.getRepository\(UserEntity\)\)/);
  assert.match(assignRoles, /tenantId: user\.tenantId/);
  assert.match(assignRoles, /parkId: user\.parkId/);
  assert.match(assignRoles, /userRoleRepository\.manager\.transaction/);
  assert.match(assignRoles, /setLock\("pessimistic_read"\)/);
  assert.match(assignRoles, /role\.role_scope='tenant'/);
  assert.match(assignRoles, /role\.role_scope='park'/);
  assert.match(assignRoles, /role\.status='enabled' AND role\.is_enabled=true/);
  assert.match(assignRoles, /!this\.isRoleAssignmentProtected\(link\.role\)/);
});

test("role candidate catalog is paginated and keeps the legacy array contract opt-out", () => {
  const source = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");
  const controllerSource = readFileSync(resolve(__dirname, "users.controller.ts"), "utf8");

  assert.match(controllerSource, /UserRoleCandidatesQueryDto/);
  assert.match(source, /query\.paged \? candidatePage : candidatePage\.items/);
  assert.match(source, /private async listAssignableRolePage/);
  assert.match(source, /\.skip\(\(query\.page - 1\) \* query\.page_size\)/);
  assert.match(source, /\.take\(query\.page_size\)/);
  assert.match(source, /addOrderBy\("role\.code", "ASC"\)/);
  assert.match(source, /addOrderBy\("role\.id", "ASC"\)/);
  assert.match(source, /hasMore: query\.page \* query\.page_size < total/);
});

test("JWT and in-memory authorization reject foreign park-scoped roles", () => {
  const source = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");

  assert.match(source, /active_role\.role_scope = 'tenant' OR active_role\.park_id = \$3/);
  assert.match(source, /role\.role_scope = 'tenant' OR role\.park_id = \$3/);
  assert.match(source, /link\.role\.roleScope === "tenant" \|\| link\.role\.parkId === user\.parkId/);
});
