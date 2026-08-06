import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import type {
  PropertyApprovalIncidentRetryPort,
  PropertyEventRuntimeStore,
  PropertyIncidentAuthorizationPort
} from "./property-event-runtime.contracts";
import { PropertyIncidentService } from "./property-incident.service";

const scope = { tenantId: "tenant", parkId: "park" };
const actor: JwtPrincipal = {
  sub: "11111111-1111-4111-8111-111111111111",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

describe("PropertyIncidentService", () => {
  it("fails closed before querying when any injected authorization dimension rejects", async () => {
    let queried = false;
    const store = {
      listEventIncidents: async () => {
        queried = true;
        throw new Error("must not run");
      }
    } as unknown as PropertyEventRuntimeStore;
    const authorization = {
      authorize: async () => { throw new Error("asset-module-expired"); }
    } as PropertyIncidentAuthorizationPort;
    const service = new PropertyIncidentService(
      store,
      authorization,
      {} as PropertyApprovalIncidentRetryPort
    );
    await assert.rejects(service.listEvents(scope, actor, {}), /asset-module-expired/);
    assert.equal(queried, false);
  });

  it("projects replay only when the authorization port grants the exact action", async () => {
    const store = {
      listEventIncidents: async () => ({
        items: [{
          dlqId: "22222222-2222-4222-8222-222222222222",
          eventId: "33333333-3333-4333-8333-333333333333",
          notificationDeliveryId: null,
          failureSide: "publisher",
          consumerName: "__publisher__",
          status: "active",
          version: 1,
          attemptCount: 8,
          firstFailedAt: "2026-07-31T00:00:00.000Z",
          lastFailedAt: "2026-07-31T00:00:00.000Z",
          errorCategory: "infrastructure",
          errorCode: "broker-timeout",
          incidentId: "INC-1",
          lastReplayAt: null,
          deepLink: "/property/event-delivery-incidents/22222222-2222-4222-8222-222222222222",
          allowedActions: []
        }],
        page: 1, pageSize: 20, total: 1, allowedActions: []
      })
    } as unknown as PropertyEventRuntimeStore;
    const authorization = {
      authorize: async () => ({ allowedActions: ["property.event.replay"] as const })
    } as PropertyIncidentAuthorizationPort;
    const service = new PropertyIncidentService(
      store,
      authorization,
      {} as PropertyApprovalIncidentRetryPort
    );
    const result = await service.listEvents(scope, actor, {});
    assert.deepEqual(result.items[0]?.allowedActions, ["property.event.replay"]);
  });

  it("re-authorizes replay as a mutation before changing DLQ state", async () => {
    const operations: string[] = [];
    const store = {
      prepareEventReplay: async (input: { authorize: (manager: never) => Promise<void> }) => {
        await input.authorize({} as never);
        operations.push("mutate");
        return {
          dlqId: "22222222-2222-4222-8222-222222222222",
          eventId: "33333333-3333-4333-8333-333333333333",
          status: "replaying" as const,
          version: 2
        };
      }
    } as unknown as PropertyEventRuntimeStore;
    const authorization = {
      authorize: async (input: { operation: string }) => {
        operations.push(`authorize:${input.operation}`);
        return { allowedActions: ["property.event.replay"] as const };
      }
    } as PropertyIncidentAuthorizationPort;
    const service = new PropertyIncidentService(
      store,
      authorization,
      {} as PropertyApprovalIncidentRetryPort
    );
    await service.replayEvent(
      scope,
      actor,
      "22222222-2222-4222-8222-222222222222",
      {
        clientKey: "replay", incidentId: "INC-1", reason: "restored",
        expectedDlqVersion: 1
      }
    );
    assert.deepEqual(operations, ["authorize:replay", "mutate"]);
  });
});
