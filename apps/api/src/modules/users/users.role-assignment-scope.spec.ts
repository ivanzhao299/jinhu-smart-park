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

test("explicit park-role endpoint carries target park through DTO, service authorization, and audit scope", () => {
  const source = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");
  const controllerSource = readFileSync(resolve(__dirname, "users.controller.ts"), "utf8");
  const dtoSource = readFileSync(resolve(__dirname, "dto/assign-roles.dto.ts"), "utf8");

  assert.match(controllerSource, /@Post\(":id\/park-roles"\)/);
  assert.match(controllerSource, /AssignParkRolesDto/);
  assert.match(controllerSource, /captureBody: false/);
  assert.match(controllerSource, /assignParkRoles\(scope, user, id, dto/);
  assert.match(dtoSource, /parkId!: string/);
  assert.match(source, /getTargetParkRoleUser\(scope, actor, id, parkId, manager\)/);
  assert.match(source, /!actor\.isTenantSuper && targetParkId !== actor\.parkId/);
  assert.match(source, /onTargetScope\?\.\(targetScope\)/);
  assert.match(source, /parkId: targetScope\.parkId/);
  assert.match(source, /actor\.permissions\.includes\(SYSTEM_PERMISSIONS\.USER_DETAIL\)/);
  assert.match(source, /actor\.permissions\.includes\(SYSTEM_PERMISSIONS\.USER_ASSIGN_ROLES\)/);
  assert.match(source, /roleLinks: includeRoleDiagnostics \? userRoleLinks : undefined/);
  assert.match(source, /userParkRepository\.find\(/);
  assert.match(source, /EXISTS \([\s\S]*FROM rel_user_park access/);
  assert.match(source, /getManyAndCount\(\)/);
  assert.match(source, /toViews\(items, this\.canViewRoleDiagnostics\(actor\), scope\.parkId\)/);
  assert.match(source, /globalRoleManager = Boolean\(!actor\.isTenantSuper && \(actor\.isSuper \|\| actor\.permissions\.includes\("\*"\)\)\)/);
  assert.match(source, /platformGlobalManager = Boolean\(actor && !actor\.isTenantSuper/);
  assert.match(source, /!platformGlobalManager && actor \? \{ tenantId: actor\.tenantId \}/);
  assert.match(source, /broadRoleDiagnostics \? undefined : scope\.parkId/);
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
  const usersSource = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");
  const identitySource = readFileSync(resolve(__dirname, "identity-directory.service.ts"), "utf8");

  assert.match(identitySource, /active_role\.role_scope = 'tenant' OR active_role\.park_id = \$3/);
  assert.match(identitySource, /role\.role_scope = 'tenant' OR role\.park_id = \$3/);
  assert.match(usersSource, /return this\.identityDirectory\.resolveJwtPrincipal\(scope, id\)/);
  assert.match(usersSource, /link\.role\.roleScope === "tenant" \|\| link\.role\.parkId === user\.parkId/);
});
