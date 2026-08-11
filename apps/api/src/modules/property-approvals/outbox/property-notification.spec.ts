import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPropertyNotificationDeepLink } from "./property-notification.deep-link";
import type {
  ClaimedNotificationDelivery,
  PropertyNotificationStore
} from "./property-notification.contracts";
import { PropertyNotificationDeliveryWorker } from "./property-notification.worker";

const id = "11111111-1111-4111-8111-111111111111";

describe("property notification projection", () => {
  it("uses only the nine canonical deep-link templates", () => {
    assert.equal(buildPropertyNotificationDeepLink("identity-verification-assigned", id),
      `/assets/identity-submissions/${id}`);
    assert.equal(buildPropertyNotificationDeepLink("homestay-approval-stage-assigned", id),
      `/homestay/tasks?requestId=${id}`);
    assert.equal(buildPropertyNotificationDeepLink("housing-approval-stage-assigned", id),
      `/housing/tasks?requestId=${id}`);
    assert.equal(buildPropertyNotificationDeepLink("homestay-task-assigned", id),
      `/homestay/tasks?taskId=${id}`);
    assert.equal(buildPropertyNotificationDeepLink("housing-task-assigned", id),
      `/housing/tasks?taskId=${id}`);
    assert.equal(buildPropertyNotificationDeepLink("property-event-delivery-incident", id),
      `/property/event-delivery-incidents/${id}`);
    assert.equal(buildPropertyNotificationDeepLink("approval-infra-exhausted", id),
      `/property/approval-incidents/${id}`);
    assert.equal(buildPropertyNotificationDeepLink("homestay-approval-executed", id),
      `/property/approvals/${id}`);
    assert.equal(buildPropertyNotificationDeepLink("housing-approval-executed", id),
      `/property/approvals/${id}`);
    assert.throws(() =>
      buildPropertyNotificationDeepLink("approval-infra-exhausted", "https://evil.example"));
  });

  it("keeps channel failure/retry independent and reports exhaustion", async () => {
    const delivery: ClaimedNotificationDelivery = {
      id, scope: { tenantId: "tenant", parkId: "park" }, notificationId: id,
      recipientUserId: id, channel: "email", version: 2, attemptCount: 7,
      maxAttempts: 8, claimEpoch: "1", claimToken: id
    };
    let failureCode = "";
    const store = {
      claimDeliveries: async () => [delivery],
      failDelivery: async (input: { errorCode: string }) => {
        failureCode = input.errorCode;
        return "delivery_exhausted" as const;
      }
    } as unknown as PropertyNotificationStore;
    const worker = new PropertyNotificationDeliveryWorker(store, {
      deliver: async () => { throw Object.assign(new Error("redacted"), { code: "smtp-timeout" }); }
    });
    const result = await worker.run();
    assert.equal(result.exhausted, 1);
    assert.equal(failureCode, "smtp-timeout");
  });
});
