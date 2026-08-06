import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "typeorm";
import type { PropertyEventEnvelope, PropertyEventRuntimeStore } from "./property-event-runtime.contracts";
import { PropertyEventPublisherWorker } from "./property-event.worker";

const event = (id: string): PropertyEventEnvelope => ({
  eventId: id,
  tenantId: "tenant",
  parkId: "park",
  eventType: "approval.executed",
  eventVersion: 1,
  orderingKey: "approval:one",
  sequence: "1",
  eventOrdinal: 0,
  payload: { requestId: "one" },
  payloadHash: "a".repeat(64),
  attemptCount: 0,
  claimEpoch: "1",
  claimToken: "11111111-1111-4111-8111-111111111111"
});

const enforcedControl = {
  inspect: async () => ({ effective: true, mode: "enforce" as const, version: 1 })
};

describe("PropertyEventPublisherWorker", () => {
  it("publishes a claimed envelope and completes only with its fenced claim", async () => {
    const calls: string[] = [];
    const store = {
      claimPublishable: async (input: {
        authorize: (manager: EntityManager, scope: { tenantId: string; parkId: string }) =>
          Promise<boolean>;
      }) => await input.authorize({} as EntityManager, {
        tenantId: "tenant", parkId: "park"
      }) ? [event("11111111-1111-4111-8111-111111111111")] : [],
      markPublished: async (claimed: PropertyEventEnvelope) => {
        calls.push(`complete:${claimed.claimToken}`);
        return true;
      }
    } as unknown as PropertyEventRuntimeStore;
    const worker = new PropertyEventPublisherWorker(store, {
      publish: async (claimed) => { calls.push(`publish:${claimed.eventId}`); }
    }, enforcedControl as never);
    const result = await worker.run({ workerId: "worker-1" });
    assert.deepEqual(result, {
      claimed: 1, published: 1, retryWaiting: 0, deadLettered: 0, staleClaims: 0,
      controlDeniedScopes: []
    });
    assert.deepEqual(calls, [
      "publish:11111111-1111-4111-8111-111111111111",
      "complete:11111111-1111-4111-8111-111111111111"
    ]);
  });

  it("moves failures through the store retry/DLQ decision without changing the event", async () => {
    const original = event("22222222-2222-4222-8222-222222222222");
    let failedEvent: PropertyEventEnvelope | undefined;
    const store = {
      claimPublishable: async (input: {
        authorize: (manager: EntityManager, scope: { tenantId: string; parkId: string }) =>
          Promise<boolean>;
      }) => await input.authorize({} as EntityManager, {
        tenantId: "tenant", parkId: "park"
      }) ? [original] : [],
      markPublishFailure: async (input: { event: PropertyEventEnvelope }) => {
        failedEvent = input.event;
        return "dlq" as const;
      }
    } as unknown as PropertyEventRuntimeStore;
    const worker = new PropertyEventPublisherWorker(store, {
      publish: async () => { throw Object.assign(new Error("secret"), { code: "broker-timeout" }); }
    }, enforcedControl as never);
    const result = await worker.run({ workerId: "worker-2", maxAttempts: 1 });
    assert.equal(result.deadLettered, 1);
    assert.equal(failedEvent, original);
  });

  it("consumer replay republishes the same event identity and checksum", async () => {
    const original = event("33333333-3333-4333-8333-333333333333");
    original.replayDlqId = "44444444-4444-4444-8444-444444444444";
    original.replayDlqVersion = 2;
    let published: Readonly<PropertyEventEnvelope> | undefined;
    const store = {
      listReplayingEvents: async (input: {
        authorize: (manager: EntityManager, scope: { tenantId: string; parkId: string }) =>
          Promise<boolean>;
      }) => await input.authorize({} as EntityManager, {
        tenantId: "tenant", parkId: "park"
      }) ? [original] : []
    } as unknown as PropertyEventRuntimeStore;
    const worker = new PropertyEventPublisherWorker(store, {
      publish: async (value) => { published = value; }
    }, enforcedControl as never);
    assert.equal(await worker.runConsumerReplays(), 1);
    assert.equal(published?.eventId, original.eventId);
    assert.equal(published?.payloadHash, original.payloadHash);
    assert.equal(published?.payload, original.payload);
  });

  it("publishes only authorized consumer replays and exposes denied diagnostics", async () => {
    const good = event("66666666-6666-4666-8666-666666666666");
    good.replayDlqId = "77777777-7777-4777-8777-777777777777";
    good.replayDlqVersion = 2;
    const published: string[] = [];
    const store = {
      listReplayingEvents: async (input: {
        authorize: (manager: EntityManager, scope: { tenantId: string; parkId: string }) =>
          Promise<boolean>;
      }) => {
        const bad = await input.authorize({} as EntityManager, {
          tenantId: "tenant-bad", parkId: "park-bad"
        });
        const allowed = await input.authorize({} as EntityManager, {
          tenantId: "tenant-good", parkId: "park-good"
        });
        assert.equal(bad, false);
        return allowed ? [good] : [];
      }
    } as unknown as PropertyEventRuntimeStore;
    const worker = new PropertyEventPublisherWorker(store, {
      publish: async (value) => { published.push(value.eventId); }
    }, {
      inspect: async (_manager: EntityManager, candidate: { tenantId: string }) =>
        candidate.tenantId === "tenant-good"
          ? { effective: true, mode: "enforce", version: 1 }
          : { effective: false, mode: "disabled", version: 1 }
    } as never);
    assert.equal(await worker.runConsumerReplays(), 1);
    assert.deepEqual(published, [good.eventId]);
    assert.deepEqual(worker.getReplayControlDiagnostics(), [{
      tenantId: "tenant-bad",
      parkId: "park-bad",
      errorCode: "property-runtime-control-not-enforced"
    }]);
  });

  it("does not claim or mutate when event-notification enforce is not effective", async () => {
    for (const mode of ["disabled", "observe", "shadow"] as const) {
      let claimed = false;
      let mutated = false;
      const store = {
        claimPublishable: async (input: {
          authorize: (manager: EntityManager, scope: { tenantId: string; parkId: string }) =>
            Promise<boolean>;
        }) => {
          const allowed = await input.authorize({} as EntityManager, {
            tenantId: "tenant", parkId: "park"
          });
          if (allowed) claimed = true;
          return [];
        },
        markPublished: async () => { mutated = true; return true; },
        markPublishFailure: async () => { mutated = true; return "retry_wait" as const; }
      } as unknown as PropertyEventRuntimeStore;
      const worker = new PropertyEventPublisherWorker(store, {
        publish: async () => { mutated = true; }
      }, {
        inspect: async () => ({ effective: false, mode, version: 1 })
      } as never);
      assert.deepEqual(await worker.run({ workerId: `worker-${mode}` }), {
        claimed: 0, published: 0, retryWaiting: 0, deadLettered: 0, staleClaims: 0,
        controlDeniedScopes: [{
          tenantId: "tenant",
          parkId: "park",
          errorCode: "property-runtime-control-not-enforced"
        }]
      });
      assert.equal(claimed, false);
      assert.equal(mutated, false);
    }
  });

  it("pauses the affected scope when runtime control contract validation fails", async () => {
    let mutated = false;
    const store = {
      claimPublishable: async (input: {
        authorize: (manager: EntityManager, scope: { tenantId: string; parkId: string }) =>
          Promise<boolean>;
      }) => {
        await input.authorize({} as EntityManager, { tenantId: "tenant", parkId: "park" });
        return [];
      }
    } as unknown as PropertyEventRuntimeStore;
    const worker = new PropertyEventPublisherWorker(store, {
      publish: async () => { mutated = true; }
    }, {
      inspect: async () => { throw new Error("runtime-control-contract-mismatch"); }
    } as never);
    assert.deepEqual(await worker.run({ workerId: "worker-contract" }), {
      claimed: 0, published: 0, retryWaiting: 0, deadLettered: 0, staleClaims: 0,
      controlDeniedScopes: [{
        tenantId: "tenant", parkId: "park", errorCode: "property-runtime-unavailable"
      }]
    });
    assert.equal(mutated, false);
  });

  it("isolates a denied scope while claiming and publishing an enforced scope", async () => {
    const published: string[] = [];
    const store = {
      claimPublishable: async (input: {
        authorize: (manager: EntityManager, scope: { tenantId: string; parkId: string }) =>
          Promise<boolean>;
      }) => {
        const denied = await input.authorize({} as EntityManager, {
          tenantId: "tenant-bad", parkId: "park-bad"
        });
        const allowed = await input.authorize({} as EntityManager, {
          tenantId: "tenant-good", parkId: "park-good"
        });
        assert.equal(denied, false);
        return allowed ? [event("55555555-5555-4555-8555-555555555555")] : [];
      },
      markPublished: async () => true
    } as unknown as PropertyEventRuntimeStore;
    const worker = new PropertyEventPublisherWorker(store, {
      publish: async (value) => { published.push(value.eventId); }
    }, {
      inspect: async (_manager: EntityManager, candidate: { tenantId: string }) =>
        candidate.tenantId === "tenant-good"
          ? { effective: true, mode: "enforce", version: 1 }
          : { effective: false, mode: "disabled", version: 1 }
    } as never);
    const result = await worker.run({ workerId: "worker-isolated" });
    assert.deepEqual(published, ["55555555-5555-4555-8555-555555555555"]);
    assert.deepEqual(result.controlDeniedScopes, [{
      tenantId: "tenant-bad",
      parkId: "park-bad",
      errorCode: "property-runtime-control-not-enforced"
    }]);
  });
});
