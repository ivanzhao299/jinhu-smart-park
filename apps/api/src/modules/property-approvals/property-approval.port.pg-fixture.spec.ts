import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  APPROVAL_PORT_PG_DATA_TABLES_IN_DELETE_ORDER,
  approvalPortPgDataResidue,
  approvalPortPgFixtureNames,
  approvalPortPgRunId,
  cleanupApprovalPortPgFixture,
  cleanupApprovalPortPgRunData,
  cleanupErrorPreservingPrimary,
  setupApprovalPortPgFixture,
  type ApprovalPortPgFixtureAudit,
  type ApprovalPortPgFixtureNames,
  type ApprovalPortPgQueryExecutor
} from "./property-approval.port.pg-fixture";

class FixtureExecutor implements ApprovalPortPgQueryExecutor {
  readonly objects = new Set<string>();
  readonly rows = new Map<string, number>(
    APPROVAL_PORT_PG_DATA_TABLES_IN_DELETE_ORDER.map((table) => [table, 0])
  );
  mutationCount = 0;
  failMutationAt: number | null = null;
  readonly queries: string[] = [];

  constructor(
    private readonly names: ApprovalPortPgFixtureNames,
    private readonly authority = {
      database: "jinhu_b2c197_v11v6_direct_v31_20260803a",
      user: "postgres",
      version: "160014"
    },
    private readonly nonRunRows: Array<{ tableName: string; rowCount: number }> = [],
    private readonly authorityFailure = false
  ) {}

  async query(sql: string): Promise<unknown> {
    this.queries.push(sql);
    if (sql.includes("current_database()")) {
      if (this.authorityFailure) throw new Error("authority probe failed");
      return [this.authority];
    }
    if (sql.includes("WHERE tenant_id<>")) return this.nonRunRows;
    if (sql.includes("SELECT object_kind AS")) {
      return [...this.objects].sort().map((entry) => {
        const [objectKind, objectName] = entry.split(":");
        return { objectKind, objectName };
      });
    }
    if (sql.includes("SELECT table_name AS")) {
      return [...this.rows]
        .filter(([, rowCount]) => rowCount !== 0)
        .map(([tableName, rowCount]) => ({ tableName, rowCount }))
        .sort((left, right) => left.tableName.localeCompare(right.tableName));
    }
    const mutation = /CREATE |DROP /u.test(sql);
    if (mutation) {
      this.mutationCount += 1;
      if (this.mutationCount === this.failMutationAt) throw new Error("injected setup failure");
    }
    if (sql.includes("CREATE TABLE")) this.objects.add(`relation:${this.names.sentinelTable}`);
    if (sql.includes("CREATE FUNCTION")) this.objects.add(`function:${this.names.faultFunction}`);
    if (sql.includes("CREATE TRIGGER")) this.objects.add(`trigger:${this.names.faultTrigger}`);
    if (sql.includes("DROP TRIGGER")) this.objects.delete(`trigger:${this.names.faultTrigger}`);
    if (sql.includes("DROP FUNCTION")) this.objects.delete(`function:${this.names.faultFunction}`);
    if (sql.includes("DROP TABLE")) this.objects.delete(`relation:${this.names.sentinelTable}`);
    for (const match of sql.matchAll(/DELETE FROM public\."([a-z0-9_]+)"/gu)) {
      this.rows.set(match[1]!, 0);
    }
    return [];
  }
}

test("PG fixture run IDs derive unique safe run-scoped identifiers", () => {
  const first = approvalPortPgFixtureNames("0123456789abcdef0123456789abcdef");
  const second = approvalPortPgFixtureNames("fedcba9876543210fedcba9876543210");
  assert.notEqual(first.sentinelTable, second.sentinelTable);
  for (const names of [first, second]) {
    for (const identifier of [
      names.sentinelTable, names.faultFunction, names.faultTrigger,
      names.applicationName, names.observerApplicationName, names.setupApplicationName,
      names.cleanupApplicationName, names.auditorApplicationName
    ]) {
      assert.match(identifier, /^[a-z_][a-z0-9_]{0,62}$/u);
      assert.ok(identifier.includes(names.runId));
    }
    assert.equal(names.faultSetting, `jinhu.b2c_ap_${names.runId}_fault`);
  }
  for (const invalid of [
    "", "A".repeat(32), "0".repeat(31), "0".repeat(33),
    "../../unsafe00000000000000000000", "0".repeat(31) + "-"
  ]) assert.throws(() => approvalPortPgRunId(invalid));
});

test("partial fixture setup is auditable and idempotent cleanup reaches zero residue", async () => {
  const names = approvalPortPgFixtureNames("11111111111111111111111111111111");
  for (const failMutationAt of [2, 4]) {
    const executor = new FixtureExecutor(names);
    executor.failMutationAt = failMutationAt;
    const audit: ApprovalPortPgFixtureAudit = { setup: [], cleanup: [] };
    await assert.rejects(setupApprovalPortPgFixture(executor, names, audit));
    assert.equal(audit.setup[0], "zero-residue-preflight");
    executor.failMutationAt = null;
    const first = await cleanupApprovalPortPgFixture(executor, names, audit);
    assert.deepEqual(first, { errors: [], residue: [] });
    const second = await cleanupApprovalPortPgFixture(executor, names, audit);
    assert.deepEqual(second, { errors: [], residue: [] });
    assert.equal(audit.cleanup.filter((step) => step === "zero-residue-postcheck").length, 2);
  }
});

test("cleanup diagnostics preserve the primary Gate failure", () => {
  const primary = new Error("primary assertion failure");
  assert.equal(
    cleanupErrorPreservingPrimary(primary, { errors: [], residue: [] }),
    primary
  );
  const combined = cleanupErrorPreservingPrimary(primary, {
    errors: [new Error("drop failed")],
    residue: [{ objectKind: "relation", objectName: "leftover" }]
  });
  assert.ok(combined instanceof AggregateError);
  assert.equal(combined.cause, primary);
  assert.equal(combined.errors.length, 2);
});

test("run-scoped data cleanup is ordered, idempotent and reaches zero residue", async () => {
  const names = approvalPortPgFixtureNames("22222222222222222222222222222222");
  const executor = new FixtureExecutor(names);
  executor.rows.set("biz_property_approval_request", 2);
  executor.rows.set("biz_property_mutation_receipt", 1);
  assert.equal((await approvalPortPgDataResidue(executor, "tenant", "park")).length, 2);
  const audit: ApprovalPortPgFixtureAudit = { setup: [], cleanup: [] };
  assert.deepEqual(await cleanupApprovalPortPgRunData(
    executor, "tenant", "park", audit
  ), []);
  assert.deepEqual(await approvalPortPgDataResidue(executor, "tenant", "park"), []);
  assert.deepEqual(await cleanupApprovalPortPgRunData(
    executor, "tenant", "park", audit
  ), []);
  assert.deepEqual(
    audit.cleanup.slice(0, APPROVAL_PORT_PG_DATA_TABLES_IN_DELETE_ORDER.length),
    APPROVAL_PORT_PG_DATA_TABLES_IN_DELETE_ORDER.map((table) => `delete-run-data:${table}`)
  );
});

test("isolated immutable cleanup is fail-closed and uses a transaction-local trigger bypass", async () => {
  const names = approvalPortPgFixtureNames("44444444444444444444444444444444");
  const executor = new FixtureExecutor(names);
  executor.rows.set("biz_property_approval_request", 2);
  executor.rows.set("biz_property_mutation_receipt", 1);
  const audit: ApprovalPortPgFixtureAudit = { setup: [], cleanup: [] };
  assert.deepEqual(await cleanupApprovalPortPgRunData(
    executor,
    "b2c-44444444444444444444444444444444",
    "b2c-44444444444444444444444444444444",
    audit,
    {
      isolatedImmutableBypass: true,
      expectedDatabase: "jinhu_b2c197_v11v6_direct_v31_20260803a"
    }
  ), []);
  assert.deepEqual(await approvalPortPgDataResidue(
    executor,
    "b2c-44444444444444444444444444444444",
    "b2c-44444444444444444444444444444444"
  ), []);
  assert.deepEqual(audit.cleanup.slice(0, 2), [
    "isolated-immutable-cleanup-preflight",
    "isolated-immutable-trigger-bypass"
  ]);
  assert.equal((await cleanupApprovalPortPgRunData(
    executor, "tenant", "park", { setup: [], cleanup: [] },
    { isolatedImmutableBypass: true, expectedDatabase: "production" }
  )).length, 1);
});

test("isolated immutable cleanup rejects every authority drift before trigger bypass or delete", async () => {
  const names = approvalPortPgFixtureNames("55555555555555555555555555555555");
  const scope = "b2c-55555555555555555555555555555555";
  const database = "jinhu_b2c197_v11v6_direct_v31_20260803a";
  const cases = [
    new FixtureExecutor(names, { database: `${database}_other`, user: "postgres", version: "160014" }),
    new FixtureExecutor(names, { database, user: "app", version: "160014" }),
    new FixtureExecutor(names, { database, user: "postgres", version: "150014" }),
    new FixtureExecutor(names, { database, user: "postgres", version: "160014" }, [
      { tableName: "biz_property_approval_request", rowCount: 1 }
    ])
  ];
  for (const executor of cases) {
    const errors = await cleanupApprovalPortPgRunData(
      executor, scope, scope, { setup: [], cleanup: [] },
      { isolatedImmutableBypass: true, expectedDatabase: database }
    );
    assert.equal(errors.length, 1);
    assert.equal(executor.queries.some((sql) => sql.includes("session_replication_role")), false);
    assert.equal(executor.queries.some((sql) => sql.includes("DELETE FROM")), false);
  }
  for (const [tenantId, parkId, expectedDatabase] of [
    [scope, `${scope}0`, database],
    ["tenant", "tenant", database],
    [scope, scope, "production"]
  ] as const) {
    const executor = new FixtureExecutor(names);
    const errors = await cleanupApprovalPortPgRunData(
      executor, tenantId, parkId, { setup: [], cleanup: [] },
      { isolatedImmutableBypass: true, expectedDatabase }
    );
    assert.equal(errors.length, 1);
    assert.deepEqual(executor.queries, []);
  }
  const failedProbe = new FixtureExecutor(
    names, { database, user: "postgres", version: "160014" }, [], true
  );
  await assert.rejects(cleanupApprovalPortPgRunData(
    failedProbe, scope, scope, { setup: [], cleanup: [] },
    { isolatedImmutableBypass: true, expectedDatabase: database }
  ));
  assert.equal(failedProbe.queries.some((sql) => sql.includes("session_replication_role")), false);
  assert.equal(failedProbe.queries.some((sql) => sql.includes("DELETE FROM")), false);
  const defaultPath = new FixtureExecutor(names);
  await cleanupApprovalPortPgRunData(defaultPath, scope, scope, { setup: [], cleanup: [] });
  assert.equal(defaultPath.queries.some((sql) => sql.includes("session_replication_role")), false);
});

test("PG suite statically retains seven tests and guarded lifecycle/session cleanup", () => {
  const source = readFileSync(
    resolve(__dirname, "property-approval.port.pg.spec.ts"),
    "utf8"
  );
  assert.equal((source.match(/^ {2}pgIt\(/gmu) ?? []).length, 7);
  for (const required of [
    "setupApprovalPortPgFixture",
    "cleanupAfterPartialSetup",
    "cleanupErrorPreservingPrimary",
    "independentZeroResidueAndSessionPostcheck",
    "approvalPortPgResidue",
    "pg_stat_activity",
    "openRunners",
    "closeOpenRunners",
    "withCallerRunner",
    "finally"
  ]) assert.ok(source.includes(required), required);
  assert.match(source, /applicationName: fixtureNames\.applicationName/u);
  assert.match(source, /applicationName: fixtureNames\.observerApplicationName/u);
  assert.match(source, /applicationName: fixtureNames\.auditorApplicationName/u);
});
