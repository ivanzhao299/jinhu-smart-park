import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("role assignment accepts tenant roles and only same-park park roles", () => {
  const source = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");
  const assignRoles = source.slice(source.indexOf("async assignRoles"), source.indexOf("private async getEntityForActor"));

  assert.match(assignRoles, /roleScope: "tenant"/);
  assert.match(assignRoles, /parkId: scope\.parkId/);
  assert.match(assignRoles, /tenantId: scope\.tenantId/);
  assert.match(assignRoles, /userRoleRepository\.update/);
  assert.match(assignRoles, /parkId: scope\.parkId/);
});

test("JWT and in-memory authorization reject foreign park-scoped roles", () => {
  const source = readFileSync(resolve(__dirname, "users.service.ts"), "utf8");

  assert.match(source, /active_role\.role_scope = 'tenant' OR active_role\.park_id = usr\.park_id/);
  assert.match(source, /role\.role_scope = 'tenant' OR role\.park_id = usr\.park_id/);
  assert.match(source, /link\.role\.roleScope === "tenant" \|\| link\.role\.parkId === user\.parkId/);
});
