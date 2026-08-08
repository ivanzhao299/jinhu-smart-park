import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import {
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  type CreatePendingPropertyApprovalCommand
} from "@jinhu/shared";
import { DataSource, type QueryRunner } from "typeorm";
import { PROPERTY_APPROVAL_ENTITIES } from "./entities/property-approval.entities";
import { PropertyApprovalRepository } from "./property-approval.repository";
import {
  canonicalEffectInvariantHash,
  hash,
  PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINTS,
  PropertyApprovalService
} from "./property-approval.service";
import {
  APPROVAL_PORT_PG_TARGET_TABLES,
  approvalPortPgDataResidue,
  approvalPortPgFixtureNames,
  approvalPortPgResidue,
  approvalPortPgRunId,
  assertApprovalPortPgFixturePresent,
  cleanupApprovalPortPgFixture,
  cleanupApprovalPortPgRunData,
  cleanupErrorPreservingPrimary,
  quoteApprovalPortPgIdentifier,
  setupApprovalPortPgFixture,
  type ApprovalPortPgFixtureAudit,
  type ApprovalPortPgCleanupResult
} from "./property-approval.port.pg-fixture";

const url = process.env.PROPERTY_APPROVAL_PORT_PG_URL;
const externalFixture = process.env.PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE === "yes";
if (externalFixture && (!url || !process.env.PROPERTY_APPROVAL_PORT_PG_RUN_ID)) {
  throw new Error("external PG fixture mode requires URL and run ID");
}
const pgIt = url ? it : it.skip;
const runId = approvalPortPgRunId(process.env.PROPERTY_APPROVAL_PORT_PG_RUN_ID);
const fixtureNames = approvalPortPgFixtureNames(runId);
const sentinelTable = quoteApprovalPortPgIdentifier(fixtureNames.sentinelTable);

function approvalErrorCode(error: unknown): unknown {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return response && (response as { errorCode?: unknown }).errorCode;
}

function registerApprovalPortPgTests(): void {
  let dataSource: DataSource;
  let observer: DataSource;
  let service: PropertyApprovalService;
  const fixtureAudit: ApprovalPortPgFixtureAudit = { setup: [], cleanup: [] };
  const openRunners = new Set<QueryRunner>();
  const tenantId = `b2c-${runId}`;
  const parkId = `b2c-${runId}`;
  const requesterId = randomUUID();
  const checkerId = randomUUID();

  const command = (
    sourceId: string,
    overrides: Partial<CreatePendingPropertyApprovalCommand> = {}
  ): CreatePendingPropertyApprovalCommand => ({
    contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
    scope: { tenantId, parkId },
    actionId: "property.mode-transition.request",
    sourceType: "property-unit",
    sourceId,
    sourceExpectedVersion: 1,
    requesterId,
    submitterId: requesterId,
    actorId: requesterId,
    clientKey: `client:${sourceId}`,
    businessIntentKey: `intent:${sourceId}`,
    canonicalPayload: { unitId: sourceId },
    payloadSchemaVersion: 1,
    amount: null,
    currency: null,
    ...overrides
  });

  if (url) before(async () => {
    let primary: unknown;
    try {
      dataSource = new DataSource({
        type: "postgres", url: url!, entities: [...PROPERTY_APPROVAL_ENTITIES],
        synchronize: false, migrationsRun: false, logging: false,
        applicationName: fixtureNames.applicationName
      });
      observer = new DataSource({
        type: "postgres", url: url!, entities: [],
        applicationName: fixtureNames.observerApplicationName
      });
      await dataSource.initialize();
      await observer.initialize();
      assert.deepEqual(await approvalPortPgDataResidue(
        dataSource, tenantId, parkId
      ), []);
      if (externalFixture) {
        await assertApprovalPortPgFixturePresent(dataSource, fixtureNames);
        fixtureAudit.setup.push("external-fixture-present");
      } else {
        fixtureAudit.setup.push("zero-run-data-preflight");
        await setupApprovalPortPgFixture(dataSource, fixtureNames, fixtureAudit);
        assert.deepEqual(fixtureAudit.setup, [
          "zero-run-data-preflight",
          "zero-residue-preflight",
          "create-sentinel-table",
          "create-fault-function",
          ...APPROVAL_PORT_PG_TARGET_TABLES.map((table) => `create-trigger:${table}`)
        ]);
      }
      const repository = new PropertyApprovalRepository(dataSource);
      service = new PropertyApprovalService(
        repository,
      {
        resolve: async (input) => {
          const eligibility = {
            requiredPermissions: ["property_approval:decide"],
            eligibleActorIds: [checkerId],
            auditorActorIds: [checkerId],
            incidentActorIds: [checkerId],
            sourceScopes: [{ sourceType: input.sourceType, sourceId: input.sourceId }]
          };
          const effectBase = {
            effectKind: "property.mode.transition",
            effectOrdinal: 0,
            effectLineKey: `unit:${input.sourceId}`,
            owningTable: "biz_property_mode_transition_log",
            owningUniqueName: "uq_property_mode_transition_approval_line",
            expectedCardinality: 2,
            lineAmount: null,
            currency: null
          };
          return {
            policyId: randomUUID(), policyVersion: 1, policyHash: "a".repeat(64),
            stages: [{
              stageCode: "gate", stageOrdinal: 1,
              eligibilityPolicySnapshot: eligibility,
              eligibilityPolicyVersion: 1,
              eligibilityPolicyHash: hash(eligibility), requiredCount: 1
            }],
            exclusions: [{
              actorId: randomUUID(), reasonCode: "source_creator",
              sourceType: input.sourceType, sourceId: input.sourceId
            }],
            effects: [{
              ...effectBase,
              invariantHash: canonicalEffectInvariantHash(effectBase, input.canonicalPayload)
            }]
          };
        }
      },
      { authorizeDecision: async () => ({ permissionSnapshot: {} }), canDecide: async () => false },
      { get: () => null },
      { append: async () => undefined },
      { predicate: async () => ({} as never), authorizeSource: async () => undefined },
      { authorizeRetry: async () => ({ scopeAssignmentId: "scope" }) },
      {
        inspect: async () => ({ effective: true, mode: "enforce", version: 1 }),
        approvalMode: async () => "enforce",
        requireApprovalEnforce: async () => undefined
      },
        { get: () => null }
      );
      console.log(JSON.stringify({
        phase: "named-tests-before", runId, status: "pass", externalFixture
      }));
    } catch (error) {
      primary = error;
      const cleanup = externalFixture
        ? { errors: [], residue: [] }
        : await cleanupAfterPartialSetup();
      cleanup.errors.push(...await closeMainConnections());
      throw cleanupErrorPreservingPrimary(primary, cleanup);
    }
  });

  if (url) after(async () => {
    if (externalFixture) {
      const closeErrors: unknown[] = [];
      try {
        closeErrors.push(...await closeOpenRunners());
      } finally {
        closeErrors.push(...await closeMainConnections());
      }
      try {
        assert.equal(openRunners.size, 0, "query runner leak after external session close");
      } catch (error) {
        closeErrors.push(error);
      }
      if (closeErrors.length > 0) {
        throw new AggregateError(closeErrors, "external PG test resource cleanup failed");
      }
      console.log(JSON.stringify({
        phase: "named-tests-after", runId, status: "pass", externalFixture: true
      }));
      return;
    }
    let cleanupFailure: unknown;
    try {
      assert.equal(openRunners.size, 0, "query runner leak before fixture cleanup");
      const cleanup = await cleanupAfterPartialSetup();
      cleanupFailure = cleanupErrorPreservingPrimary(undefined, cleanup);
    } catch (error) {
      cleanupFailure = error;
    } finally {
      const closeErrors = await closeMainConnections();
      if (closeErrors.length > 0) {
        cleanupFailure = cleanupErrorPreservingPrimary(
          cleanupFailure,
          { errors: closeErrors, residue: [] }
        );
      }
    }
    const independentFailure = await independentZeroResidueAndSessionPostcheck();
    if (cleanupFailure !== undefined && independentFailure !== undefined) {
      throw new AggregateError(
        [cleanupFailure, independentFailure],
        "approval port PG cleanup and independent postcheck failed"
      );
    }
    if (cleanupFailure !== undefined) throw cleanupFailure;
    if (independentFailure !== undefined) throw independentFailure;
  });

  async function cleanupAfterPartialSetup(): Promise<ApprovalPortPgCleanupResult> {
    const executor = observer?.isInitialized
      ? observer
      : dataSource?.isInitialized
        ? dataSource
        : null;
    if (!executor) return { errors: [], residue: [] };
    const dataErrors = await cleanupApprovalPortPgRunData(
      executor, tenantId, parkId, fixtureAudit
    );
    const cleanup = await cleanupApprovalPortPgFixture(executor, fixtureNames, fixtureAudit);
    cleanup.errors.unshift(...dataErrors);
    return cleanup;
  }

  async function closeMainConnections(): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const connection of [dataSource, observer]) {
      if (!connection?.isInitialized) continue;
      try {
        await connection.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  async function closeOpenRunners(): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const runner of [...openRunners]) {
      try {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
      } catch (error) {
        errors.push(error);
      }
      try {
        if (!runner.isReleased) await runner.release();
      } catch (error) {
        errors.push(error);
      } finally {
        if (runner.isReleased) openRunners.delete(runner);
      }
    }
    return errors;
  }

  async function independentZeroResidueAndSessionPostcheck(): Promise<unknown> {
    const auditor = new DataSource({
      type: "postgres", url: url!, entities: [],
      applicationName: fixtureNames.auditorApplicationName
    });
    let primary: unknown;
    try {
      await auditor.initialize();
      assert.deepEqual(await approvalPortPgResidue(auditor, fixtureNames), []);
      assert.deepEqual(await approvalPortPgDataResidue(
        auditor, tenantId, parkId
      ), []);
      const sessions = await auditor.query(
        `SELECT application_name AS "applicationName",count(*)::int AS count
           FROM pg_stat_activity
          WHERE application_name = ANY($1::text[])
          GROUP BY application_name
          ORDER BY application_name`,
        [[fixtureNames.applicationName, fixtureNames.observerApplicationName]]
      ) as Array<{ applicationName: string; count: number }>;
      assert.deepEqual(sessions, []);
    } catch (error) {
      primary = error;
    } finally {
      if (auditor.isInitialized) {
        try {
          await auditor.destroy();
        } catch (error) {
          primary = primary === undefined
            ? error
            : new AggregateError([error], "auditor close failed", { cause: primary });
        }
      }
    }
    return primary;
  }

  async function withCallerRunner<T>(
    work: (runner: QueryRunner) => Promise<T>
  ): Promise<T> {
    const runner = dataSource.createQueryRunner();
    openRunners.add(runner);
    try {
      await runner.connect();
      return await work(runner);
    } finally {
      try {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
      } finally {
        try {
          if (!runner.isReleased) await runner.release();
        } finally {
          openRunners.delete(runner);
        }
      }
    }
  }

  pgIt("requires the forward-fixed active partial unique predicate", async () => {
    const rows = await dataSource.query(
      `SELECT pg_get_expr(indexprs, indrelid) AS expressions,
              pg_get_expr(indpred, indrelid) AS predicate
         FROM pg_index
        WHERE indexrelid = 'uq_biz_property_approval_request_active_source'::regclass`
    ) as Array<{ predicate: string }>;
    assert.equal(rows.length, 1);
    const predicate = rows[0]!.predicate.replace(/\s+/gu, " ");
    assert.match(predicate, /execution_status/u);
    for (const status of [
      "not_started", "executing", "retry_wait", "infra_exhausted"
    ]) assert.match(predicate, new RegExp(status, "u"));
    assert.doesNotMatch(predicate, /execution_failed|executed/u);
  });

  pgIt("recovers every real dependent 23505 and proves caller commit or rollback", async () => {
    const tableFor = (constraint: string) => constraint.includes("approval_stage")
      ? "biz_property_approval_stage"
      : constraint.includes("approval_exclusion")
        ? "biz_property_approval_actor_exclusion"
        : "biz_property_execution_effect_manifest";
    let ordinal = 0;
    for (const constraint of PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINTS) {
      for (const outcome of ["commit", "rollback"] as const) {
        ordinal += 1;
        await runInjectedFailure({
          fault: `${tableFor(constraint)}|23505|${constraint}`,
          expectedErrorCode: "approval-reconcile-partial",
          label: `dependent-${ordinal}-${outcome}`,
          outcome
        });
      }
    }
  });

  pgIt("fails unknown 23505 and unknown DB errors closed with usable caller manager", async () => {
    for (const [kind, sqlState, constraint] of [
      ["unknown-unique", "23505", "uq_b2c_unknown_constraint"],
      ["unknown-db", "XX999", "b2c_unknown_database_error"]
    ] as const) {
      for (const outcome of ["commit", "rollback"] as const) {
        await runInjectedFailure({
          fault: `biz_property_approval_request|${sqlState}|${constraint}`,
          expectedErrorCode: "property-runtime-unavailable",
          label: `${kind}-${outcome}`,
          outcome
        });
      }
    }
  });

  async function runInjectedFailure(input: {
    fault: string;
    expectedErrorCode: string;
    label: string;
    outcome: "commit" | "rollback";
  }): Promise<void> {
    await withCallerRunner(async (runner) => {
      await runner.startTransaction();
      await runner.manager.query(
        "SELECT set_config($1, $2, true)",
        [fixtureNames.faultSetting, input.fault]
      );
      await assert.rejects(service.createPendingRequest(
        { transactionContext: runner.manager },
        command(randomUUID(), {
          clientKey: `fault-${randomUUID()}`,
          businessIntentKey: `fault-${randomUUID()}`
        })
      ), (error) => approvalErrorCode(error) === input.expectedErrorCode);
      assert.deepEqual(
        await runner.manager.query("SELECT 1 AS sentinel"),
        [{ sentinel: 1 }]
      );
      const sentinelId = randomUUID();
      await runner.manager.query(
        `INSERT INTO ${sentinelTable}(id,label) VALUES($1,$2)`,
        [sentinelId, input.label]
      );
      if (input.outcome === "commit") await runner.commitTransaction();
      else await runner.rollbackTransaction();
      const rows = await observer.query(
        `SELECT count(*)::int AS count FROM ${sentinelTable} WHERE label=$1`,
        [input.label]
      ) as Array<{ count: number }>;
      assert.equal(rows[0]!.count, input.outcome === "commit" ? 1 : 0);
    });
  }

  pgIt("keeps writes invisible before caller commit and removes them on caller rollback", async () => {
    const committedSource = randomUUID();
    const committedRequestId = await withCallerRunner(async (runner) => {
      await runner.startTransaction();
      const created = await service.createPendingRequest(
        { transactionContext: runner.manager }, command(committedSource)
      );
      assert.equal((await service.findById(
        { transactionContext: runner.manager },
        { scope: { tenantId, parkId }, requestId: created.request.requestId }
      ))?.requestId, created.request.requestId);
      assert.equal((await observer.query(
        "SELECT count(*)::int AS count FROM biz_property_approval_request WHERE id=$1",
        [created.request.requestId]
      ) as Array<{ count: number }>)[0]!.count, 0);
      await runner.commitTransaction();
      return created.request.requestId;
    });
    assert.equal((await observer.query(
      "SELECT count(*)::int AS count FROM biz_property_approval_request WHERE id=$1",
      [committedRequestId]
    ) as Array<{ count: number }>)[0]!.count, 1);

    const rolledBackSource = randomUUID();
    const rolledBackRequestId = await withCallerRunner(async (runner) => {
      await runner.startTransaction();
      const rolledBack = await service.createPendingRequest(
        { transactionContext: runner.manager }, command(rolledBackSource)
      );
      await runner.rollbackTransaction();
      return rolledBack.request.requestId;
    });
    assert.equal((await observer.query(
      "SELECT count(*)::int AS count FROM biz_property_approval_request WHERE id=$1",
      [rolledBackRequestId]
    ) as Array<{ count: number }>)[0]!.count, 0);
  });

  pgIt("enforces terminal monotonicity before INSERT under the caller-held source lock", async () => {
    const sourceId = randomUUID();
    const terminal = await dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
      return service.createPendingRequest(
        { transactionContext: manager }, command(sourceId, { sourceExpectedVersion: 2 })
      );
    });
    await dataSource.query(
      `UPDATE biz_property_approval_request
          SET decision_status='approved', execution_status='execution_failed',
              decision_version=3, execution_version=2,
              decided_at=clock_timestamp(), last_error_category='business',
              last_error_code='pg-terminal-monotonicity'
        WHERE id=$1`,
      [terminal.request.requestId]
    );
    const before = (await dataSource.query(
      `SELECT count(*)::int AS count FROM biz_property_approval_request
        WHERE tenant_id=$1 AND park_id=$2 AND source_id=$3`,
      [tenantId, parkId, sourceId]
    ) as Array<{ count: number }>)[0]!.count;
    for (const sourceExpectedVersion of [1, 2]) {
      await assert.rejects(dataSource.transaction(async (manager) => {
        await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
        return service.createPendingRequest(
          { transactionContext: manager }, command(sourceId, {
            sourceExpectedVersion,
            clientKey: `terminal:${sourceExpectedVersion}`,
            businessIntentKey: `terminal:${sourceExpectedVersion}`
          })
        );
      }));
    }
    assert.equal((await dataSource.query(
      `SELECT count(*)::int AS count FROM biz_property_approval_request
        WHERE tenant_id=$1 AND park_id=$2 AND source_id=$3`,
      [tenantId, parkId, sourceId]
    ) as Array<{ count: number }>)[0]!.count, before);

    const higher = await dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
      return service.createPendingRequest(
        { transactionContext: manager }, command(sourceId, {
          sourceExpectedVersion: 3,
          clientKey: `terminal:3`, businessIntentKey: `terminal:3`
        })
      );
    });
    assert.equal(higher.disposition, "created");
  });

  pgIt("serializes two post-terminal intents with the caller-held source lock", async () => {
    const sourceId = randomUUID();
    const terminal = await dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
      return service.createPendingRequest(
        { transactionContext: manager }, command(sourceId, { sourceExpectedVersion: 1 })
      );
    });
    await dataSource.query(
      `UPDATE biz_property_approval_request
          SET decision_status='approved', execution_status='execution_failed',
              decision_version=3, execution_version=2, decided_at=clock_timestamp(),
              last_error_category='business', last_error_code='pg-golden'
        WHERE id=$1`,
      [terminal.request.requestId]
    );
    const writer = (suffix: string) => dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
      return service.createPendingRequest(
        { transactionContext: manager }, command(sourceId, {
          sourceExpectedVersion: 2,
          clientKey: `${suffix}:${sourceId}`,
          businessIntentKey: `${suffix}:${sourceId}`
        })
      );
    });
    const results = await Promise.allSettled([writer("a"), writer("b")]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  });

  pgIt("resolves client-key, business-intent and active-source races and preserves manager usability", async () => {
    const clientSource = randomUUID();
    const clientResults = await Promise.all([
      dataSource.transaction((manager) => service.createPendingRequest(
        { transactionContext: manager }, command(clientSource)
      )),
      dataSource.transaction((manager) => service.createPendingRequest(
        { transactionContext: manager }, command(clientSource)
      ))
    ]);
    assert.deepEqual(clientResults.map((item) => item.disposition).sort(), [
      "created", "replayed-client-key"
    ]);

    const intentSource = randomUUID();
    const intentResults = await Promise.all([
      dataSource.transaction((manager) => service.createPendingRequest(
        { transactionContext: manager }, command(intentSource, { clientKey: `a:${intentSource}` })
      )),
      dataSource.transaction((manager) => service.createPendingRequest(
        { transactionContext: manager }, command(intentSource, { clientKey: `b:${intentSource}` })
      ))
    ]);
    assert.deepEqual(intentResults.map((item) => item.disposition).sort(), [
      "created", "replayed-business-intent"
    ]);

    const activeSource = randomUUID();
    const activeResults = await Promise.allSettled([
      dataSource.transaction((manager) => service.createPendingRequest(
        { transactionContext: manager }, command(activeSource, {
          clientKey: `a:${activeSource}`, businessIntentKey: `a:${activeSource}`
        })
      )),
      dataSource.transaction(async (manager) => {
        try {
          return await service.createPendingRequest(
            { transactionContext: manager }, command(activeSource, {
              clientKey: `b:${activeSource}`, businessIntentKey: `b:${activeSource}`
            })
          );
        } catch (error) {
          assert.deepEqual(await manager.query("SELECT 1 AS sentinel"), [{ sentinel: 1 }]);
          return Promise.reject(error);
        }
      })
    ]);
    assert.equal(activeResults.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(activeResults.filter((item) => item.status === "rejected").length, 1);
  });
}

registerApprovalPortPgTests();
