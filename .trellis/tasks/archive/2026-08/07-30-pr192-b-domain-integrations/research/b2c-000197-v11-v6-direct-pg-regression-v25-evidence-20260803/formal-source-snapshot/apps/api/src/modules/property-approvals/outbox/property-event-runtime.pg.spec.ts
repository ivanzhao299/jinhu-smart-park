import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import { Module } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PROPERTY_BUSINESS_PERMISSIONS, TRACK_B_CONTRACT_SHA256 } from "@jinhu/shared";
import { MODULES_KEY } from "../../../shared/decorators/modules.decorator";
import { PERMISSIONS_KEY } from "../../../shared/decorators/permissions.decorator";
import { PropertyApprovalController } from "../property-approval.controller";
import { PropertyApprovalModule } from "../property-approval.module";
import {
  PropertyApprovalIncidentController,
  PropertyApprovalIncidentRetryController,
  PropertyEventIncidentController
} from "./property-incident.controller";
import { PropertyNotificationController } from "./property-notification.controller";
import {
  PROPERTY_APPROVAL_INCIDENT_RETRY,
  PROPERTY_EVENT_PUBLISHER,
  PROPERTY_EVENT_RUNTIME_STORE,
  PROPERTY_INCIDENT_AUTHORIZATION,
  type PropertyEventPublisherPort,
  type PropertyIncidentAuthorizationPort
} from "./property-event-runtime.contracts";
import {
  PROPERTY_NOTIFICATION_AUTHORIZATION,
  PROPERTY_NOTIFICATION_CHANNEL,
  PROPERTY_NOTIFICATION_STORE,
  type NotificationProjectionInput,
  type PropertyNotificationChannelName,
  type PropertyNotificationAuthorizationPort,
  type PropertyNotificationChannelPort
} from "./property-notification.contracts";
import { PropertyApprovalIncidentRetryAdapter } from
  "./property-approval-incident-retry.adapter";
import { TypeOrmPropertyEventRuntimeStore } from "./property-event-runtime.repository";
import { hashCanonicalPropertyEvent } from "./property-event-canonical";
import { PropertyEventPublisherWorker } from "./property-event.worker";
import { PropertyIncidentService } from "./property-incident.service";
import { TypeOrmPropertyNotificationStore } from "./property-notification.repository";
import { PropertyNotificationService } from "./property-notification.service";
import { PropertyNotificationDeliveryWorker } from "./property-notification.worker";
import { PropertyNotificationProjectionConsumer } from "./property-notification.consumer";
import { PropertyApprovalRuntimeOutboxAdapter } from "./property-approval-outbox.adapter";
import { DatabasePropertyRuntimeAuthorizationAdapter } from
  "./property-runtime-authorization.adapter";
import { DatabasePropertyRuntimeControlAdapter } from "../property-runtime-control";

const url = process.env.PROPERTY_RUNTIME_PG_URL;
const suite = url ? describe : describe.skip;

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      url: url!,
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
      logging: false
    }),
    PropertyApprovalModule
  ]
})
class PropertyRuntimePgTestRootModule {}

suite("property event runtime PostgreSQL 16 gate", () => {
  let dataSource: DataSource;

  before(async () => {
    dataSource = new DataSource({ type: "postgres", url, entities: [] });
    await dataSource.initialize();
    const version = await dataSource.query("SHOW server_version_num") as { server_version_num: string }[];
    assert.ok(Number(version[0]!.server_version_num) >= 160000);
  });
  after(async () => { await dataSource?.destroy(); });

  it("executes database-backed incident authorization against the real RBAC schema", async () => {
    const tenantId = randomUUID();
    const parkId = randomUUID();
    const actorId = randomUUID();
    const roleId = randomUUID();
    const permissionDefinitionParkId = randomUUID();
    const permissionIds = [randomUUID(), randomUUID()];
    const moduleRows = await dataSource.query(
      `SELECT id FROM sys_module
        WHERE module_code='asset' AND status=1 AND is_deleted=false
        LIMIT 1`
    ) as Array<{ id: string }>;
    assert.equal(moduleRows.length, 1);
    await dataSource.query(
      `INSERT INTO rel_tenant_module(
        tenant_id,park_id,module_id,enabled,status,start_time,expire_time
      ) VALUES($1,$2,$3,true,'enabled',clock_timestamp()-interval '1 hour',
        clock_timestamp()+interval '1 hour')`,
      [tenantId, parkId, moduleRows[0]!.id]
    );
    await dataSource.query(
      `INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash)
       VALUES($1,$2,$3,$4,'Incident operator','not-a-login-secret')`,
      [actorId, tenantId, parkId, `incident-${actorId}`]
    );
    await dataSource.query(
      `INSERT INTO rel_user_park(tenant_id,user_id,park_id,status)
       VALUES($1,$2,$3,'enabled')`,
      [tenantId, actorId, parkId]
    );
    await dataSource.query(
      `INSERT INTO sys_role(id,tenant_id,park_id,code,name)
       VALUES($1,$2,$3,$4,'Incident operator')`,
      [roleId, tenantId, parkId, `incident-${roleId}`]
    );
    await dataSource.query(
      `INSERT INTO rel_user_role(tenant_id,park_id,user_id,role_id)
       VALUES($1,$2,$3,$4)`,
      [tenantId, parkId, actorId, roleId]
    );
    const permissionCodes = [
      "property:event-delivery-incidents:page",
      "property_event:read_incident"
    ];
    for (let index = 0; index < permissionCodes.length; index += 1) {
      await dataSource.query(
        `INSERT INTO sys_permission(
          id,tenant_id,park_id,code,name,resource,action
        ) VALUES($1,$2,$3,$4,$4,'property-event-incident','read')`,
        [
          permissionIds[index], tenantId, permissionDefinitionParkId,
          permissionCodes[index]
        ]
      );
      await dataSource.query(
        `INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id)
         VALUES($1,$2,$3,$4)`,
        [tenantId, parkId, roleId, permissionIds[index]]
      );
    }
    const adapter = new DatabasePropertyRuntimeAuthorizationAdapter(dataSource);
    const authorizationInput = {
      scope: { tenantId, parkId },
      actor: {
        sub: actorId,
        username: "incident-operator",
        tenantId,
        parkId,
        roles: [],
        permissions: ["*"],
        isSuper: true
      },
      surface: "event-delivery" as const,
      operation: "read" as const
    };
    assert.deepEqual(await adapter.authorize(authorizationInput), { allowedActions: [] });
    for (const [table, id] of [
      ["sys_user", actorId],
      ["sys_role", roleId],
      ["sys_permission", permissionIds[0]!]
    ] as const) {
      await dataSource.query(`UPDATE ${table} SET status='disabled' WHERE id=$1`, [id]);
      await assert.rejects(adapter.authorize(authorizationInput));
      await dataSource.query(`UPDATE ${table} SET status='enabled' WHERE id=$1`, [id]);
    }
    await dataSource.query(
      `UPDATE sys_permission SET tenant_id=$2 WHERE id=$1`,
      [permissionIds[0], randomUUID()]
    );
    await assert.rejects(adapter.authorize(authorizationInput));
  });

  it("claims only enforce scopes and leaves disabled, observe, shadow and drift pending", async () => {
    const modes = ["disabled", "observe", "shadow", "enforce", "drift"] as const;
    const fixtures = modes.map((mode) => ({
      mode,
      tenantId: `control-${mode}-${randomUUID()}`,
      parkId: `control-${mode}-${randomUUID()}`,
      eventId: randomUUID()
    }));
    for (const fixture of fixtures) {
      await dataSource.query(
        `INSERT INTO biz_property_outbox(
          event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
          aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash
        ) VALUES($1,$2,$3,'gate.control',1,'gate',$4,1,$5,1,0,'{}'::jsonb,$6)`,
        [
          fixture.eventId, fixture.tenantId, fixture.parkId, randomUUID(),
          `control:${fixture.eventId}`, "f".repeat(64)
        ]
      );
      const disabled = fixture.mode === "disabled";
      const controlMode = fixture.mode === "drift" ? "enforce" : fixture.mode;
      await dataSource.query(
        `INSERT INTO sys_property_runtime_control(
          tenant_id,park_id,control_key,control_kind,target,contract_hash,
          enabled,control_mode,enabled_by,enabled_at,approval_reference,disabled_reason
        ) VALUES($1,$2,'event-notification.enforce','enforce','event_notification',$3,
          $4,$5,$6,CASE WHEN $4 THEN clock_timestamp() ELSE NULL END,
          CASE WHEN $4 THEN 'pg-gate-control' ELSE NULL END,'pg-gate')`,
        [
          fixture.tenantId,
          fixture.parkId,
          fixture.mode === "drift" ? "0".repeat(64) : TRACK_B_CONTRACT_SHA256,
          !disabled,
          controlMode,
          disabled ? null : randomUUID()
        ]
      );
    }
    const published: string[] = [];
    const worker = new PropertyEventPublisherWorker(
      new TypeOrmPropertyEventRuntimeStore(dataSource),
      { publish: async (event) => { published.push(event.eventId); } },
      new DatabasePropertyRuntimeControlAdapter()
    );
    const result = await worker.run({ workerId: "pg-control", batchSize: 20 });
    const enforce = fixtures.find((fixture) => fixture.mode === "enforce")!;
    assert.deepEqual(published, [enforce.eventId]);
    assert.equal(result.claimed, 1);
    const deniedFor = (fixture: (typeof fixtures)[number]) =>
      result.controlDeniedScopes.filter((denied) =>
        denied.tenantId === fixture.tenantId && denied.parkId === fixture.parkId);
    for (const fixture of fixtures) {
      const denied = deniedFor(fixture);
      if (fixture.mode === "enforce") {
        assert.deepEqual(denied, []);
        continue;
      }
      assert.deepEqual(denied, [{
        tenantId: fixture.tenantId,
        parkId: fixture.parkId,
        errorCode: fixture.mode === "disabled"
          ? "property-runtime-control-not-enforced"
          : "property-runtime-unavailable"
      }]);
    }
    const statuses = await dataSource.query(
      `SELECT event_id::text,status FROM biz_property_outbox
        WHERE event_id=ANY($1::uuid[]) ORDER BY event_id`,
      [fixtures.map((fixture) => fixture.eventId)]
    ) as Array<{ event_id: string; status: string }>;
    for (const fixture of fixtures) {
      assert.equal(statuses.find((row) => row.event_id === fixture.eventId)?.status,
        fixture.mode === "enforce" ? "published" : "pending");
    }
  });

  it("claims only the first aggregate sequence and fences stale completion", async () => {
    const tenantId = `gate-${randomUUID()}`;
    const parkId = `gate-${randomUUID()}`;
    const orderingKey = `gate:${randomUUID()}`;
    const first = randomUUID();
    const second = randomUUID();
    for (const [eventId, sequence] of [[first, 1], [second, 2]] as const) {
      await dataSource.query(
        `INSERT INTO biz_property_outbox(
          event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
          aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash
        ) VALUES($1,$2,$3,'gate.event',1,'gate',$4,1,$5,$6,0,'{}'::jsonb,$7)`,
        [eventId, tenantId, parkId, randomUUID(), orderingKey, sequence, "a".repeat(64)]
      );
    }
    const store = new TypeOrmPropertyEventRuntimeStore(dataSource);
    const claimed = await store.claimPublishable({
      workerId: "pg-gate",
      limit: 10,
      leaseSeconds: 5,
      authorize: async (_manager, candidate) =>
        candidate.tenantId === tenantId && candidate.parkId === parkId
    });
    assert.deepEqual(claimed.map((event) => event.eventId), [first]);
    assert.equal(await store.markPublished({ ...claimed[0]!, claimToken: randomUUID() }), false);
    assert.equal(await store.markPublished(claimed[0]!), true);
    const next = await store.claimPublishable({
      workerId: "pg-gate",
      limit: 10,
      leaseSeconds: 5,
      authorize: async (_manager, candidate) =>
        candidate.tenantId === tenantId && candidate.parkId === parkId
    });
    assert.deepEqual(next.map((event) => event.eventId), [second]);
  });

  it("commits checksum quarantine before throwing and blocks the ordering key", async () => {
    const tenantId = `gate-${randomUUID()}`;
    const parkId = `gate-${randomUUID()}`;
    const orderingKey = `gate:${randomUUID()}`;
    const source = randomUUID();
    const later = randomUUID();
    for (const [eventId, sequence, status] of [
      [source, 10, "published"], [later, 11, "pending"]
    ] as const) {
      await dataSource.query(
        `INSERT INTO biz_property_outbox(
          event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
          aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash,status,
          published_at
        ) VALUES($1,$2,$3,'gate.event',1,'gate',$4,1,$5,$6,0,'{}'::jsonb,$7,$8::varchar,
          CASE WHEN $8::varchar='published' THEN clock_timestamp() ELSE NULL END)`,
        [eventId, tenantId, parkId, randomUUID(), orderingKey, sequence, "b".repeat(64), status]
      );
    }
    const store = new TypeOrmPropertyEventRuntimeStore(dataSource);
    await assert.rejects(
      dataSource.transaction(async (manager) => {
        const controlStore = new TypeOrmPropertyEventRuntimeStore({
          transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
        } as unknown as DataSource);
        const control = await controlStore.claimPublishable({
          workerId: "control",
          limit: 10,
          leaseSeconds: 5,
          authorize: async (_manager, candidate) =>
            candidate.tenantId === tenantId && candidate.parkId === parkId
        });
        assert.ok(control.some((event) => event.eventId === later));
        throw new Error("rollback-claimability-control");
      }),
      /rollback-claimability-control/
    );
    await assert.rejects(store.consumeInbox({
      scope: { tenantId, parkId }, consumerName: "pg-consumer", consumerVersion: 1,
      event: {
        eventId: source, tenantId, parkId, eventType: "gate.event", eventVersion: 1,
        orderingKey, sequence: "10", eventOrdinal: 0, payload: {}, payloadHash: "c".repeat(64)
      }
    }, async () => ({ result: null, resultHash: "d".repeat(64) })));
    const observer = new DataSource({ type: "postgres", url, entities: [] });
    await observer.initialize();
    const freshRead = await observer.query(
      `SELECT status,error_code FROM biz_property_event_dlq
       WHERE tenant_id=$1 AND park_id=$2 AND original_event_id=$3`,
      [tenantId, parkId, source]
    ) as { status: string; error_code: string }[];
    assert.deepEqual(freshRead, [{
      status: "quarantined", error_code: "event-checksum-mismatch"
    }]);
    const freshStore = new TypeOrmPropertyEventRuntimeStore(observer);
    const claimed = await freshStore.claimPublishable({
      workerId: "blocked",
      limit: 10,
      leaseSeconds: 5,
      authorize: async (_manager, candidate) =>
        candidate.tenantId === tenantId && candidate.parkId === parkId
    });
    await observer.destroy();
    assert.ok(!claimed.some((event) => event.eventId === later));
  });

  it("allows separate delivery incidents for multiple recipients on one event/channel", async () => {
    const tenantId = `gate-${randomUUID()}`;
    const parkId = `gate-${randomUUID()}`;
    const orderingKey = `gate:${randomUUID()}`;
    const eventId = randomUUID();
    const notificationId = randomUUID();
    await dataSource.query(
      `INSERT INTO biz_property_outbox(
        event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
        aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash,status,published_at
      ) VALUES($1,$2,$3,'gate.notification',1,'gate',$4,1,$5,20,0,'{}'::jsonb,$6,
        'published',clock_timestamp())`,
      [eventId, tenantId, parkId, randomUUID(), `${orderingKey}:notification`, "e".repeat(64)]
    );
    await dataSource.query(
      `INSERT INTO biz_property_notification(
        id,tenant_id,park_id,source_event_id,notification_type,projection_version,title,
        summary,severity,route_key,route_params,payload_hash,retention_until
      ) VALUES($1,$2,$3,$4,'approval-infra-exhausted',1,'t','s','critical',
        'approval-infra-exhausted','{}'::jsonb,$5,clock_timestamp()+interval '1 day')`,
      [notificationId, tenantId, parkId, eventId, "f".repeat(64)]
    );
    const deliveryIds: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const recipient = randomUUID();
      const delivery = randomUUID();
      deliveryIds.push(delivery);
      await dataSource.query(
        `INSERT INTO rel_property_notification_recipient(
          id,tenant_id,park_id,notification_id,recipient_user_id,
          recipient_relation_version,recipient_bundle_snapshot
        ) VALUES($1,$2,$3,$4,$5,1,'{}'::jsonb)`,
        [recipient, tenantId, parkId, notificationId, randomUUID()]
      );
      await dataSource.query(
        `INSERT INTO biz_property_notification_delivery(
          id,tenant_id,park_id,recipient_id,channel,delivery_status,version,
          attempt_count,max_attempts,claim_epoch,exhausted_at
        ) VALUES($1,$2,$3,$4,'email','delivery_exhausted',1,8,8,8,clock_timestamp())`,
        [delivery, tenantId, parkId, recipient]
      );
      await dataSource.query(
        `INSERT INTO biz_property_event_dlq(
          tenant_id,park_id,original_event_id,consumer_name,notification_delivery_id,
          payload_hash,failure_side,error_category,error_code,attempt_count,
          first_failed_at,last_failed_at,status
        ) VALUES($1,$2,$3,$4,$5,$6,'consumer','infrastructure','smtp-timeout',8,
          clock_timestamp(),clock_timestamp(),'active')`,
        [tenantId, parkId, eventId, `notification-delivery:${delivery}`, delivery, "e".repeat(64)]
      );
    }
    const count = await dataSource.query(
      `SELECT count(*)::int AS count FROM biz_property_event_dlq
       WHERE tenant_id=$1 AND park_id=$2 AND original_event_id=$3`,
      [tenantId, parkId, eventId]
    ) as { count: number }[];
    assert.equal(count[0]!.count, 2);
    assert.equal(new Set(deliveryIds).size, 2);
  });

  it("writes an immutable terminal audit when generic consumer replay resolves", async () => {
    const tenantId = `gate-${randomUUID()}`;
    const parkId = `gate-${randomUUID()}`;
    const eventId = randomUUID();
    const dlqId = randomUUID();
    const operatorId = randomUUID();
    const payload = { replay: true };
    const payloadHash = hashCanonicalPropertyEvent(payload);
    const orderingKey = `gate:${randomUUID()}`;
    await dataSource.query(
      `INSERT INTO biz_property_outbox(
        event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
        aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash,status,published_at
      ) VALUES($1,$2,$3,'gate.replay',1,'gate',$4,1,$5,1,0,$6::jsonb,$7,
        'published',clock_timestamp())`,
      [
        eventId, tenantId, parkId, randomUUID(), orderingKey,
        JSON.stringify(payload), payloadHash
      ]
    );
    await dataSource.query(
      `INSERT INTO biz_property_event_dlq(
        id,tenant_id,park_id,original_event_id,consumer_name,payload_hash,failure_side,
        error_category,error_code,attempt_count,first_failed_at,last_failed_at,status,version
      ) VALUES($1,$2,$3,$4,'generic-consumer',$5,'consumer','infrastructure',
        'consumer-timeout',8,clock_timestamp(),clock_timestamp(),'replaying',4)`,
      [dlqId, tenantId, parkId, eventId, payloadHash]
    );
    await dataSource.query(
      `INSERT INTO biz_property_event_replay_audit(
        tenant_id,park_id,dlq_id,original_event_id,operator_id,incident_id,reason,
        before_status,after_status,payload_hash,result_hash
      ) VALUES($1,$2,$3,$4,$5,'INC-PG-REPLAY','dependency restored',
        'active','replaying',$6,$7)`,
      [tenantId, parkId, dlqId, eventId, operatorId, payloadHash, "8".repeat(64)]
    );
    const store = new TypeOrmPropertyEventRuntimeStore(dataSource);
    assert.equal(await dataSource.transaction((manager) =>
      store.completeConsumerReplay(manager, {
        dlqId,
        eventId,
        consumerName: "generic-consumer",
        expectedDlqVersion: 4,
        inboxResultHash: "7".repeat(64)
      })), false);
    await store.consumeInbox({
      scope: { tenantId, parkId },
      consumerName: "generic-consumer",
      consumerVersion: 1,
      event: {
        eventId, tenantId, parkId, eventType: "gate.replay", eventVersion: 1,
        orderingKey, sequence: "1", eventOrdinal: 0, payload, payloadHash,
        replayDlqId: dlqId, replayDlqVersion: 4
      }
    }, async (_manager, canonical) => {
      assert.deepEqual(canonical.payload, payload);
      return { result: "completed", resultHash: "7".repeat(64) };
    });
    const terminal = await dataSource.query(
      `SELECT before_status,after_status,result_hash
       FROM biz_property_event_replay_audit
       WHERE tenant_id=$1 AND park_id=$2 AND dlq_id=$3 AND after_status='resolved'`,
      [tenantId, parkId, dlqId]
    ) as { before_status: string; after_status: string; result_hash: string }[];
    assert.equal(terminal.length, 1);
    assert.deepEqual(
      { beforeStatus: terminal[0]!.before_status, afterStatus: terminal[0]!.after_status },
      { beforeStatus: "replaying", afterStatus: "resolved" }
    );
    assert.match(terminal[0]!.result_hash, /^[0-9a-f]{64}$/);
    const receipts = await dataSource.query(
      `SELECT count(*)::int AS count FROM biz_property_inbox
       WHERE tenant_id=$1 AND park_id=$2 AND consumer_name='generic-consumer'
         AND event_id=$3`,
      [tenantId, parkId, eventId]
    ) as { count: number }[];
    assert.equal(receipts[0]!.count, 1);
  });

  it("enforces canonical payload, consumer order, sequence gaps and concurrent dedupe", async () => {
    const tenantId = `gate-${randomUUID()}`;
    const parkId = `gate-${randomUUID()}`;
    const orderingKey = `gate:${randomUUID()}`;
    const store = new TypeOrmPropertyEventRuntimeStore(dataSource);
    const events = [1, 2].map((sequence) => {
      const payload = { sequence, nested: { b: 2, a: 1 } };
      return {
        eventId: randomUUID(),
        tenantId,
        parkId,
        eventType: "gate.ordered",
        eventVersion: 1,
        orderingKey,
        sequence: String(sequence),
        eventOrdinal: 0,
        payload,
        payloadHash: hashCanonicalPropertyEvent(payload)
      };
    });
    for (const event of events) {
      await dataSource.query(
        `INSERT INTO biz_property_outbox(
          event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
          aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash,
          status,published_at
        ) VALUES($1,$2,$3,$4,1,'gate',$5,1,$6,$7,0,$8::jsonb,$9,
          'published',clock_timestamp())`,
        [
          event.eventId, tenantId, parkId, event.eventType, randomUUID(),
          orderingKey, event.sequence, JSON.stringify(event.payload), event.payloadHash
        ]
      );
    }
    let outOfOrderCalls = 0;
    await assert.rejects(store.consumeInbox({
      scope: { tenantId, parkId }, consumerName: "ordered-consumer",
      consumerVersion: 1, event: events[1]!
    }, async () => {
      outOfOrderCalls += 1;
      return { result: null, resultHash: "1".repeat(64) };
    }), (error: { response?: { errorCode?: string } }) =>
      error.response?.errorCode === "property-version-conflict");
    assert.equal(outOfOrderCalls, 0);

    let concurrentCalls = 0;
    const consumeFirst = () => store.consumeInbox({
      scope: { tenantId, parkId }, consumerName: "ordered-consumer",
      consumerVersion: 1, event: events[0]!
    }, async (_manager, canonical) => {
      concurrentCalls += 1;
      assert.deepEqual(canonical.payload, events[0]!.payload);
      return { result: "first", resultHash: "2".repeat(64) };
    });
    await Promise.all([consumeFirst(), consumeFirst()]);
    assert.equal(concurrentCalls, 1);
    await store.consumeInbox({
      scope: { tenantId, parkId }, consumerName: "ordered-consumer",
      consumerVersion: 1, event: events[1]!
    }, async () => ({ result: "second", resultHash: "3".repeat(64) }));

    const gapKey = `gate:${randomUUID()}`;
    const gapPayload = { gap: true };
    const gapEvent = {
      eventId: randomUUID(), tenantId, parkId, eventType: "gate.gap", eventVersion: 1,
      orderingKey: gapKey, sequence: "2", eventOrdinal: 0, payload: gapPayload,
      payloadHash: hashCanonicalPropertyEvent(gapPayload)
    };
    await dataSource.query(
      `INSERT INTO biz_property_outbox(
        event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
        aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash,
        status,published_at
      ) VALUES($1,$2,$3,'gate.gap',1,'gate',$4,1,$5,2,0,$6::jsonb,$7,
        'published',clock_timestamp())`,
      [
        gapEvent.eventId, tenantId, parkId, randomUUID(), gapKey,
        JSON.stringify(gapPayload), gapEvent.payloadHash
      ]
    );
    let gapCalls = 0;
    await assert.rejects(store.consumeInbox({
      scope: { tenantId, parkId }, consumerName: "gap-consumer",
      consumerVersion: 1, event: gapEvent
    }, async () => {
      gapCalls += 1;
      return { result: null, resultHash: "4".repeat(64) };
    }), (error: { response?: { errorCode?: string } }) =>
      error.response?.errorCode === "property-version-conflict");
    assert.equal(gapCalls, 0);

    const tamperKey = `gate:${randomUUID()}`;
    const originalPayload = { safe: true };
    const tamperEvent = {
      eventId: randomUUID(), tenantId, parkId, eventType: "gate.tamper", eventVersion: 1,
      orderingKey: tamperKey, sequence: "1", eventOrdinal: 0, payload: originalPayload,
      payloadHash: hashCanonicalPropertyEvent(originalPayload)
    };
    await dataSource.query(
      `INSERT INTO biz_property_outbox(
        event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
        aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash,
        status,published_at
      ) VALUES($1,$2,$3,'gate.tamper',1,'gate',$4,1,$5,1,0,$6::jsonb,$7,
        'published',clock_timestamp())`,
      [
        tamperEvent.eventId, tenantId, parkId, randomUUID(), tamperKey,
        JSON.stringify(originalPayload), tamperEvent.payloadHash
      ]
    );
    let tamperCalls = 0;
    await assert.rejects(store.consumeInbox({
      scope: { tenantId, parkId }, consumerName: "tamper-consumer",
      consumerVersion: 1,
      event: { ...tamperEvent, payload: { safe: false } }
    }, async () => {
      tamperCalls += 1;
      return { result: null, resultHash: "5".repeat(64) };
    }), (error: { response?: { errorCode?: string } }) =>
      error.response?.errorCode === "event-checksum-mismatch");
    assert.equal(tamperCalls, 0);
    const quarantine = await dataSource.query(
      `SELECT status,error_code FROM biz_property_event_dlq
       WHERE tenant_id=$1 AND park_id=$2 AND original_event_id=$3
         AND consumer_name='tamper-consumer'`,
      [tenantId, parkId, tamperEvent.eventId]
    ) as { status: string; error_code: string }[];
    assert.deepEqual(quarantine, [{
      status: "quarantined", error_code: "event-checksum-mismatch"
    }]);
  });

  it("commits notification projection with inbox and rolls both back on projection failure",
    async () => {
      const tenantId = `gate-${randomUUID()}`;
      const parkId = `gate-${randomUUID()}`;
      const orderingKey = `gate:${randomUUID()}`;
      const eventId = randomUUID();
      const payload = { notification: true };
      const payloadHash = hashCanonicalPropertyEvent(payload);
      await dataSource.query(
        `INSERT INTO biz_property_outbox(
          event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
          aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash,
          status,published_at
        ) VALUES($1,$2,$3,'gate.notification-project',1,'gate',$4,1,$5,1,0,
          $6::jsonb,$7,'published',clock_timestamp())`,
        [
          eventId, tenantId, parkId, randomUUID(), orderingKey,
          JSON.stringify(payload), payloadHash
        ]
      );
      const event = {
        eventId, tenantId, parkId, eventType: "gate.notification-project",
        eventVersion: 1, orderingKey, sequence: "1", eventOrdinal: 0,
        payload, payloadHash
      };
      const notificationId = randomUUID();
      const recipientId = randomUUID();
      const deliveryId = randomUUID();
      const consumer = new PropertyNotificationProjectionConsumer(
        new TypeOrmPropertyEventRuntimeStore(dataSource),
        new TypeOrmPropertyNotificationStore(dataSource)
      );
      const projection = (channel: "in_app" | "invalid"): NotificationProjectionInput => ({
        id: notificationId,
        scope: { tenantId, parkId },
        eventId,
        eventPayloadHash: payloadHash,
        notificationType: "approval-infra-exhausted" as const,
        projectionVersion: 1,
        title: "Approval incident",
        summary: "Retry required",
        severity: "critical" as const,
        sourceType: "approval",
        sourceId: eventId,
        routeId: eventId,
        retentionUntil: new Date("2027-08-01T00:00:00Z"),
        recipients: [{
          id: recipientId,
          userId: randomUUID(),
          relationVersion: 1,
          bundleSnapshot: { role: "operator" },
          channels: [{
            id: deliveryId,
            channel: channel as PropertyNotificationChannelName
          }]
        }]
      });
      await assert.rejects(consumer.consume({
        scope: { tenantId, parkId }, event,
        project: () => projection("invalid")
      }));
      const failedCounts = await dataSource.query(
        `SELECT
          (SELECT count(*)::int FROM biz_property_inbox WHERE event_id=$1) AS inbox,
          (SELECT count(*)::int FROM biz_property_notification WHERE source_event_id=$1)
            AS notification`,
        [eventId]
      ) as { inbox: number; notification: number }[];
      assert.deepEqual(failedCounts[0], { inbox: 0, notification: 0 });
      await consumer.consume({
        scope: { tenantId, parkId }, event,
        project: () => projection("in_app")
      });
      const successCounts = await dataSource.query(
        `SELECT
          (SELECT count(*)::int FROM biz_property_inbox WHERE event_id=$1) AS inbox,
          (SELECT count(*)::int FROM biz_property_notification WHERE source_event_id=$1)
            AS notification`,
        [eventId]
      ) as { inbox: number; notification: number }[];
      assert.deepEqual(successCounts[0], { inbox: 1, notification: 1 });
    });

  it("keeps approval domain and stable outbox append in one caller transaction", async () => {
    const tenantId = `gate-${randomUUID()}`;
    const parkId = `gate-${randomUUID()}`;
    const adapter = new PropertyApprovalRuntimeOutboxAdapter();
    const insertRequest = async (
      manager: import("typeorm").EntityManager,
      requestId: string,
      sourceId: string,
      executionKey: string
    ) => {
      await manager.query(
        `INSERT INTO biz_property_approval_request(
          id,tenant_id,park_id,action_id,source_type,source_id,source_expected_version,
          requester_id,submitter_id,client_idempotency_key,business_intent_key,
          canonical_payload,payload_schema_version,payload_hash,policy_id,policy_version,
          policy_hash,execution_idempotency_key
        ) VALUES($1,$2,$3,'property.mode-transition.request','property_asset',$4,1,
          $5,$5,$6,$7,'{}'::jsonb,1,$8,$9,1,$8,$10)`,
        [
          requestId, tenantId, parkId, sourceId, randomUUID(),
          `client-${requestId}`, `intent-${requestId}`, hashCanonicalPropertyEvent({}),
          randomUUID(), executionKey
        ]
      );
    };
    const requestId = randomUUID();
    const sourceId = randomUUID();
    const executionKey = `execution-${randomUUID()}`;
    const payload = { approvalRequestId: requestId, executionIdempotencyKey: executionKey };
    const event = {
      eventId: randomUUID(),
      eventType: "property.mode-transition.request.executed",
      eventVersion: 1,
      aggregateType: "property_asset",
      aggregateId: sourceId,
      aggregateVersion: 2,
      orderingKey: `property_asset:${sourceId}`,
      eventOrdinal: 0,
      payload,
      payloadHash: hashCanonicalPropertyEvent(payload)
    };
    await dataSource.transaction(async (manager) => {
      await insertRequest(manager, requestId, sourceId, executionKey);
      await adapter.append(manager, {
        scope: { tenantId, parkId }, approvalRequestId: requestId,
        executionIdempotencyKey: executionKey, events: [event]
      });
    });
    await dataSource.transaction(async (manager) => {
      await adapter.append(manager, {
        scope: { tenantId, parkId }, approvalRequestId: requestId,
        executionIdempotencyKey: executionKey, events: [event]
      });
    });
    const committed = await dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM biz_property_approval_request WHERE id=$1) AS domain,
        (SELECT count(*)::int FROM biz_property_outbox WHERE approval_request_id=$1) AS outbox,
        (SELECT next_sequence::int FROM biz_property_event_sequence
         WHERE tenant_id=$2 AND park_id=$3 AND ordering_key=$4) AS next_sequence`,
      [requestId, tenantId, parkId, event.orderingKey]
    ) as { domain: number; outbox: number; next_sequence: number }[];
    assert.deepEqual(committed[0], { domain: 1, outbox: 1, next_sequence: 2 });

    const rollbackRequest = randomUUID();
    const rollbackSource = randomUUID();
    const rollbackExecution = `execution-${randomUUID()}`;
    const rollbackPayload = { approvalRequestId: rollbackRequest };
    await assert.rejects(dataSource.transaction(async (manager) => {
      await insertRequest(manager, rollbackRequest, rollbackSource, rollbackExecution);
      await adapter.append(manager, {
        scope: { tenantId, parkId },
        approvalRequestId: rollbackRequest,
        executionIdempotencyKey: rollbackExecution,
        events: [{
          ...event,
          eventId: randomUUID(),
          aggregateId: rollbackSource,
          orderingKey: `property_asset:${rollbackSource}`,
          payload: rollbackPayload,
          payloadHash: hashCanonicalPropertyEvent(rollbackPayload)
        }]
      });
      throw new Error("rollback-proof");
    }));
    const rolledBack = await dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM biz_property_approval_request WHERE id=$1) AS domain,
        (SELECT count(*)::int FROM biz_property_outbox WHERE approval_request_id=$1) AS outbox`,
      [rollbackRequest]
    ) as { domain: number; outbox: number }[];
    assert.deepEqual(rolledBack[0], { domain: 0, outbox: 0 });
  });

  it("compiles the real Nest module graph without starting workers", async () => {
    const eventRun = PropertyEventPublisherWorker.prototype.run;
    const notificationRun = PropertyNotificationDeliveryWorker.prototype.run;
    let eventRuns = 0;
    let notificationRuns = 0;
    PropertyEventPublisherWorker.prototype.run = async () => {
      eventRuns += 1;
      return {
        claimed: 0,
        published: 0,
        retryWaiting: 0,
        deadLettered: 0,
        staleClaims: 0,
        controlDeniedScopes: []
      };
    };
    PropertyNotificationDeliveryWorker.prototype.run = async () => {
      notificationRuns += 1;
      return { claimed: 0, delivered: 0, failed: 0, exhausted: 0, stale: 0 };
    };

    let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
    try {
      app = await NestFactory.createApplicationContext(
        PropertyRuntimePgTestRootModule,
        { logger: false }
      );

      const controllers = [
        PropertyApprovalController,
        PropertyEventIncidentController,
        PropertyApprovalIncidentController,
        PropertyApprovalIncidentRetryController,
        PropertyNotificationController
      ] as const;
      for (const controller of controllers) assert.ok(app.get(controller));

      const eventStore = app.get(TypeOrmPropertyEventRuntimeStore);
      const notificationStore = app.get(TypeOrmPropertyNotificationStore);
      assert.ok(eventStore);
      assert.ok(notificationStore);
      assert.ok(app.get(PropertyIncidentService));
      assert.ok(app.get(PropertyNotificationService));
      assert.ok(app.get(PropertyEventPublisherWorker));
      assert.ok(app.get(PropertyNotificationDeliveryWorker));
      const retryAdapter = app.get(PropertyApprovalIncidentRetryAdapter);
      assert.ok(retryAdapter);

      const eventStoreToken = app.get(PROPERTY_EVENT_RUNTIME_STORE);
      const retryToken = app.get(PROPERTY_APPROVAL_INCIDENT_RETRY);
      const notificationStoreToken = app.get(PROPERTY_NOTIFICATION_STORE);
      const publisher = app.get<PropertyEventPublisherPort>(PROPERTY_EVENT_PUBLISHER);
      const incidentAuthorization = app.get<PropertyIncidentAuthorizationPort>(
        PROPERTY_INCIDENT_AUTHORIZATION
      );
      const notificationAuthorization = app.get<PropertyNotificationAuthorizationPort>(
        PROPERTY_NOTIFICATION_AUTHORIZATION
      );
      const notificationChannel = app.get<PropertyNotificationChannelPort>(
        PROPERTY_NOTIFICATION_CHANNEL
      );
      assert.equal(eventStoreToken, eventStore);
      assert.equal(retryToken, retryAdapter);
      assert.equal(notificationStoreToken, notificationStore);

      const errorCode = (error: unknown) => {
        const response = (error as { getResponse?: () => unknown }).getResponse?.();
        return typeof response === "object" && response !== null && "errorCode" in response
          ? String((response as { errorCode: unknown }).errorCode)
          : "";
      };
      const actor = {
        sub: randomUUID(), username: "pg-gate", tenantId: "tenant", parkId: "park",
        roles: [], permissions: []
      };
      await assert.rejects(
        publisher.publish({
          eventId: randomUUID(), tenantId: "tenant", parkId: "park",
          eventType: "gate.di", eventVersion: 1, orderingKey: `gate:${randomUUID()}`,
          sequence: "1", eventOrdinal: 0, payload: {}, payloadHash: "a".repeat(64),
          attemptCount: 0, claimEpoch: "0", claimToken: randomUUID()
        }),
        (error) => errorCode(error) === "property-runtime-unavailable"
      );
      await assert.rejects(
        incidentAuthorization.authorize({
          scope: { tenantId: "tenant", parkId: "park" }, actor,
          surface: "event-delivery", operation: "read"
        }),
        (error) => errorCode(error) === "property-action-forbidden"
      );
      await assert.rejects(
        notificationAuthorization.authorize({
          scope: { tenantId: "tenant", parkId: "park" }, actor, operation: "read"
        }),
        (error) => errorCode(error) === "property-action-forbidden"
      );
      await assert.rejects(
        notificationChannel.deliver({
          id: randomUUID(),
          scope: { tenantId: "tenant", parkId: "park" },
          notificationId: randomUUID(),
          recipientUserId: randomUUID(),
          channel: "email",
          version: 1,
          attemptCount: 0,
          maxAttempts: 8,
          claimEpoch: "0",
          claimToken: randomUUID()
        }),
        (error) => errorCode(error) === "property-runtime-unavailable"
      );

      const routes: string[] = [];
      for (const controller of controllers) {
        assert.deepEqual(Reflect.getMetadata(MODULES_KEY, controller), ["asset"]);
        const basePath = String(Reflect.getMetadata(PATH_METADATA, controller));
        for (const name of Object.getOwnPropertyNames(controller.prototype)) {
          const handler = controller.prototype[name as keyof typeof controller.prototype];
          if (typeof handler !== "function") continue;
          const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
          if (path === undefined || method === undefined) continue;
          const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] | undefined;
          assert.ok(permissions?.length, `${controller.name}.${name} must have permissions`);
          routes.push(`${method}:${basePath}/${path}`);
        }
      }
      assert.equal(routes.length, 13);
      assert.equal(new Set(routes).size, 13);
      assert.deepEqual(
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          PropertyApprovalIncidentRetryController.prototype.retry
        ),
        [
          PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE,
          PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT,
          PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_RETRY
        ]
      );
      assert.equal(
        routes.filter((route) => route.endsWith(
          ":property/approvals/:requestId/retry"
        )).length,
        1
      );

      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(eventRuns, 0);
      assert.equal(notificationRuns, 0);
    } finally {
      await app?.close();
      await new Promise<void>((resolve) => setImmediate(resolve));
      PropertyEventPublisherWorker.prototype.run = eventRun;
      PropertyNotificationDeliveryWorker.prototype.run = notificationRun;
    }
    assert.equal(eventRuns, 0);
    assert.equal(notificationRuns, 0);
  });
});
