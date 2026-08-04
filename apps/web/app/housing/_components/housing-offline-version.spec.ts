import assert from "node:assert/strict";
import test from "node:test";
import type { HousingLeaseResponse } from "@jinhu/shared";
import {
  beginHousingRepairQueueGate,
  housingLeaseProjectionVersion,
  housingRepairSubmissionBlocked
} from "./housing-offline-version";

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

test("repair submission remains blocked until every queued upload is recovered or explicitly cancelled", () => {
  const ready = { hasLease: true, queuedUploadCount: 0, removing: false, submitting: false, uploading: false };
  assert.equal(housingRepairSubmissionBlocked(ready), false);
  assert.equal(housingRepairSubmissionBlocked({ ...ready, queuedUploadCount: 1 }), true);
  assert.equal(housingRepairSubmissionBlocked({ ...ready, uploading: true }), true);
  assert.equal(beginHousingRepairQueueGate(true, true), true);
  assert.equal(beginHousingRepairQueueGate(false, true), false);
  assert.equal(beginHousingRepairQueueGate(true, false), false);
});
