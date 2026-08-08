import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PropertyApprovalRuntimeScheduler } from "./property-approval.runtime.scheduler";
import type { PropertyApprovalExecutionWorker } from "./property-approval.execution.worker";
import type { PropertyEventPublisherWorker } from "./outbox/property-event.worker";
import type { PropertyNotificationDeliveryWorker } from "./outbox/property-notification.worker";

describe("PropertyApprovalRuntimeScheduler", () => {
  it("drains execution, publication, replay, and notification stages in order", async () => {
    const calls: string[] = [];
    const scheduler = new PropertyApprovalRuntimeScheduler(
      { run: async () => { calls.push("execution"); } } as unknown as PropertyApprovalExecutionWorker,
      {
        run: async () => { calls.push("event"); },
        runConsumerReplays: async () => { calls.push("replay"); return 0; }
      } as unknown as PropertyEventPublisherWorker,
      { run: async () => { calls.push("notification"); } } as unknown as PropertyNotificationDeliveryWorker
    );
    await scheduler.run();
    assert.deepEqual(calls, ["execution", "event", "replay", "notification"]);
  });
});
