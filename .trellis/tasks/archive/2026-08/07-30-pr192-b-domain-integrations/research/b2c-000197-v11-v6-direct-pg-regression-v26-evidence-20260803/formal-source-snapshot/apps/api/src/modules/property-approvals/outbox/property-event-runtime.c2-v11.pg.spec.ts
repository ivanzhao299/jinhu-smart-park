import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { DataSource } from "typeorm";
import { TypeOrmPropertyEventRuntimeStore } from
  "./property-event-runtime.repository";
import { PropertyEventPublisherWorker } from
  "./property-event.worker";
import type { PropertyEventEnvelope } from
  "./property-event-runtime.contracts";
import { hashCanonicalPropertyEvent } from
  "./property-event-canonical";
import { PropertyApprovalRepository } from "../property-approval.repository";
import { PropertyApprovalRequestEntity } from "../entities/property-approval.entities";

const url = process.env.PROPERTY_RUNTIME_PG_URL;
const suite = url ? describe : describe.skip;
const controlsFor = (tenantId: string, parkId: string) => ({
  inspect: async (_manager: unknown, scope: { tenantId: string; parkId: string }) => ({
    effective: scope.tenantId === tenantId && scope.parkId === parkId,
    mode: "enforce" as const,
    version: 1
  })
});

suite("B-extension gate-owned PostgreSQL runtime evidence", () => {
  let dataSource: DataSource;

  before(async () => {
    dataSource = new DataSource({
      type: "postgres", url: url!, entities: [PropertyApprovalRequestEntity]
    });
    await dataSource.initialize();
    const version = await dataSource.query("SHOW server_version_num") as
      Array<{ server_version_num: string }>;
    assert.ok(Number(version[0]!.server_version_num) >= 160000);
  });

  after(async () => {
    await dataSource?.destroy();
  });

  async function insertEvent(label: string) {
    const eventId = randomUUID();
    const tenantId = `bext-${randomUUID()}`;
    const parkId = `bext-${randomUUID()}`;
    const payload = { label, immutable: true };
    const payloadHash = hashCanonicalPropertyEvent(payload);
    await dataSource.query(
      `INSERT INTO biz_property_outbox(
        event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
        aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash
      ) VALUES($1,$2,$3,'b-extension.runtime-evidence',1,'b-extension',$4,1,$5,1,0,$6::jsonb,$7)`,
      [eventId, tenantId, parkId, randomUUID(), `bext:${eventId}`, JSON.stringify(payload), payloadHash]
    );
    return { eventId, tenantId, parkId, payload, payloadHash };
  }

  async function row(eventId: string) {
    const rows = await dataSource.query(
      `SELECT event_id::text,status,attempt_count,claim_epoch,claim_token::text,
        payload,payload_hash,published_at,dlq_at
       FROM biz_property_outbox WHERE event_id=$1`, [eventId]
    ) as Array<Record<string, unknown>>;
    assert.equal(rows.length, 1);
    return rows[0]!;
  }

  it("persists retry_wait recovery and terminal DLQ with exact fencing and immutable identity", async () => {
    const store = new TypeOrmPropertyEventRuntimeStore(dataSource);
    const recovered = await insertEvent("recover-after-one-failure");
    const recoveredClaims: PropertyEventEnvelope[] = [];
    let recoveredAttempts = 0;
    let successfulPublishes = 0;
    const recoveryWorker = new PropertyEventPublisherWorker(store, {
      publish: async (event) => {
        recoveredClaims.push({ ...event, payload: { ...event.payload } });
        recoveredAttempts += 1;
        if (recoveredAttempts === 1) throw Object.assign(new Error("transient"), {
          code: "broker-timeout"
        });
        successfulPublishes += 1;
      }
    }, controlsFor(recovered.tenantId, recovered.parkId) as never);

    const first = await recoveryWorker.run({ workerId: "bext-retry-1", maxAttempts: 3,
      leaseSeconds: 5, retryDelayMs: () => 0 });
    assert.deepEqual({ claimed: first.claimed, retryWaiting: first.retryWaiting,
      deadLettered: first.deadLettered, published: first.published },
    { claimed: 1, retryWaiting: 1, deadLettered: 0, published: 0 });
    const retryWaiting = await row(recovered.eventId);
    assert.equal(retryWaiting.status, "retry_wait");
    assert.equal(Number(retryWaiting.attempt_count), 1);
    assert.equal(retryWaiting.claim_token, null);
    assert.equal(await store.markPublished(recoveredClaims[0]!), false);

    const second = await recoveryWorker.run({ workerId: "bext-retry-2", maxAttempts: 3,
      leaseSeconds: 5, retryDelayMs: () => 0 });
    assert.deepEqual({ claimed: second.claimed, retryWaiting: second.retryWaiting,
      deadLettered: second.deadLettered, published: second.published },
    { claimed: 1, retryWaiting: 0, deadLettered: 0, published: 1 });
    assert.equal(recoveredClaims.length, 2);
    assert.equal(BigInt(recoveredClaims[1]!.claimEpoch), BigInt(recoveredClaims[0]!.claimEpoch) + 1n);
    assert.notEqual(recoveredClaims[1]!.claimToken, recoveredClaims[0]!.claimToken);
    assert.equal(await store.markPublishFailure({ event: recoveredClaims[0]!,
      errorCategory: "infrastructure", errorCode: "stale-worker", maxAttempts: 3,
      retryAt: new Date(0) }), "stale-claim");
    const published = await row(recovered.eventId);
    assert.equal(published.status, "published");
    assert.equal(Number(published.attempt_count), 1);
    assert.equal(published.payload_hash, recovered.payloadHash);
    assert.deepEqual(published.payload, recovered.payload);
    assert.equal(successfulPublishes, 1);

    const exhausted = await insertEvent("exhaust-to-dlq");
    const exhaustedClaims: PropertyEventEnvelope[] = [];
    const dlqWorker = new PropertyEventPublisherWorker(store, {
      publish: async (event) => {
        exhaustedClaims.push({ ...event, payload: { ...event.payload } });
        throw Object.assign(new Error("terminal"), { code: "broker-unavailable" });
      }
    }, controlsFor(exhausted.tenantId, exhausted.parkId) as never);
    const dlqFirst = await dlqWorker.run({ workerId: "bext-dlq-1", maxAttempts: 2,
      leaseSeconds: 5, retryDelayMs: () => 0 });
    const dlqSecond = await dlqWorker.run({ workerId: "bext-dlq-2", maxAttempts: 2,
      leaseSeconds: 5, retryDelayMs: () => 0 });
    assert.equal(dlqFirst.retryWaiting, 1);
    assert.equal(dlqSecond.deadLettered, 1);
    assert.equal(exhaustedClaims.length, 2);
    assert.equal(BigInt(exhaustedClaims[1]!.claimEpoch), BigInt(exhaustedClaims[0]!.claimEpoch) + 1n);
    assert.notEqual(exhaustedClaims[1]!.claimToken, exhaustedClaims[0]!.claimToken);
    const dlqRow = await row(exhausted.eventId);
    assert.equal(dlqRow.status, "dlq");
    assert.equal(Number(dlqRow.attempt_count), 2);
    assert.equal(dlqRow.payload_hash, exhausted.payloadHash);
    assert.deepEqual(dlqRow.payload, exhausted.payload);
    const incidents = await dataSource.query(
      `SELECT status,failure_side,attempt_count,payload_hash,count(*) OVER()::integer AS total
       FROM biz_property_event_dlq WHERE original_event_id=$1`, [exhausted.eventId]
    ) as Array<Record<string, unknown>>;
    assert.equal(incidents.length, 1);
    assert.deepEqual({ status: incidents[0]!.status, failureSide: incidents[0]!.failure_side,
      attemptCount: Number(incidents[0]!.attempt_count), payloadHash: incidents[0]!.payload_hash,
      total: Number(incidents[0]!.total) },
    { status: "active", failureSide: "publisher", attemptCount: 2,
      payloadHash: exhausted.payloadHash, total: 1 });
    assert.equal(await store.markPublished(exhaustedClaims[1]!), false);
    assert.equal(await store.markPublishFailure({ event: exhaustedClaims[1]!,
      errorCategory: "infrastructure", errorCode: "terminal-stale", maxAttempts: 2,
      retryAt: new Date(0) }), "stale-claim");
  });

  it("serializes approval execution expired-lease reclaim with one fenced repository CAS winner",
    async () => {
    const requestId = randomUUID();
    const tenantId = `bext-${randomUUID()}`;
    const parkId = `bext-${randomUUID()}`;
    const actorId = randomUUID();
    const sourceId = randomUUID();
    const oldToken = randomUUID();
    await dataSource.query(
      `INSERT INTO biz_property_approval_request(
        id,tenant_id,park_id,action_id,source_type,source_id,source_expected_version,
        requester_id,submitter_id,client_idempotency_key,business_intent_key,
        canonical_payload,payload_schema_version,payload_hash,policy_id,policy_version,
        policy_hash,decision_status,execution_status,decision_version,execution_version,
        execution_idempotency_key,decided_at,claim_epoch,claim_token,worker_id,
        heartbeat_at,lease_expires_at,attempt_count
      ) VALUES($1,$2,$3,'property.mode-transition.request','property-unit',$4,1,$5,$5,$6,$7,
        '{}'::jsonb,1,$8,$9,1,$10,'approved','executing',3,2,$11,clock_timestamp(),
        1,$12,'expired-worker',clock_timestamp()-interval '2 minutes',
        clock_timestamp()-interval '1 minute',1)`,
      [requestId, tenantId, parkId, sourceId, actorId, `client-${requestId}`,
        `intent-${requestId}`, "a".repeat(64), randomUUID(), "b".repeat(64),
        `execution-${requestId}`, oldToken]
    );
    const repository = new PropertyApprovalRepository(dataSource);
    const tokens = [randomUUID(), randomUUID()];
    const reclaim = (index: number) => dataSource.transaction((manager) =>
      repository.casExecutionRequest(manager, { tenantId, parkId }, requestId, "executing", 2, {
        claimEpoch: "2", claimToken: tokens[index], workerId: `reclaim-${index}`,
        heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + 30_000),
        executionVersion: 3, attemptCount: 2, reconcileRequired: true
      }, { claimEpoch: "1", claimToken: oldToken }));
    const results = await Promise.all([reclaim(0), reclaim(1)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((won) => !won).length, 1);
    const persisted = await dataSource.query(
      `SELECT claim_epoch::text AS "claimEpoch",claim_token::text AS "claimToken",
        execution_version AS "executionVersion" FROM biz_property_approval_request WHERE id=$1`,
      [requestId]
    ) as Array<{ claimEpoch: string; claimToken: string; executionVersion: number }>;
    const winner = persisted[0]!;
    assert.deepEqual({ claimEpoch: winner.claimEpoch, executionVersion: winner.executionVersion },
      { claimEpoch: "2", executionVersion: 3 });
    assert.notEqual(winner.claimToken, oldToken);
    assert.equal(await dataSource.transaction((manager) => repository.casExecutionRequest(
      manager, { tenantId, parkId }, requestId, "executing", 3,
      { heartbeatAt: new Date() }, { claimEpoch: "1", claimToken: oldToken }
    )), false);
  });

  it("completes consumer DLQ replay exactly once with resolved audit and inbox closure", async () => {
    const tenantId = `bext-${randomUUID()}`;
    const parkId = `bext-${randomUUID()}`;
    const eventId = randomUUID();
    const dlqId = randomUUID();
    const payload = { replay: "c2-v11" };
    const payloadHash = hashCanonicalPropertyEvent(payload);
    await dataSource.query(
      `INSERT INTO biz_property_outbox(
        event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
        aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash,status,published_at
      ) VALUES($1,$2,$3,'b-extension.replay',1,'b-extension',$4,1,$5,1,0,$6::jsonb,$7,
        'published',clock_timestamp())`,
      [eventId, tenantId, parkId, randomUUID(), `bext:${eventId}`, JSON.stringify(payload), payloadHash]
    );
    await dataSource.query(
      `INSERT INTO biz_property_event_dlq(
        id,tenant_id,park_id,original_event_id,consumer_name,payload_hash,failure_side,
        error_category,error_code,attempt_count,first_failed_at,last_failed_at,status,version
      ) VALUES($1,$2,$3,$4,'c2-consumer',$5,'consumer','infrastructure','timeout',2,
        clock_timestamp(),clock_timestamp(),'replaying',4)`,
      [dlqId, tenantId, parkId, eventId, payloadHash]
    );
    await dataSource.query(
      `INSERT INTO biz_property_event_replay_audit(
        tenant_id,park_id,dlq_id,original_event_id,operator_id,incident_id,reason,
        before_status,after_status,payload_hash,result_hash
      ) VALUES($1,$2,$3,$4,$5,'C2-V11','recovered','active','replaying',$6,$7)`,
      [tenantId, parkId, dlqId, eventId, randomUUID(), payloadHash, "c".repeat(64)]
    );
    const store = new TypeOrmPropertyEventRuntimeStore(dataSource);
    await store.consumeInbox({ scope: { tenantId, parkId }, consumerName: "c2-consumer",
      consumerVersion: 1, event: { eventId, tenantId, parkId,
        eventType: "b-extension.replay", eventVersion: 1, orderingKey: `bext:${eventId}`,
        sequence: "1", eventOrdinal: 0, payload, payloadHash,
        replayDlqId: dlqId, replayDlqVersion: 4 }
    }, async () => ({ result: "done", resultHash: "d".repeat(64) }));
    assert.equal(await dataSource.transaction((manager) => store.completeConsumerReplay(manager, {
      dlqId, eventId, consumerName: "c2-consumer", expectedDlqVersion: 4,
      inboxResultHash: "d".repeat(64)
    })), false);
    const closure = await dataSource.query(
      `SELECT q.status,q.version,
        (SELECT count(*)::int FROM biz_property_event_replay_audit a
          WHERE a.dlq_id=q.id AND a.after_status='resolved') AS resolved_audits,
        (SELECT count(*)::int FROM biz_property_inbox i
          WHERE i.event_id=q.original_event_id AND i.consumer_name=q.consumer_name) AS inboxes,
        (SELECT count(*)::int FROM biz_property_outbox o
          WHERE o.event_id=q.original_event_id) AS events
       FROM biz_property_event_dlq q WHERE q.id=$1`, [dlqId]
    ) as Array<{ status: string; version: number; resolved_audits: number;
      inboxes: number; events: number }>;
    assert.deepEqual(closure, [{ status: "resolved", version: 5, resolved_audits: 1,
      inboxes: 1, events: 1 }]);
  });
});
