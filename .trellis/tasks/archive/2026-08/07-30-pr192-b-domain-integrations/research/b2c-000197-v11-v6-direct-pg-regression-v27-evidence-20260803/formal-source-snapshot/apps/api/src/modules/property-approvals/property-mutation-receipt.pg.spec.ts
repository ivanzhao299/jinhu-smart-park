import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
  PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST,
  propertyTaskMutationResultHash,
  type PropertyMutationReceiptAcquireInput,
  type PropertyMutationReceiptCompleteInput,
  type PropertyTaskMutationIdentity,
  type PropertyTaskMutationReceiptAction
} from "@jinhu/shared";
import { DataSource, type EntityManager, type QueryRunner } from "typeorm";
import { DatabasePropertyMutationReceiptAdapter } from
  "./property-mutation-receipt.adapter";

const url = process.env.PROPERTY_MUTATION_RECEIPT_PG_URL;
const suite = url ? describe : describe.skip;
const hash = (character: string) => character.repeat(64);

function errorCode(error: unknown): unknown {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return response && (response as { errorCode?: unknown }).errorCode;
}

function resultRef(
  actionId: PropertyTaskMutationReceiptAction,
  targetId: string,
  identity: PropertyTaskMutationIdentity,
  resultVersion: number
): string {
  if (actionId === "property.task.rebuild") {
    assert.equal(identity.tag, "property-task-source-rebuild");
    return `property-task-rebuild/${identity.sourceType}/${targetId}/v${resultVersion}`;
  }
  if (actionId.startsWith("property.task.source-terminal.")) {
    const terminal = actionId.endsWith(".closed") ? "closed" : "cancelled";
    return `property-task-source-terminal/booking/${targetId}/${terminal}/v${resultVersion}`;
  }
  return `property-task/${targetId}/v${resultVersion}`;
}

suite("property mutation receipt port PostgreSQL 16 gate", () => {
  let dataSource: DataSource;
  let adapter: DatabasePropertyMutationReceiptAdapter;
  const tenantId = `c3-${randomUUID()}`;
  const parkId = `c3-${randomUUID()}`;
  const actorId = randomUUID();

  before(async () => {
    dataSource = new DataSource({ type: "postgres", url, entities: [] });
    await dataSource.initialize();
    adapter = new DatabasePropertyMutationReceiptAdapter();
    const version = await dataSource.query("SHOW server_version_num") as
      Array<{ server_version_num: string }>;
    assert.ok(Number(version[0]!.server_version_num) >= 160000);
  });

  after(async () => { await dataSource?.destroy(); });

  const inputFor = (
    actionId: PropertyTaskMutationReceiptAction,
    ordinal: number,
    overrides: Partial<PropertyMutationReceiptAcquireInput> = {}
  ): PropertyMutationReceiptAcquireInput => {
    const targetId = randomUUID();
    const identity: PropertyTaskMutationIdentity = actionId === "property.task.rebuild"
      ? { tag: "property-task-source-rebuild", sourceType: "booking", sourceId: targetId }
      : {
          tag: "property-task",
          businessOccurrenceKey: `booking:${ordinal}`,
          taskKey: ordinal.toString(16).padStart(64, "0")
        };
    return {
      scope: { tenantId, parkId },
      contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
      actorId,
      actionId,
      targetId,
      clientKey: `c3-client-${ordinal}-${randomUUID()}`,
      requestHash: hash((ordinal % 10).toString()),
      identity,
      acquireMode: "execute-or-replay",
      ...overrides
    } as PropertyMutationReceiptAcquireInput;
  };

  const complete = async (
    manager: EntityManager,
    input: PropertyMutationReceiptAcquireInput,
    receiptId: string,
    resultVersion = 2
  ) => {
    const ref = resultRef(input.actionId, input.targetId, input.identity, resultVersion);
    const resultHash = await propertyTaskMutationResultHash({
      actionId: input.actionId,
      targetId: input.targetId,
      identity: input.identity,
      resultRef: ref,
      resultVersion
    });
    const completion = {
      ...input, receiptId, resultRef: ref, resultHash, resultVersion
    } as PropertyMutationReceiptCompleteInput;
    await adapter.complete(manager, completion);
    return completion;
  };

  const withTransaction = async <T>(work: (manager: EntityManager) => Promise<T>) =>
    dataSource.transaction(work);

  it("preserves all 39 legacy-v1 rows and their null v2 extensions", async () => {
    const rows = await dataSource.query(
      `SELECT action_id,receipt_status,receipt_contract_version,identity_kind,
              business_occurrence_key,task_key,identity_source_type,result_version
         FROM biz_property_mutation_receipt
        WHERE tenant_id='c3-runtime-legacy'
        ORDER BY action_id COLLATE "C",receipt_status COLLATE "C"`
    ) as Array<Record<string, unknown>>;
    assert.equal(rows.length, 39);
    assert.equal(new Set(rows.map((row) => row.action_id)).size, 13);
    assert.deepEqual(new Set(rows.map((row) => row.receipt_status)),
      new Set(["started", "completed", "failed"]));
    for (const row of rows) {
      assert.equal(row.receipt_contract_version, "legacy-v1");
      for (const column of ["identity_kind", "business_occurrence_key", "task_key",
        "identity_source_type", "result_version"]) assert.equal(row[column], null);
    }
  });

  it("rejects the complete invalid-input matrix before the first SQL statement", async () => {
    const valid = inputFor("property.task.claim", 901);
    const invalidAcquire = [
      { ...valid, contractVersion: "legacy-v1" },
      { ...valid, scope: { ...valid.scope, tenantId: "" } },
      { ...valid, scope: { ...valid.scope, tenantId: "bad\0scope" } },
      { ...valid, scope: { ...valid.scope, tenantId: "bad\ufffdscope" } },
      { ...valid, scope: { ...valid.scope, tenantId: "\ud800" } },
      { ...valid, scope: { ...valid.scope, tenantId: "界".repeat(65) } },
      { ...valid, actorId: "not-a-uuid" },
      { ...valid, targetId: "not-a-uuid" },
      { ...valid, clientKey: "" },
      { ...valid, clientKey: "   " },
      { ...valid, clientKey: "界" },
      { ...valid, clientKey: "x".repeat(129) },
      { ...valid, requestHash: "A".repeat(64) },
      { ...valid, identity: { ...valid.identity, businessOccurrenceKey: "\ud800" } },
      { ...valid, identity: { ...valid.identity, businessOccurrenceKey: "界".repeat(86) } },
      { ...valid, actionId: "property.task.start", acquireMode: "existing-only" },
      { ...valid, actionId: "property.task.source-terminal.closed", acquireMode: "invalid" },
      {
        ...valid, actionId: "property.task.rebuild", targetId: randomUUID(),
        identity: { tag: "property-task-source-rebuild", sourceType: "booking", sourceId: randomUUID() }
      },
      {
        ...valid, actionId: "property.task.rebuild",
        identity: { tag: "property-task-source-rebuild", sourceType: "Booking", sourceId: valid.targetId }
      },
      {
        ...valid, actionId: "property.task.rebuild",
        identity: { tag: "property-task-source-rebuild", sourceType: "booking", sourceId: "not-a-uuid" }
      }
    ] as unknown as PropertyMutationReceiptAcquireInput[];
    for (const [index, candidate] of invalidAcquire.entries()) {
      let queries = 0;
      const manager = { query: async () => { queries += 1; return []; } } as unknown as EntityManager;
      await assert.rejects(adapter.acquire(manager, candidate),
        (error) => errorCode(error) === "property-validation-failed", `acquire:${index}`);
      assert.equal(queries, 0, `acquire:${index}`);
    }

    const ref = resultRef(valid.actionId, valid.targetId, valid.identity, 2);
    const validHash = await propertyTaskMutationResultHash({
      actionId: valid.actionId, targetId: valid.targetId, identity: valid.identity,
      resultRef: ref, resultVersion: 2
    });
    const completion = { ...valid, receiptId: randomUUID(), resultRef: ref,
      resultHash: validHash, resultVersion: 2 } as PropertyMutationReceiptCompleteInput;
    const invalidComplete = [
      { ...completion, receiptId: "not-a-uuid" },
      { ...completion, resultVersion: 0 },
      { ...completion, resultVersion: 2147483648 },
      { ...completion, resultRef: `${ref}-drift` },
      { ...completion, resultHash: hash("0") },
      { ...completion, contractVersion: "legacy-v1" },
      { ...completion, targetId: "not-a-uuid" },
      { ...completion, identity: { ...completion.identity, taskKey: "A".repeat(64) } }
    ] as unknown as PropertyMutationReceiptCompleteInput[];
    for (const [index, candidate] of invalidComplete.entries()) {
      let queries = 0;
      const manager = { query: async () => { queries += 1; return []; } } as unknown as EntityManager;
      await assert.rejects(adapter.complete(manager, candidate),
        (error) => errorCode(error) === "property-validation-failed", `complete:${index}`);
      assert.equal(queries, 0, `complete:${index}`);
    }
  });

  it("pins TypeORM UPDATE RETURNING tuple shape and the CTE complete row shape", async () => {
    const shapeTenantId = `c3-shape-${randomUUID()}`;
    const shapeParkId = `c3-shape-${randomUUID()}`;
    const input = inputFor("property.task.start", 777,
      { scope: { tenantId: shapeTenantId, parkId: shapeParkId } });
    const acquired = await withTransaction((manager) => adapter.acquire(manager, input));
    assert.equal(acquired.kind, "execute");
    if (acquired.kind !== "execute") return;

    await assert.rejects(dataSource.transaction(async (manager) => {
      const raw = await manager.query(
        `UPDATE biz_property_mutation_receipt
            SET receipt_status=receipt_status
          WHERE id=$1 AND receipt_status='started'
          RETURNING id`,
        [acquired.receiptId]
      ) as unknown;
      assert.ok(Array.isArray(raw));
      assert.equal(raw.length, 2);
      assert.ok(Array.isArray(raw[0]));
      assert.deepEqual(raw[0], [{ id: acquired.receiptId }]);
      assert.equal(raw[1], 1);
      throw new Error("rollback-raw-update-shape-fixture");
    }), /rollback-raw-update-shape-fixture/u);

    const before = await dataSource.query(
      `SELECT receipt_status,result_ref,result_hash,result_version
         FROM biz_property_mutation_receipt WHERE id=$1`, [acquired.receiptId]
    ) as Array<Record<string, unknown>>;
    assert.deepEqual(before[0], { receipt_status: "started", result_ref: null,
      result_hash: null, result_version: null });

    const completion = await withTransaction((manager) =>
      complete(manager, input, acquired.receiptId, 3));
    assert.equal(completion.resultVersion, 3);
    await assert.rejects(withTransaction((manager) => adapter.complete(manager, completion)),
      (error) => errorCode(error) === "property-runtime-unavailable");
    const after = await dataSource.query(
      `SELECT receipt_status,result_ref,result_hash,result_version
         FROM biz_property_mutation_receipt WHERE id=$1`, [acquired.receiptId]
    ) as Array<Record<string, unknown>>;
    assert.deepEqual(after[0], { receipt_status: "completed", result_ref: completion.resultRef,
      result_hash: completion.resultHash, result_version: completion.resultVersion });
  });

  it("executes, completes and exact-replays every one of the 8 signed v2 branches", async () => {
    assert.equal(PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST.length, 8);
    const before = await dataSource.query(
      `SELECT count(*)::int count FROM biz_property_mutation_receipt
        WHERE tenant_id=$1 AND receipt_contract_version='port-v2'`, [tenantId]
    ) as Array<{ count: number }>;
    for (const [ordinal, manifest] of
      PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST.entries()) {
      const input = inputFor(manifest.actionId, ordinal + 1);
      const first = await withTransaction((manager) => adapter.acquire(manager, input));
      assert.equal(first.kind, "execute", manifest.actionId);
      if (first.kind !== "execute") continue;
      const completion = await withTransaction((manager) =>
        complete(manager, input, first.receiptId, ordinal + 2));
      const replay = await withTransaction((manager) => adapter.acquire(manager, input));
      assert.deepEqual(replay, {
        kind: "replay", resultRef: completion.resultRef,
        resultHash: completion.resultHash, resultVersion: completion.resultVersion
      }, manifest.actionId);
      if ((manifest.acquireModes as readonly string[]).includes("existing-only")) {
        const existingOnly = { ...input, acquireMode: "existing-only" } as
          PropertyMutationReceiptAcquireInput;
        assert.deepEqual(await withTransaction((manager) => adapter.acquire(manager, existingOnly)),
          replay, `${manifest.actionId}:existing-only`);
      }
    }
    const after = await dataSource.query(
      `SELECT count(*)::int count FROM biz_property_mutation_receipt
        WHERE tenant_id=$1 AND receipt_contract_version='port-v2'`, [tenantId]
    ) as Array<{ count: number }>;
    assert.equal(after[0]!.count - before[0]!.count, 8,
      "the signed action matrix must be order-independent and add exactly eight receipts");
  });

  it("serializes concurrent same-key acquisition to one receipt and a stored replay", async () => {
    const input = inputFor("property.task.claim", 101);
    const winner: QueryRunner = dataSource.createQueryRunner();
    const loser: QueryRunner = dataSource.createQueryRunner();
    await winner.connect(); await loser.connect();
    await winner.startTransaction(); await loser.startTransaction();
    try {
      const acquired = await adapter.acquire(winner.manager, input);
      assert.equal(acquired.kind, "execute");
      if (acquired.kind !== "execute") return;
      const loserPromise = adapter.acquire(loser.manager, input);
      let loserObservedWaiting = false;
      for (let attempt = 0; attempt < 100 && !loserObservedWaiting; attempt += 1) {
        const waits = await dataSource.query(
          `SELECT count(*)::int count FROM pg_stat_activity
            WHERE datname=current_database() AND pid<>pg_backend_pid()
              AND wait_event_type='Lock'
              AND query ILIKE '%INSERT INTO biz_property_mutation_receipt%'`
        ) as Array<{ count: number }>;
        loserObservedWaiting = waits[0]!.count === 1;
        if (!loserObservedWaiting) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        }
      }
      assert.equal(loserObservedWaiting, true, "loser must overlap and wait on the winner");
      const completion = await complete(winner.manager, input, acquired.receiptId, 9);
      await winner.commitTransaction();
      const replay = await loserPromise;
      assert.deepEqual(replay, { kind: "replay", resultRef: completion.resultRef,
        resultHash: completion.resultHash, resultVersion: completion.resultVersion });
      await loser.commitTransaction();
      const count = await dataSource.query(
        `SELECT count(*)::int count FROM biz_property_mutation_receipt
          WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3 AND action_id=$4
            AND target_id=$5 AND client_key=$6`,
        [tenantId, parkId, actorId, input.actionId, input.targetId, input.clientKey]
      ) as Array<{ count: number }>;
      assert.equal(count[0]!.count, 1);
    } finally {
      if (winner.isTransactionActive) await winner.rollbackTransaction();
      if (loser.isTransactionActive) await loser.rollbackTransaction();
      await winner.release(); await loser.release();
    }
  });

  it("existing-only absent/started fails closed without inserting or mutating", async () => {
    const absent = inputFor("property.task.source-terminal.closed", 201,
      { acquireMode: "existing-only" });
    await assert.rejects(withTransaction((manager) => adapter.acquire(manager, absent)),
      (error) => errorCode(error) === "property-runtime-unavailable");
    const countBefore = await dataSource.query(
      `SELECT count(*)::int count FROM biz_property_mutation_receipt WHERE tenant_id=$1`,
      [tenantId]) as Array<{ count: number }>;
    const started = inputFor("property.task.source-terminal.cancelled", 202);
    await withTransaction((manager) => adapter.acquire(manager, started));
    await assert.rejects(withTransaction((manager) => adapter.acquire(manager,
      { ...started, acquireMode: "existing-only" } as PropertyMutationReceiptAcquireInput)),
    (error) => errorCode(error) === "property-runtime-unavailable");
    const countAfter = await dataSource.query(
      `SELECT count(*)::int count FROM biz_property_mutation_receipt WHERE tenant_id=$1`,
      [tenantId]) as Array<{ count: number }>;
    assert.equal(countAfter[0]!.count, countBefore[0]!.count + 1);
  });

  it("complete is a full-field one-shot CAS and every error path rolls back", async () => {
    const input = inputFor("property.task.block", 301);
    const acquired = await withTransaction((manager) => adapter.acquire(manager, input));
    assert.equal(acquired.kind, "execute");
    if (acquired.kind !== "execute") return;
    const ref = resultRef(input.actionId, input.targetId, input.identity, 4);
    const goodHash = await propertyTaskMutationResultHash({
      actionId: input.actionId, targetId: input.targetId, identity: input.identity,
      resultRef: ref, resultVersion: 4
    });
    await assert.rejects(withTransaction((manager) => adapter.complete(manager, {
      ...input, receiptId: acquired.receiptId, resultRef: ref,
      resultHash: hash("f"), resultVersion: 4
    } as PropertyMutationReceiptCompleteInput)),
    (error) => errorCode(error) === "property-validation-failed");
    const stillStarted = await dataSource.query(
      `SELECT receipt_status,result_ref,result_hash,result_version FROM biz_property_mutation_receipt WHERE id=$1`,
      [acquired.receiptId]) as Array<Record<string, unknown>>;
    assert.deepEqual(stillStarted[0], {
      receipt_status: "started", result_ref: null, result_hash: null, result_version: null
    });
    const completion = { ...input, receiptId: acquired.receiptId,
      resultRef: ref, resultHash: goodHash, resultVersion: 4 } as PropertyMutationReceiptCompleteInput;
    await withTransaction((manager) => adapter.complete(manager, completion));
    await assert.rejects(withTransaction((manager) => adapter.complete(manager, completion)),
      (error) => errorCode(error) === "property-runtime-unavailable");
    await assert.rejects(withTransaction((manager) => adapter.acquire(manager, {
      ...input, requestHash: hash("e")
    })), (error) => errorCode(error) === "idempotency-key-conflict");
    const exact = await withTransaction((manager) => adapter.acquire(manager, input));
    assert.deepEqual(exact, { kind: "replay", resultRef: ref,
      resultHash: goodHash, resultVersion: 4 });
  });

  it("replay trusts no caller hash and fails closed on corrupted stored outcome", async () => {
    const input = inputFor("property.task.release", 401);
    const acquired = await withTransaction((manager) => adapter.acquire(manager, input));
    assert.equal(acquired.kind, "execute");
    if (acquired.kind !== "execute") return;
    await withTransaction((manager) => complete(manager, input, acquired.receiptId, 7));
    await assert.rejects(dataSource.transaction(async (manager) => {
      await manager.query(
        "ALTER TABLE biz_property_mutation_receipt DROP CONSTRAINT ck_biz_property_mutation_receipt_outcome_v2"
      );
      await manager.query("ALTER TABLE biz_property_mutation_receipt DISABLE TRIGGER trg_property_mutation_receipt_guard_v2");
      await manager.query("UPDATE biz_property_mutation_receipt SET result_hash=$1 WHERE id=$2",
        [hash("0"), acquired.receiptId]);
      await assert.rejects(adapter.acquire(manager, input),
        (error) => errorCode(error) === "idempotency-key-conflict");
      throw new Error("rollback-corruption-fixture");
    }), /rollback-corruption-fixture/u);
    const replay = await withTransaction((manager) => adapter.acquire(manager, input));
    assert.equal(replay.kind, "replay");
  });
});
