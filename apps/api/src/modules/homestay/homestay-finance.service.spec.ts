import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayService } from "./homestay.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("homestay façade delegates the complete ledger and approved-finance closure without storage access", async () => {
  const calls: string[] = [];
  const finance = {
    registerLedgerEntry: async (...args: unknown[]) => {
      calls.push(`register:${args.length}`);
      return { id: "ledger-1" };
    },
    executeApprovedFinance: async (...args: unknown[]) => {
      calls.push(`approved:${args.length}`);
    }
  };
  const poisonedStorage = new Proxy({}, {
    get: () => {
      throw new Error("homestay façade must not access finance storage");
    }
  });
  const service = new HomestayService(
    {} as never,
    {} as never,
    poisonedStorage as never,
    poisonedStorage as never,
    poisonedStorage as never,
    poisonedStorage as never,
    poisonedStorage as never,
    poisonedStorage as never,
    poisonedStorage as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    poisonedStorage as never,
    undefined,
    undefined,
    undefined,
    undefined,
    finance as never
  );

  assert.deepEqual(
    await service.registerLedgerEntry(scope, actor, "booking-1", {
      entry_type: "charge"
    } as never, "client-key"),
    { id: "ledger-1" }
  );
  await service.executeApprovedFinance({ requestId: "request-1" } as never);

  assert.deepEqual(calls, ["register:5", "approved:1"]);
});
