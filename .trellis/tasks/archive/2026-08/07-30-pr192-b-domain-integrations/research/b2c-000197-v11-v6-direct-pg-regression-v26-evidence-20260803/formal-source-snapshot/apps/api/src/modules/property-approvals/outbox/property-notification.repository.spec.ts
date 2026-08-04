import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataSource, EntityManager } from "typeorm";
import { TypeOrmPropertyNotificationStore } from "./property-notification.repository";

const scope = { tenantId: "tenant", parkId: "park" };
const notificationId = "11111111-1111-4111-8111-111111111111";
const recipientId = "22222222-2222-4222-8222-222222222222";

describe("TypeOrmPropertyNotificationStore", () => {
  it("uses exact recipient identity in detail lookup", async () => {
    let params: unknown[] = [];
    const store = new TypeOrmPropertyNotificationStore({
      query: async (_sql: string, values: unknown[]) => {
        params = values;
        return [];
      }
    } as unknown as DataSource);
    const result = await store.detail(scope, recipientId, notificationId);
    assert.equal(result, null);
    assert.deepEqual(params, ["tenant", "park", recipientId, notificationId]);
  });

  it("makes immutable notification, recipient and channel projection idempotent", async () => {
    const statements: string[] = [];
    const manager = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("SELECT payload_hash FROM biz_property_outbox")) {
          return [{ payload_hash: "a".repeat(64) }];
        }
        if (sql.includes("SELECT id,payload_hash FROM biz_property_notification")) {
          const insert = statements.find((value) =>
            value.includes("INSERT INTO biz_property_notification("));
          assert.match(insert ?? "", /ON CONFLICT .*DO NOTHING/s);
          // The hash parameter is supplied by the repository. Return it through
          // the fake manager on the second run via the captured argument below.
          return [{ id: notificationId, payload_hash: lastProjectionHash }];
        }
        if (sql.includes("SELECT id FROM rel_property_notification_recipient")) {
          return [{ id: recipientId }];
        }
        return [];
      }
    } as unknown as EntityManager;
    let lastProjectionHash = "";
    const originalQuery = manager.query.bind(manager);
    (manager as unknown as { query: (sql: string, params?: unknown[]) => Promise<unknown> }).query =
      async (sql: string, params?: unknown[]) => {
        if (sql.includes("INSERT INTO biz_property_notification(")) {
          lastProjectionHash = String(params?.[11]);
        }
        return originalQuery(sql, params);
      };
    const store = new TypeOrmPropertyNotificationStore({} as DataSource);
    const projection = {
      id: notificationId,
      scope,
      eventId: "33333333-3333-4333-8333-333333333333",
      eventPayloadHash: "a".repeat(64),
      notificationType: "approval-infra-exhausted" as const,
      projectionVersion: 1,
      title: "Approval requires attention",
      summary: "Execution retry budget exhausted",
      severity: "critical" as const,
      sourceType: "approval",
      sourceId: notificationId,
      routeId: notificationId,
      retentionUntil: new Date("2027-07-31T00:00:00.000Z"),
      recipients: [{
        id: recipientId,
        userId: recipientId,
        relationVersion: 1,
        bundleSnapshot: { bundle: "approval-operator" },
        channels: [{
          id: "44444444-4444-4444-8444-444444444444",
          channel: "in_app" as const
        }]
      }]
    };
    await store.project(manager, projection);
    await store.project(manager, projection);
    assert.ok(statements.filter((sql) =>
      sql.includes("INSERT INTO rel_property_notification_recipient(")).every((sql) =>
      /ON CONFLICT .*DO NOTHING/s.test(sql)));
    assert.ok(statements.filter((sql) =>
      sql.includes("INSERT INTO biz_property_notification_delivery(")).every((sql) =>
      /ON CONFLICT .*DO NOTHING/s.test(sql)));
  });

  it("rejects immutable snapshot drift before appending a recipient", async () => {
    const statements: string[] = [];
    const manager = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("SELECT payload_hash FROM biz_property_outbox")) {
          return [{ payload_hash: "a".repeat(64) }];
        }
        if (sql.includes("SELECT id,payload_hash FROM biz_property_notification")) {
          return [{ id: notificationId, payload_hash: "0".repeat(64) }];
        }
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyNotificationStore({} as DataSource);
    await assert.rejects(store.project(manager, {
      id: notificationId,
      scope,
      eventId: "33333333-3333-4333-8333-333333333333",
      eventPayloadHash: "a".repeat(64),
      notificationType: "approval-infra-exhausted",
      projectionVersion: 1,
      title: "title",
      summary: "summary",
      severity: "critical",
      sourceType: "approval",
      sourceId: notificationId,
      routeId: notificationId,
      retentionUntil: new Date("2027-01-01T00:00:00Z"),
      recipients: [{
        id: recipientId,
        userId: recipientId,
        relationVersion: 1,
        bundleSnapshot: {},
        channels: [{ id: notificationId, channel: "in_app" }]
      }]
    }), (error: { response?: { errorCode?: string } }) =>
      error.response?.errorCode === "event-checksum-mismatch");
    assert.ok(!statements.some((sql) =>
      sql.includes("INSERT INTO rel_property_notification_recipient")));
  });

  it("records a failed delivery attempt and creates DLQ only when exhausted", async () => {
    const statements: string[] = [];
    const manager = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("UPDATE biz_property_notification_delivery")) {
          return [{
            tenant_id: "tenant", park_id: "park", id: notificationId,
            channel: "email", attempt_count: 8, delivery_status: "delivery_exhausted"
          }];
        }
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyNotificationStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
    } as unknown as DataSource);
    const status = await store.failDelivery({
      delivery: {
        id: notificationId, scope, notificationId, recipientUserId: recipientId,
        channel: "email", version: 2, attemptCount: 7, maxAttempts: 8,
        claimEpoch: "2", claimToken: notificationId
      },
      errorCode: "smtp-timeout",
      retryAt: new Date()
    });
    assert.equal(status, "delivery_exhausted");
    assert.ok(statements.some((sql) =>
      sql.includes("biz_property_notification_delivery_audit")));
    assert.ok(statements.some((sql) => sql.includes("biz_property_event_dlq")));
  });

  it("rejects a new mark-read key with stale expectedVersion even when already read", async () => {
    const statements: string[] = [];
    let authorizationManager: EntityManager | undefined;
    const manager = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("SELECT read_status,read_version")) {
          return [{ read_status: "read", read_version: 2 }];
        }
        if (sql.includes("SELECT request_hash,receipt_status")) return [];
        return [];
      }
    } as unknown as EntityManager;
    const store = new TypeOrmPropertyNotificationStore({
      transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager),
      query: async () => []
    } as unknown as DataSource);
    await assert.rejects(store.markRead({
      scope, recipientUserId: recipientId, notificationId,
      command: { clientKey: "read-1", expectedReadVersion: 1 },
      authorize: async (value) => {
        authorizationManager = value;
        assert.equal(statements.length, 0);
      }
    }), (error: { response?: { errorCode?: string } }) =>
      error.response?.errorCode === "property-version-conflict");
    assert.ok(!statements.some((sql) =>
      sql.includes("UPDATE rel_property_notification_recipient")));
    assert.equal(authorizationManager, manager);
  });
});
