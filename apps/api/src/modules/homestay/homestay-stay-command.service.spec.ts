import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayService } from "./homestay.service";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = { sub: "actor-1", username: "operator", tenantId: "tenant-1", parkId: "park-1",
  roles: [], permissions: [] } as JwtPrincipal;

test("homestay façade delegates the complete guest, credential, and stay command closure", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const stayCommands = {
    addGuest: async (...args: unknown[]) => { calls.push({ name: "guest", args }); return "guest"; },
    issueCredential: async (...args: unknown[]) => { calls.push({ name: "issue", args }); return "issued"; },
    returnCredential: async (...args: unknown[]) => { calls.push({ name: "return", args }); return "returned"; },
    checkIn: async (...args: unknown[]) => { calls.push({ name: "check-in", args }); return "in"; },
    checkOut: async (...args: unknown[]) => { calls.push({ name: "check-out", args }); return "out"; }
  };
  const service = new HomestayService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never,
    { transaction: async () => { throw new Error("facade storage access"); } } as never,
    undefined, undefined, undefined, undefined, undefined,
    new HomestayTransactionSupportService(), undefined, undefined, stayCommands as never
  );
  const guestDto = { party_id: "party-1" } as never;
  const credentialDto = { credential_type: "key" } as never;

  assert.equal(await service.addGuest(scope, actor, "booking-1", guestDto), "guest");
  assert.equal(await service.issueCredential(scope, actor, "booking-1", credentialDto), "issued");
  assert.equal(await service.returnCredential(scope, actor, "booking-1", "credential-1"), "returned");
  assert.equal(await service.checkIn(scope, actor, "booking-1"), "in");
  assert.equal(await service.checkOut(scope, actor, "booking-1"), "out");
  assert.deepEqual(calls.map((call) => call.name), ["guest", "issue", "return", "check-in", "check-out"]);
  assert.deepEqual(calls[0]!.args, [scope, actor, "booking-1", guestDto]);
  assert.deepEqual(calls[2]!.args, [scope, actor, "booking-1", "credential-1"]);
});
