import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { HousingHandoverCommandService } from "./housing-handover-command.service";
import type { HousingLeaseEntity } from "./entities/housing.entities";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const tenantPartyId = "00000000-0000-4000-8000-000000000001";
const occupantPartyId = "00000000-0000-4000-8000-000000000002";

function serviceWith(verifier?: {
  verifyForHousingMoveIn(input: Record<string, unknown>): Promise<readonly unknown[]>;
}) {
  return new HousingHandoverCommandService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    verifier as never
  );
}

const moveInDto = {
  handover_type: "move_in" as const,
  item_snapshot: [],
  meter_readings: [],
  credentials: [],
  damage_amount: "0.00",
  unsettled_amount: "0.00",
  deposit_deduction_amount: "0.00"
};

function moveInGate(service: HousingHandoverCommandService) {
  return service as unknown as {
    assertMoveInIdentity(
      manager: unknown,
      inputScope: TenantParkScope,
      lease: HousingLeaseEntity
    ): Promise<void>;
  };
}

test("housing move-in verifies the main tenant and every scoped occupant as one set", async () => {
  let received: Record<string, unknown> | undefined;
  const verifier = {
    verifyForHousingMoveIn: async (input: Record<string, unknown>) => {
      received = input;
      return [{ partyId: tenantPartyId }, { partyId: occupantPartyId }];
    }
  };
  const manager = {
    query: async (statement: string, params: unknown[]) => {
      assert.match(statement, /rel_housing_lease_occupant/);
      assert.match(statement, /tenant_id=\$1 AND park_id=\$2 AND lease_id=\$3/);
      assert.match(statement, /is_deleted=false[\s\S]*FOR UPDATE/);
      assert.deepEqual(params, [scope.tenantId, scope.parkId, "lease-1"]);
      return [
        { partyId: occupantPartyId },
        { partyId: tenantPartyId },
        { partyId: occupantPartyId }
      ];
    }
  };

  await moveInGate(serviceWith(verifier)).assertMoveInIdentity(
    manager,
    scope,
    { id: "lease-1", tenantPartyId } as HousingLeaseEntity
  );

  assert.deepEqual(received, {
    manager: { transactionContext: manager },
    scope,
    leaseId: "lease-1",
    partyIds: [tenantPartyId, occupantPartyId],
    expectedConsent: "granted"
  });
});

test("housing move-in fails closed when verifier runtime or evidence is incomplete", async () => {
  const manager = { query: async () => [] };
  const lease = { id: "lease-1", tenantPartyId } as HousingLeaseEntity;
  await assert.rejects(
    moveInGate(serviceWith()).assertMoveInIdentity(manager, scope, lease),
    ConflictException
  );
  await assert.rejects(
    moveInGate(serviceWith({ verifyForHousingMoveIn: async () => [] }))
      .assertMoveInIdentity(manager, scope, lease),
    /Housing move-in identity verification is incomplete/
  );
});

test("a rejected move-in identity gate reaches no handover persistence", async () => {
  let createCalls = 0;
  let saveCalls = 0;
  const repository = {
    findOne: async () => null,
    create: () => {
      createCalls += 1;
      return {};
    },
    save: async () => {
      saveCalls += 1;
      return {};
    }
  };
  const manager = {
    getRepository: () => repository,
    query: async () => []
  };
  const dataSource = {
    transaction: async (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
      callback(manager)
  };
  const support = {
    lockLease: async () => ({
      id: "lease-1",
      unitId: "unit-1",
      tenantPartyId,
      status: "active",
      depositAmount: "0.00"
    }),
    assertStatus: () => undefined
  };
  const verifier = {
    verifyForHousingMoveIn: async () => {
      throw new ConflictException("identity or consent is not ready");
    }
  };
  const service = new HousingHandoverCommandService(
    dataSource as never,
    { assertAccess: async () => undefined } as never,
    support as never,
    {} as never,
    undefined,
    verifier as never
  );

  await assert.rejects(
    service.complete(
      scope,
      { sub: "operator-1", permissions: [] } as never,
      "lease-1",
      moveInDto,
      "client-key"
    ),
    /identity or consent is not ready/
  );
  assert.equal(createCalls, 0);
  assert.equal(saveCalls, 0);
});

test("housing identity gate is bound only to move-in handover", () => {
  const handover = readFileSync(
    resolve(__dirname, "housing-handover-command.service.ts"),
    "utf8"
  );
  assert.match(
    handover,
    /if \(dto\.handover_type === "move_in"\) \{\s*await this\.assertMoveInIdentity/
  );
  assert.ok(
    handover.indexOf("await this.assertMoveInIdentity")
      < handover.indexOf("handover ??= repository.create")
  );

  const lease = readFileSync(resolve(__dirname, "housing-lease-command.service.ts"), "utf8");
  assert.doesNotMatch(lease, /verifyForHousingMoveIn|assertMoveInIdentity/);
});
