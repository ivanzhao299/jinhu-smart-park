import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS,
  PROPERTY_BUSINESS_SURFACES,
  SYSTEM_PERMISSION_SEEDS
} from "@jinhu/shared";

const migrationPath = resolve(
  __dirname,
  "../../../../../database/migrations/000283_long_rent_display_name_reconcile.sql"
);
const sql = readFileSync(migrationPath, "utf8");
const approvalRuntimeSource = readFileSync(
  resolve(__dirname, "../property-approvals/outbox/property-event-runtime.repository.ts"),
  "utf8"
);
const runtimeRequire = createRequire(__filename);

function expectedPermissionNames(): Map<string, string> {
  return new Map(
    SYSTEM_PERMISSION_SEEDS
      .filter((seed) => seed.code === "housing_rental" || seed.code === "housing_rental:operations" || seed.code.startsWith("housing:"))
      .map((seed) => [seed.code, seed.name])
  );
}

test("long-rent surfaces and permission display names are canonical while stable codes remain unchanged", () => {
  const housingSurfaces = PROPERTY_BUSINESS_SURFACES.filter(
    (surface) => surface.moduleCode === "housing_rental"
  );
  assert.equal(housingSurfaces.length, 9);
  assert.deepEqual(housingSurfaces.map((surface) => surface.label), [
    "运营看板", "待办任务", "租客档案", "租约管理", "交割管理",
    "账单管理", "财务管理", "报修管理", "采购管理"
  ]);
  assert.deepEqual(housingSurfaces.map((surface) => surface.menuCode), Array(9).fill("housing_rental"));
  assert.ok(housingSurfaces.every((surface) => surface.pageCode.startsWith("housing:")));

  const pageNames = PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS
    .filter((seed) => seed.code.startsWith("housing:"))
    .map((seed) => seed.name);
  assert.ok(pageNames.every((name) => name.startsWith("长租")));
});

test("migration reconciles each existing tenant permission by tenant and code without changing authorization bindings", () => {
  const expected = expectedPermissionNames();
  assert.equal(expected.size, 33);
  for (const [code, name] of expected) {
    assert.ok(
      sql.includes(`('${code}', '${name.replace(/页面$/u, "")}')`),
      `expected migration mapping for ${code}`
    );
  }

  for (const value of [
    "affected_tenants",
    "tenant.tenant_id, definition.code",
    "permission.tenant_id = tenant.tenant_id",
    "permission.code = definition.code",
    "GROUP BY tenant.tenant_id, definition.code",
    "row_count <> 1",
    "long-rent-permission-cardinality-drift",
    "long-rent-registry-cardinality-drift",
    "long-rent-registry-name-reconcile-failed",
    "long-rent-permission-name-reconcile-failed"
  ]) {
    assert.ok(sql.includes(value), `expected per-tenant reconcile contract: ${value}`);
  }
  assert.match(sql, /UPDATE sys_permission permission\s+SET name = definition\.expected_name/u);
  assert.match(sql, /UPDATE sys_module\s+SET module_name = '长租经营'/u);
  assert.match(sql, /UPDATE sys_module_registry\s+SET module_name = '长租经营'/u);
  assert.doesNotMatch(sql, /UPDATE\s+rel_role_perm|INSERT\s+INTO\s+rel_role_perm|DELETE\s+FROM\s+rel_role_perm/iu);
  assert.doesNotMatch(sql, /SET\s+code\s*=/iu);
});

test("the same name-only mapping converges two tenants independently and leaves unrelated codes unchanged", () => {
  const expected = expectedPermissionNames();
  const rows = [
    { tenantId: "tenant-a", code: "housing_rental", name: "住房出租" },
    { tenantId: "tenant-a", code: "housing:lease:read", name: "住房租约读取" },
    { tenantId: "tenant-b", code: "housing_rental", name: "旧长租入口" },
    { tenantId: "tenant-b", code: "housing:lease:read", name: "旧租约读取" },
    { tenantId: "tenant-b", code: "asset:read", name: "资产读取" }
  ];
  const reconciled = rows.map((row) => ({
    ...row,
    name: expected.get(row.code) ?? row.name
  }));

  assert.deepEqual(
    reconciled.filter((row) => row.code === "housing_rental").map((row) => [row.tenantId, row.name]),
    [["tenant-a", "长租经营"], ["tenant-b", "长租经营"]]
  );
  assert.deepEqual(
    reconciled.filter((row) => row.code === "housing:lease:read").map((row) => [row.tenantId, row.name]),
    [["tenant-a", "长租租约读取"], ["tenant-b", "长租租约读取"]]
  );
  assert.deepEqual(reconciled.at(-1), rows.at(-1));
});

test("every housing approval incident title uses the long-rent display terminology", () => {
  const housingTitleLines = approvalRuntimeSource
    .split("\n")
    .filter((line) => line.includes('"housing.') && line.includes("审批执行异常"));
  assert.equal(housingTitleLines.length, 7);
  assert.ok(housingTitleLines.every((line) => line.includes('"长租')));
  assert.ok(housingTitleLines.every((line) => !line.includes("住房")));
});

test("PostgreSQL executes the reconcile twice for two tenants and fails closed on a missing permission", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const { Client } = runtimeRequire("pg") as {
    Client: new (options: { connectionString: string }) => {
      connect(): Promise<void>;
      end(): Promise<void>;
      query<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values?: unknown[]
      ): Promise<{ rows: T[] }>;
    };
  };
  const client = new Client({ connectionString: process.env.DATABASE_URL! });
  await client.connect();
  try {
    await client.query(`
      CREATE TEMP TABLE sys_module (
        module_code varchar(128), module_name varchar(100), is_deleted boolean, update_time timestamptz
      );
      CREATE TEMP TABLE sys_module_registry (
        tenant_id varchar(64), park_id varchar(64), module_code varchar(128),
        module_name varchar(100), is_deleted boolean, update_time timestamptz
      );
      CREATE TEMP TABLE sys_permission (
        id varchar(64), tenant_id varchar(64), code varchar(128), name varchar(100),
        is_deleted boolean, update_time timestamptz
      );
      INSERT INTO sys_module VALUES ('housing_rental', '住房出租', false, now());
      INSERT INTO sys_module_registry VALUES
        ('tenant-a', 'park-a', 'housing_rental', '住房出租', false, now()),
        ('tenant-b', 'park-b', 'housing_rental', '旧长租入口', false, now());
    `);
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      for (const [code] of expectedPermissionNames()) {
        await client.query(
          "INSERT INTO sys_permission VALUES (md5($1 || ':' || $2), $1, $2, '旧显示名', false, now())",
          [tenantId, code]
        );
      }
    }
    await client.query(
      "INSERT INTO sys_permission VALUES (md5('tenant-b:asset:read'), 'tenant-b', 'asset:read', '资产读取', false, now())"
    );

    await client.query(sql);
    await client.query(sql);

    const permissions = await client.query<{ tenant_id: string; code: string; name: string }>(
      "SELECT tenant_id, code, name FROM sys_permission ORDER BY tenant_id, code"
    );
    for (const row of permissions.rows.filter((item) => item.code !== "asset:read")) {
      assert.equal(row.name, expectedPermissionNames().get(row.code));
    }
    assert.deepEqual(
      permissions.rows.find((item) => item.code === "asset:read"),
      { tenant_id: "tenant-b", code: "asset:read", name: "资产读取" }
    );
    const countResult = await client.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM sys_permission"
    );
    assert.equal(countResult.rows[0]?.count, expectedPermissionNames().size * 2 + 1);

    await client.query(
      "DELETE FROM sys_permission WHERE tenant_id = 'tenant-b' AND code = 'housing:lease:read'"
    );
    await assert.rejects(client.query(sql), /long-rent-permission-cardinality-drift/u);
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
});
