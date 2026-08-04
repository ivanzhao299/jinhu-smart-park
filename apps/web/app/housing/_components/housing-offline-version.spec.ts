import assert from "node:assert/strict";
import test from "node:test";
import type { HousingLeaseResponse } from "@jinhu/shared";
import { housingLeaseProjectionVersion } from "./housing-offline-version";

const lease: HousingLeaseResponse = {
  id: "lease-a", leaseCode: "L-001", unitId: "unit-a", tenantPartyId: "party-a",
  startDate: "2026-08-01", endDate: "2027-07-31", status: "active",
  paymentCycleMonths: 1, signatureFileId: null, monthlyRent: "1000.00", depositAmount: "2000.00"
};

test("lease projection version is stable and changes with business-visible state", async () => {
  const first = await housingLeaseProjectionVersion(lease);
  assert.match(first, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(await housingLeaseProjectionVersion({ ...lease }), first);
  assert.notEqual(await housingLeaseProjectionVersion({ ...lease, status: "checkout_pending" }), first);
});
