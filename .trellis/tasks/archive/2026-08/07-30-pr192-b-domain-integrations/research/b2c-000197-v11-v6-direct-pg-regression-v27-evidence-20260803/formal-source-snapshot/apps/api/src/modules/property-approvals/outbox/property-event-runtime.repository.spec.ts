import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataSource, EntityManager } from "typeorm";
import { TypeOrmPropertyEventRuntimeStore } from "./property-event-runtime.repository";
import { hashCanonicalPropertyEvent } from "./property-event-canonical";

const scope = { tenantId: "tenant", parkId: "park" };
const id = "33333333-3333-4333-8333-333333333333";
const envelope = {
  eventId: "11111111-1111-4111-8111-111111111111",
  tenantId: "tenant",
  parkId: "park",
  eventType: "approval.executed",
  eventVersion: 1,
  orderingKey: "approval:one",
  sequence: "1",
  eventOrdinal: 0,
  payload: {},
  payloadHash: hashCanonicalPropertyEvent({})
};

const sourceRow = {
  event_id: envelope.eventId,
  tenant_id: scope.tenantId,
  park_id: scope.parkId,
  event_type: envelope.eventType,
  event_version: envelope.eventVersion,
  ordering_key: envelope.orderingKey,
  sequence: envelope.sequence,
  event_ordinal: envelope.eventOrdinal,
  payload: envelope.payload,
  payload_hash: envelope.payloadHash,
  status: "published"
};

describe("TypeOrmPropertyEventRuntimeStore", () => {
  it("returns the immutable inbox receipt on same checksum without rerunning effects", async () => {
    let handlerCalls = 0;
    const manager = {
      query: async (sql: string) => {
        if (sql.includes("pg_advisory_xact_lock")) return [];
        if (sql.includes("FROM biz_property_outbox")) return [sourceRow];
        if (sql.includes("FROM biz_property_inbox")) {
          return [{
            payload_hash: envelope.payloadHash,
            result_hash: "b".repeat(64),
            result_reference: "receipt:1"
          }];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      }
    } as unknown as EntityManager;
    const dataSource = {
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource;
    const store = new TypeOrmPropertyEventRuntimeStore(dataSource);
    const result = await store.consumeInbox(
      { scope, consumerName: "projection", consumerVersion: 1, event: envelope },
      async () => {
        handlerCalls += 1;
        return { result: "new", resultHash: "c".repeat(64) };
      }
    );
    assert.equal(result.duplicate, true);
    assert.equal(result.resultReference, "receipt:1");
    assert.equal(handlerCalls, 0);
  });

  it("treats same event with a different checksum as a P0 conflict", async () => {
    const manager = {
      query: async (sql: string) => {
        if (sql.includes("pg_advisory_xact_lock")) return [];
        if (sql.includes("FROM biz_property_outbox")) {
          return [{ ...sourceRow, payload_hash: "b".repeat(64) }];
        }
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyEventRuntimeStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource);
    await assert.rejects(
      store.consumeInbox(
        { scope, consumerName: "projection", consumerVersion: 1, event: envelope },
        async () => ({ result: null, resultHash: "c".repeat(64) })
      ),
      (error: { response?: { errorCode?: string } }) =>
        error.response?.errorCode === "event-checksum-mismatch"
    );
  });

  it("quarantines a tampered claimed payload with the original hash without handling it", async () => {
    let handlerCalls = 0;
    let quarantineWrites = 0;
    const manager = {
      query: async (sql: string) => {
        if (sql.includes("pg_advisory_xact_lock")) return [];
        if (sql.includes("FROM biz_property_outbox")) return [sourceRow];
        if (sql.includes("INSERT INTO biz_property_event_dlq")) {
          quarantineWrites += 1;
          return [];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyEventRuntimeStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource);
    await assert.rejects(store.consumeInbox({
      scope,
      consumerName: "projection",
      consumerVersion: 1,
      event: {
        ...envelope,
        payload: { tampered: true },
        payloadHash: envelope.payloadHash
      }
    }, async () => {
      handlerCalls += 1;
      return { result: null, resultHash: "c".repeat(64) };
    }), (error: { response?: { errorCode?: string } }) =>
      error.response?.errorCode === "event-checksum-mismatch");
    assert.equal(handlerCalls, 0);
    assert.equal(quarantineWrites, 1);
  });

  it("claims only the minimum incomplete aggregate event and supports expired lease reclaim", async () => {
    let sql = "";
    const manager = {
      query: async (statement: string) => {
        if (statement.includes("SELECT DISTINCT tenant_id")) {
          return [{ tenant_id: scope.tenantId, park_id: scope.parkId }];
        }
        sql = statement;
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyEventRuntimeStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource);
    await store.claimPublishable({
      workerId: "worker",
      limit: 10,
      leaseSeconds: 60,
      authorize: async () => true
    });
    assert.match(sql, /NOT EXISTS/);
    assert.match(sql, /\(prior\.sequence,prior\.event_ordinal\)/);
    assert.match(sql, /prior\.status <> 'published'/);
    assert.match(sql, /isolation\.error_code='event-checksum-mismatch'/);
    assert.match(sql, /candidate\.status='publishing' AND candidate\.lease_expires_at/);
    assert.match(sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(sql, /claim_epoch=target\.claim_epoch\+1/);
    assert.match(sql, /claim_token=\$2/);
    assert.match(sql, /jsonb_to_recordset\(\$5::jsonb\)/);
  });

  it("casts retry scheduling parameters to timestamptz in publish failure updates", async () => {
    let updateSql = "";
    const manager = {
      query: async (statement: string) => {
        updateSql = statement;
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyEventRuntimeStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource);
    assert.equal(await store.markPublishFailure({
      event: { ...envelope, attemptCount: 0, claimEpoch: "1",
        claimToken: "22222222-2222-4222-8222-222222222222" },
      errorCategory: "infrastructure", errorCode: "timeout",
      maxAttempts: 3, retryAt: new Date("2026-08-01T00:00:00.000Z")
    }), "stale-claim");
    assert.match(updateSql, /ELSE \$5::timestamptz END/);
  });

  it("manual replay reuses the original event and writes replay audit without outbox insert", async () => {
    const statements: string[] = [];
    const manager = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("SELECT * FROM biz_property_event_dlq")) {
          return [{
            id: "22222222-2222-4222-8222-222222222222",
            version: 3,
            status: "active",
            failure_side: "consumer",
            notification_delivery_id: null,
            original_event_id: envelope.eventId,
            payload_hash: envelope.payloadHash
          }];
        }
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyEventRuntimeStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource);
    const result = await store.prepareEventReplay({
      scope,
      actorId: id,
      dlqId: "22222222-2222-4222-8222-222222222222",
      authorize: async () => {},
      command: {
        clientKey: "replay-1", incidentId: "INC-1", reason: "broker restored",
        expectedDlqVersion: 3
      }
    });
    assert.equal(result?.eventId, envelope.eventId);
    assert.ok(statements.some((sql) => sql.includes("biz_property_event_replay_audit")));
    assert.ok(!statements.some((sql) => /INSERT INTO biz_property_outbox/.test(sql)));
  });

  it("resolves generic consumer replay only after handler and inbox succeed", async () => {
    let statement = "";
    let parameters: unknown[] = [];
    const replayEvent = {
      ...envelope,
      replayDlqId: id,
      replayDlqVersion: 7
    };
    const manager = {
      query: async (sql: string, values: unknown[]) => {
        if (sql.includes("FROM biz_property_outbox")) return [sourceRow];
        if (sql.includes("WITH eligible AS")) {
          statement = sql;
          parameters = values;
          return [[{ id }], 1];
        }
        if (sql.includes("FROM biz_property_inbox")) return [];
        if (sql.includes("has_unhandled_prior")) {
          return [{ has_unhandled_prior: false, has_sequence_gap: false }];
        }
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyEventRuntimeStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource);
    await store.consumeInbox(
      { scope, consumerName: "projection", consumerVersion: 1, event: replayEvent },
      async () => ({ result: "ok", resultHash: "c".repeat(64) })
    );
    assert.match(statement, /d\.status='replaying' AND d\.version=\$4/);
    assert.match(statement, /d\.consumer_name=\$3/);
    assert.match(statement, /INSERT INTO biz_property_event_replay_audit/);
    assert.match(statement, /receipt\.result_hash=\$5/);
    assert.match(statement, /'replaying','resolved',payload_hash,\$6/);
    assert.equal(String(parameters[5]).length, 64);
  });

  it("applies assigned approval request ids inside count and page SQL", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const store = new TypeOrmPropertyEventRuntimeStore({
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return sql.includes("count(*)") ? [{ total: 0 }] : [];
      }
    } as unknown as DataSource);
    await store.listApprovalIncidents(scope, [id], {});
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.sql, /r\.id=ANY\(\$3::uuid\[\]\)/);
      assert.deepEqual(call.params[2], [id]);
    }
  });

  it("filters consumer replays by authorized tenant and park scopes", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const manager = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("SELECT DISTINCT d.tenant_id")) {
          return [
            { tenant_id: "tenant-denied", park_id: "park-denied" },
            { tenant_id: scope.tenantId, park_id: scope.parkId }
          ];
        }
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyEventRuntimeStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource);
    await store.listReplayingEvents({
      limit: 20,
      authorize: async (_manager, candidate) => candidate.tenantId === scope.tenantId
    });
    assert.equal(calls.length, 2);
    assert.match(calls[1]!.sql, /jsonb_to_recordset\(\$2::jsonb\)/);
    assert.deepEqual(JSON.parse(String(calls[1]!.params[1])), [{
      tenant_id: scope.tenantId, park_id: scope.parkId
    }]);
  });
});
