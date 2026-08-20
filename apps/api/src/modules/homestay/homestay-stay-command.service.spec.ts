import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import { ConflictException } from "@nestjs/common";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayStayCredentialEntity } from "./entities/homestay.entities";
import { HomestayService } from "./homestay.service";
import { HomestayStayCommandService } from "./homestay-stay-command.service";
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
    markCredentialLost: async (...args: unknown[]) => { calls.push({ name: "lost", args }); return "lost"; },
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
  assert.equal(await service.markCredentialLost(scope, actor, "booking-1", "credential-1", "遗失"), "lost");
  assert.equal(await service.checkIn(scope, actor, "booking-1"), "in");
  assert.equal(await service.checkOut(scope, actor, "booking-1"), "out");
  assert.deepEqual(calls.map((call) => call.name), ["guest", "issue", "return", "lost", "check-in", "check-out"]);
  assert.deepEqual(calls[0]!.args, [scope, actor, "booking-1", guestDto]);
  assert.deepEqual(calls[2]!.args, [scope, actor, "booking-1", "credential-1"]);
  assert.deepEqual(calls[3]!.args, [scope, actor, "booking-1", "credential-1", "遗失"]);
});

function credentialLossHarness(status: "issued" | "returned" | "lost") {
  let saveCalls = 0;
  const credential = {
    id: "credential-1",
    credentialType: "card",
    credentialLabel: "房卡 A",
    credentialReference: null,
    status,
    issuedAt: new Date("2026-08-20T00:00:00.000Z"),
    returnedAt: status === "returned" ? new Date("2026-08-20T01:00:00.000Z") : null,
    updateBy: "actor-before"
  };
  const repository = {
    findOne: async () => credential,
    save: async (value: unknown) => { saveCalls += 1; return value; }
  };
  const manager = {
    getRepository: (entity: unknown) => {
      assert.equal(entity, HomestayStayCredentialEntity);
      return repository;
    }
  };
  const service = new HomestayStayCommandService(
    {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (callback: (value: typeof manager) => unknown) => callback(manager) } as never,
    { lockBooking: async () => ({ id: "booking-1", unitId: "unit-1" }) } as never
  );
  return { credential, getSaveCalls: () => saveCalls, service };
}

test("issued credential becomes lost once and records the actor", async () => {
  const harness = credentialLossHarness("issued");
  const result = await harness.service.markCredentialLost(
    scope, actor, "booking-1", "credential-1", "住客遗失"
  );
  assert.equal(result.status, "lost");
  assert.equal(harness.credential.updateBy, actor.sub);
  assert.equal(harness.getSaveCalls(), 1);
});

test("lost credential replay is idempotent and returned credential cannot become lost", async () => {
  const replay = credentialLossHarness("lost");
  assert.equal((await replay.service.markCredentialLost(
    scope, actor, "booking-1", "credential-1", "重复请求"
  )).status, "lost");
  assert.equal(replay.getSaveCalls(), 0);

  const returned = credentialLossHarness("returned");
  await assert.rejects(
    returned.service.markCredentialLost(scope, actor, "booking-1", "credential-1", "误操作"),
    (error: unknown) => error instanceof ConflictException
      && error.message === "Only issued credentials can be marked as lost"
  );
  assert.equal(returned.getSaveCalls(), 0);
});
