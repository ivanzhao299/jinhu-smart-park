import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { RecordOperationInput } from "../audit/audit.service";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";
import { HrPerformanceLegacyRelationsService } from "./hr-performance-legacy-relations.service";

const enabled = process.env.HR_PERFORMANCE_POST_IMPORT_API_PG === "1";

// Only the owning synthetic total-writer runner enables this test. It does not
// create schema, materialize fixtures, promote maps or alter batch context.
test("actual total-writer data is visible through HR services and disappears after rollback", {
  skip: !enabled,
}, async () => {
  const host = process.env.POSTGRES_HOST ?? "";
  const port = Number(process.env.POSTGRES_PORT ?? "0");
  const database = process.env.POSTGRES_DB ?? "";
  const username = process.env.POSTGRES_USER ?? "";
  const password = process.env.POSTGRES_PASSWORD ?? "";
  const operationId = process.env.HR_PERFORMANCE_POST_IMPORT_OPERATION_ID ?? "";
  const state = process.env.HR_PERFORMANCE_POST_IMPORT_STATE ?? "applied";
  const scope: TenantParkScope = {
    tenantId: process.env.HR_PERFORMANCE_POST_IMPORT_TENANT_ID ?? "",
    parkId: process.env.HR_PERFORMANCE_POST_IMPORT_PARK_ID ?? "",
  };
  assert.ok(["127.0.0.1", "::1", "localhost"].includes(host));
  assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
  assert.match(database, /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u);
  assert.match(username, /^[A-Za-z0-9_]{1,63}$/u);
  assert.ok(password.length > 0);
  assert.ok(operationId.length > 0 && operationId.length <= 128);
  assert.ok(scope.tenantId.length > 0 && scope.tenantId.length <= 64);
  assert.ok(scope.parkId.length > 0 && scope.parkId.length <= 64);
  assert.ok(state === "applied" || state === "rolled_back");
  const applied = state === "applied";

  const dataSource = new DataSource({
    type: "postgres",
    host,
    port,
    database,
    username,
    password,
    entities: [],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      max: 1,
      options: "-c default_transaction_read_only=on -c statement_timeout=15000",
    },
  });
  await dataSource.initialize();
  try {
    const connection = await dataSource.query(
      "SELECT current_database() AS database,current_user AS username,current_setting('transaction_read_only') AS read_only",
    ) as Array<{ database: string; username: string; read_only: string }>;
    assert.deepEqual(connection, [{ database, username, read_only: "on" }]);

    const evidence = await dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM hr_yuzhou_production_import_operation
          WHERE operation_id=$1 AND target_tenant_id=$2 AND target_park_id=$3
            AND status='succeeded') AS operations,
        (SELECT count(*)::int FROM hr_yuzhou_production_import_rollback_operation rollback_op
          JOIN hr_yuzhou_production_import_operation operation
            ON operation.operation_id=rollback_op.import_operation_id
           AND operation.sealed_plan_sha256=rollback_op.sealed_plan_sha256
          WHERE rollback_op.import_operation_id=$1 AND rollback_op.status='succeeded') AS rollbacks,
        (SELECT count(*)::int FROM hr_yuzhou_performance_facts_production_receipt
          WHERE operation_id=$1 AND status=$4)+
        (SELECT count(*)::int FROM hr_yuzhou_performance_relations_production_receipt
          WHERE operation_id=$1 AND status=$4)+
        (SELECT count(*)::int FROM hr_yuzhou_performance_fact_identity_production_receipt
          WHERE operation_id=$1 AND status=$4) AS receipts,
        (SELECT count(*)::int FROM legacy_record_map map
          JOIN migration_batch batch ON batch.id=map.batch_id
          JOIN hr_yuzhou_production_import_operation operation
            ON operation.operation_id=batch.production_import_operation_id
          WHERE batch.production_import_operation_id=$1
            AND operation.target_tenant_id=$2 AND operation.target_park_id=$3
            AND map.target_table LIKE 'hr_performance_legacy_%'
            AND map.is_active AND map.mapping_status='verified'
            AND batch.execution_context='production_import'
            AND batch.status='succeeded') AS visible_maps,
        (SELECT count(*)::int FROM legacy_record_map map
          JOIN migration_batch batch ON batch.id=map.batch_id
          WHERE batch.production_import_operation_id=$1
            AND map.target_table LIKE 'hr_performance_legacy_%'
            AND map.is_active AND map.mapping_status<>'verified') AS incomplete_maps`,
      [operationId, scope.tenantId, scope.parkId, applied ? "succeeded" : "rolled_back"],
    ) as Array<Record<string, number>>;
    assert.deepEqual(evidence, [{
      operations: 1, rollbacks: applied ? 0 : 1, receipts: 3,
      visible_maps: applied ? 190 : 0, incomplete_maps: 0,
    }]);

    const audits: RecordOperationInput[] = [];
    const audit = {
      recordOperationRequired: async (input: RecordOperationInput) => { audits.push(input); },
    } as never;
    const legacy = new HrPerformanceLegacyService(dataSource, audit);
    const relations = new HrPerformanceLegacyRelationsService(dataSource, audit);
    const actor = (...permissions: string[]): JwtPrincipal => ({
      sub: "synthetic-post-import-reader",
      username: "synthetic-post-import-reader",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      roles: [],
      permissions,
    });
    const definitions = actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ);
    const results = actor(HR_PERMISSIONS.HR_PERFORMANCE_READ);
    const page = { page: 1, page_size: 200 };
    const cases = [
      { path: "/hr/performance-legacy/templates", count: 0, read: () => legacy.templates(scope, definitions, page) },
      { path: "/hr/performance-legacy/levels", count: 3, read: () => legacy.levels(scope, definitions, page) },
      { path: "/hr/performance-legacy/dimensions", count: 33, read: () => legacy.dimensions(scope, definitions, page) },
      { path: "/hr/performance-legacy/guides", count: 30, read: () => legacy.guides(scope, definitions, page) },
      { path: "/hr/performance-legacy/relations/sessions", count: 7, read: () => relations.sessions(scope, definitions, page) },
      { path: "/hr/performance-legacy/relations/source-person-assignments", count: 117, read: () => relations.sourcePersonAssignments(scope, results, page) },
      { path: "/hr/performance-legacy/relations/score-sources", count: 0, read: () => relations.scoreSources(scope, results, page) },
      { path: "/hr/performance-legacy/results", count: 0, read: () => legacy.results(scope, results, page) },
      { path: "/hr/performance-legacy/masters", count: 0, read: () => legacy.masters(scope, results, page) },
    ];
    for (const item of cases) {
      const priorAuditCount = audits.length;
      const response = await item.read();
      const expected = applied ? item.count : 0;
      assert.equal(response.total, expected, `${item.path} total`);
      assert.equal(response.items.length, expected, `${item.path} visible rows`);
      assert.equal(audits.length, priorAuditCount + 1, `${item.path} audit`);
      const recorded = audits.at(-1)!;
      assert.equal(recorded.path, item.path);
      assert.equal(recorded.tenantId, scope.tenantId);
      assert.equal(recorded.parkId, scope.parkId);
      assert.equal((recorded.afterJson as { itemCount: number }).itemCount, expected);
    }

    // A nonempty imported relation must retain bounded pagination, not just a
    // correct aggregate count. Compare synthetic identifiers without logging rows.
    const assignmentPages = [];
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      const response = await relations.sourcePersonAssignments(scope, results, {
        page: pageNumber, page_size: 50,
      });
      assert.equal(response.total, applied ? 117 : 0);
      assert.equal(response.items.length, applied ? [50, 50, 17][pageNumber - 1] : 0);
      assignmentPages.push(...response.items.map(item => {
        assert.ok(item !== null && typeof item === "object" && "sourceAssignmentId" in item);
        assert.equal(typeof item.sourceAssignmentId, "number");
        assert.ok(Number.isSafeInteger(item.sourceAssignmentId));
        return item.sourceAssignmentId;
      }));
    }
    assert.equal(new Set(assignmentPages).size, applied ? 117 : 0);

    const deniedAuditCount = audits.length;
    const denied = await relations.sourcePersonAssignments(scope, definitions, page);
    assert.equal(denied.total, 0);
    assert.equal(denied.items.length, 0);
    assert.equal(audits.length, deniedAuditCount);
    const wrongScope = { ...scope, parkId: `${scope.parkId}-other` };
    const invisible = await relations.sessions(wrongScope, definitions, page);
    assert.equal(invisible.total, 0);
    assert.equal(invisible.items.length, 0);
  } finally {
    await dataSource.destroy();
  }
});
