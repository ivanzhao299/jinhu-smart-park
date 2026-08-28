import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { UsersService } from "./users.service";

const TENANT_ID = "10000001";
const PARK_ID = "20000001";
const USER_ID = "00000000-0000-0000-0000-000000000001";

function createService(query: (sql: string, parameters: unknown[]) => Promise<unknown[]>): UsersService {
  return new UsersService(
    { query } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    user_username: "operator",
    user_display_name: "Operator",
    user_tenant_id: TENANT_ID,
    user_park_id: PARK_ID,
    user_is_enabled: true,
    user_status: "enabled",
    is_tenant_super: false,
    role_link_id: "00000000-0000-0000-0000-000000000011",
    role_code: "PROPERTY_OPERATOR",
    role_is_super: false,
    role_data_scope: "park",
    permission_code: "homestay:booking:read",
    ...overrides
  };
}

test("JWT principal query binds the current user scope and selects only active live grants", async () => {
  let capturedSql = "";
  let capturedParameters: unknown[] = [];
  const service = createService(async (sql, parameters) => {
    capturedSql = sql;
    capturedParameters = parameters;
    return [
      row(),
      row({ permission_code: "homestay:booking:read" }),
      row({ permission_code: "housing:lease:read" }),
      row({
        role_link_id: "00000000-0000-0000-0000-000000000012",
        role_code: "TENANT_AUDITOR",
        role_data_scope: "tenant",
        permission_code: null
      })
    ];
  });

  const principal = await service.resolveJwtPrincipal(
    { tenantId: TENANT_ID, parkId: PARK_ID },
    USER_ID
  );

  assert.deepEqual(capturedParameters, [USER_ID, TENANT_ID, PARK_ID]);
  assert.match(capturedSql, /candidate\.id = \$1::uuid/);
  assert.match(capturedSql, /user_role\.tenant_id = usr\.tenant_id/);
  assert.match(capturedSql, /user_role\.park_id = \$3/);
  assert.match(capturedSql, /active_role\.role_scope = 'tenant' OR active_role\.park_id = \$3/);
  assert.match(capturedSql, /role\.role_scope = 'tenant' OR role\.park_id = \$3/);
  assert.match(capturedSql, /role_permission\.park_id = \$3/);
  assert.match(capturedSql, /FROM rel_user_park access/);
  assert.match(capturedSql, /NOT EXISTS \([\s\S]*FROM rel_user_park explicit_home/);
  assert.match(capturedSql, /active_permission\.tenant_id = usr\.tenant_id/);
  assert.match(capturedSql, /tenant_super_role\.code = 'SUPER_ADMIN'/);
  assert.match(capturedSql, /tenant_super_role\.role_scope = 'platform'/);
  assert.match(capturedSql, /tenant_super_role\.is_super = true/);
  assert.match(capturedSql, /tenant_super_role\.is_system = true/);
  assert.match(capturedSql, /tenant_super_role\.is_builtin = true/);
  assert.match(capturedSql, /WITH principal_user AS MATERIALIZED/);
  assert.match(capturedSql, /WHERE \(\s*usr\.is_tenant_super\s*OR/);
  assert.equal(capturedSql.match(/FROM rel_user_role tenant_super_link/g)?.length, 1);
  assert.doesNotMatch(capturedSql, /tenant_super_access_link/);
  assert.deepEqual(principal.roles, ["PROPERTY_OPERATOR", "TENANT_AUDITOR"]);
  assert.deepEqual(principal.permissions, [
    "homestay:booking:read",
    "housing:lease:read",
    SYSTEM_PERMISSIONS.USER_ME
  ]);
  assert.equal(principal.dataScope, "tenant");
  assert.equal(principal.isSuper, false);
  assert.equal(principal.isTenantSuper, false);
});

test("JWT principal applies a protected tenant super binding without target-park role or access links", async () => {
  const service = createService(async () => [
    row({
      user_park_id: "source-park",
      is_tenant_super: true,
      role_link_id: null,
      role_code: null,
      role_is_super: null,
      role_data_scope: null,
      permission_code: null
    })
  ]);

  const principal = await service.resolveJwtPrincipal(
    { tenantId: TENANT_ID, parkId: "future-park" },
    USER_ID
  );

  assert.deepEqual(principal.roles, ["SUPER_ADMIN"]);
  assert.deepEqual(principal.permissions, ["*"]);
  assert.equal(principal.dataScope, "all");
  assert.equal(principal.isSuper, true);
  assert.equal(principal.isTenantSuper, true);
});

test("JWT principal adopts an enabled secondary park access scope", async () => {
  const service = createService(async () => [row({ user_park_id: "source-park" })]);
  const principal = await service.resolveJwtPrincipal(
    { tenantId: TENANT_ID, parkId: "secondary-park" },
    USER_ID
  );
  assert.equal(principal.parkId, "secondary-park");
});

test("JWT principal grants the current-user permission to an active user without roles", async () => {
  const service = createService(async () => [
    row({
      role_link_id: null,
      role_code: null,
      role_is_super: null,
      role_data_scope: null,
      permission_code: null
    })
  ]);

  const principal = await service.resolveJwtPrincipal(
    { tenantId: TENANT_ID, parkId: PARK_ID },
    USER_ID
  );

  assert.deepEqual(principal.roles, []);
  assert.deepEqual(principal.permissions, [SYSTEM_PERMISSIONS.USER_ME]);
  assert.equal(principal.dataScope, "self");
  assert.equal(principal.isSuper, false);
});

test("JWT principal query preserves wildcard super semantics", async () => {
  const service = createService(async () => [row({ permission_code: "*" })]);

  const principal = await service.resolveJwtPrincipal(
    { tenantId: TENANT_ID, parkId: PARK_ID },
    USER_ID
  );

  assert.deepEqual(principal.permissions, ["*"]);
  assert.equal(principal.dataScope, "all");
  assert.equal(principal.isSuper, true);
  assert.equal(principal.isTenantSuper, false);
});

test("JWT principal query rejects missing and disabled live users", async () => {
  const missing = createService(async () => []);
  await assert.rejects(
    missing.resolveJwtPrincipal({ tenantId: TENANT_ID, parkId: PARK_ID }, USER_ID),
    (error: unknown) => error instanceof NotFoundException && error.message === "User not found"
  );

  const disabled = createService(async () => [row({ user_is_enabled: false })]);
  await assert.rejects(
    disabled.resolveJwtPrincipal({ tenantId: TENANT_ID, parkId: PARK_ID }, USER_ID),
    (error: unknown) => error instanceof NotFoundException && error.message === "User not found"
  );
});
