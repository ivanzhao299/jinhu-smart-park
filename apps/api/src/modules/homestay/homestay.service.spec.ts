import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  HomestayBookingActionLogEntity,
  HomestayBookingEntity,
  HomestayBookingGuestEntity,
  HomestayBookingNightEntity,
  HomestayLedgerEntryEntity,
  HomestayStayCredentialEntity
} from "./entities/homestay.entities";
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

test("initial homestay rate configuration uses one atomic database upsert", async () => {
  const events: string[] = [];
  const expected = { id: "rate-1", unitId: "unit-1", baseDailyRate: "688.00" };
  let statement = "";
  let parameters: unknown[] = [];
  const service = new HomestayService(
    {
      findOne: async () => {
        events.push("read");
        return expected;
      }
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    {
      query: async (sql: string, values: unknown[]) => {
        events.push("upsert");
        statement = sql;
        parameters = values;
      }
    } as never
  );

  const result = await service.upsertRate(scope, actor, "unit-1", {
    base_daily_rate: "688.00",
    free_cancel_before_hours: 48,
    late_cancel_fee_type: "percentage",
    late_cancel_fee_value: "25.00",
    checkout_requires_inspection: true
  });

  assert.deepEqual(events, ["upsert", "read"]);
  assert.match(statement, /ON CONFLICT \(tenant_id, park_id, unit_id\) WHERE is_deleted = false/);
  assert.match(statement, /version = biz_homestay_rate_config\.version \+ 1/);
  assert.deepEqual(parameters.slice(0, 8), [
    scope.tenantId,
    scope.parkId,
    "unit-1",
    "688.00",
    48,
    "percentage",
    "25.00",
    true
  ]);
  assert.equal(result, expected);
});

test("dated homestay rate overrides use one atomic database upsert", async () => {
  const events: string[] = [];
  const expected = { id: "override-1", unitId: "unit-1", businessDate: "2026-08-01", dailyRate: "788.00" };
  let statement = "";
  let parameters: unknown[] = [];
  const service = new HomestayService(
    { findOne: async () => ({ id: "rate-1" }) } as never,
    {
      findOne: async () => {
        events.push("read");
        return expected;
      }
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    {
      query: async (sql: string, values: unknown[]) => {
        events.push("upsert");
        statement = sql;
        parameters = values;
      }
    } as never
  );

  const result = await service.upsertRateOverride(scope, actor, "unit-1", {
    business_date: "2026-08-01",
    daily_rate: "788.00",
    reason: "周末价"
  });

  assert.deepEqual(events, ["upsert", "read"]);
  assert.match(
    statement,
    /ON CONFLICT \(tenant_id, park_id, unit_id, business_date\) WHERE is_deleted = false/
  );
  assert.match(statement, /version = biz_homestay_rate_override\.version \+ 1/);
  assert.deepEqual(parameters, [
    scope.tenantId,
    scope.parkId,
    "unit-1",
    "2026-08-01",
    "788.00",
    "周末价",
    actor.sub
  ]);
  assert.equal(result, expected);
});

test("booking detail masks every credential reference without changing null", async () => {
  const secretReference = "credential-secret-9876";
  const credentials = [
    { id: "credential-1", credentialReference: secretReference },
    { id: "credential-2", credentialReference: "x" },
    { id: "credential-3", credentialReference: null }
  ];
  const booking = { id: "booking-1", unitId: "unit-1" };
  const emptyRepository = { find: async () => [] };
  const dataSource = {
    getRepository: (entity: unknown) => {
      if (entity === HomestayBookingNightEntity) return emptyRepository;
      if (entity === HomestayBookingGuestEntity) return emptyRepository;
      if (entity === HomestayStayCredentialEntity) return { find: async () => credentials };
      if (entity === HomestayLedgerEntryEntity) return emptyRepository;
      if (entity === HomestayBookingActionLogEntity) return emptyRepository;
      throw new Error("Unexpected repository");
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    { findOne: async () => booking } as never,
    { findOne: async () => null } as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    dataSource as never
  );

  const result = await service.getBooking(scope, actor, booking.id);
  const serialized = JSON.stringify(result);

  assert.deepEqual(
    result.credentials.map((credential) => credential.credentialReference),
    ["***", "***", null]
  );
  assert.equal(serialized.includes(secretReference), false);
  assert.equal(serialized.includes("\"credentialReference\":\"x\""), false);
  assert.deepEqual(
    credentials.map((credential) => credential.credentialReference),
    [secretReference, "x", null]
  );
});

test("credential issue persists the reference but masks it in the response", async () => {
  const secretReference = "x";
  let persistedReference: string | null | undefined;
  const credentialRepository = {
    create: (value: Record<string, unknown>) => value,
    save: async (value: Record<string, unknown>) => {
      persistedReference = value.credentialReference as string | null;
      return { id: "credential-1", ...value };
    }
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === HomestayBookingEntity) {
        return { findOne: async () => ({ id: "booking-1", unitId: "unit-1", status: "confirmed" }) };
      }
      if (entity === HomestayStayCredentialEntity) return credentialRepository;
      throw new Error("Unexpected repository");
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (handler: (transactionManager: typeof manager) => unknown) => handler(manager) } as never
  );

  const result = await service.issueCredential(scope, actor, "booking-1", {
    credential_type: "key",
    credential_label: "前台钥匙",
    credential_reference: secretReference
  });

  assert.equal(persistedReference, secretReference);
  assert.equal(result.credentialReference, "***");
  assert.equal(JSON.stringify(result).includes("\"credentialReference\":\"x\""), false);
});

test("credential return masks the stored reference in new and replayed responses", async () => {
  const secretReference = "credential-return-secret";
  const credential = {
    id: "credential-1",
    bookingId: "booking-1",
    credentialReference: secretReference,
    status: "issued" as const,
    returnedAt: null,
    updateBy: null
  };
  const credentialRepository = {
    findOne: async () => credential,
    save: async (value: typeof credential) => value
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === HomestayBookingEntity) {
        return { findOne: async () => ({ id: "booking-1", unitId: "unit-1", status: "checked_in" }) };
      }
      if (entity === HomestayStayCredentialEntity) return credentialRepository;
      throw new Error("Unexpected repository");
    }
  };
  const service = new HomestayService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (handler: (transactionManager: typeof manager) => unknown) => handler(manager) } as never
  );

  const first = await service.returnCredential(scope, actor, "booking-1", credential.id);
  const replay = await service.returnCredential(scope, actor, "booking-1", credential.id);

  assert.equal(first.credentialReference, "***");
  assert.equal(replay.credentialReference, "***");
  assert.equal(JSON.stringify([first, replay]).includes(secretReference), false);
  assert.equal(credential.credentialReference, secretReference);
});
