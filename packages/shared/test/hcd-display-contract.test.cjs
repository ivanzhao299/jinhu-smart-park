const test = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../dist/index.js");

const contracts = [
  [shared.PROPERTY_OPERATING_MODES, shared.PROPERTY_OPERATING_MODE_LABELS],
  [shared.PROPERTY_OPERATING_STATUSES, shared.PROPERTY_OPERATING_STATUS_LABELS],
  [shared.PROPERTY_OCCUPANCY_STATUSES, shared.PROPERTY_OCCUPANCY_STATUS_LABELS],
  [shared.HOMESTAY_BOOKING_STATUSES, shared.HOMESTAY_BOOKING_STATUS_LABELS],
  [shared.HOMESTAY_TURNOVER_STATUSES, shared.HOMESTAY_TURNOVER_STATUS_LABELS],
  [shared.HOMESTAY_LEDGER_ENTRY_TYPES, shared.HOMESTAY_LEDGER_ENTRY_TYPE_LABELS],
  [shared.HOMESTAY_LEDGER_STATUSES, shared.HOMESTAY_LEDGER_STATUS_LABELS],
  [shared.HOUSING_LEASE_STATUSES, shared.HOUSING_LEASE_STATUS_LABELS],
  [shared.HOUSING_HANDOVER_STATUSES, shared.HOUSING_HANDOVER_STATUS_LABELS],
  [shared.HOUSING_HANDOVER_TYPES, shared.HOUSING_HANDOVER_TYPE_LABELS],
  [shared.HOUSING_OCCUPANT_ROLES, shared.HOUSING_OCCUPANT_ROLE_LABELS],
  [shared.HOUSING_REPAIR_PRIORITIES, shared.HOUSING_REPAIR_PRIORITY_LABELS],
  [shared.HOUSING_REPAIR_URGENCIES, shared.HOUSING_REPAIR_URGENCY_LABELS],
  [shared.HOUSING_PURCHASE_APPROVAL_STATUSES, shared.HOUSING_PURCHASE_APPROVAL_STATUS_LABELS],
  [shared.HOUSING_PURCHASE_PAYMENT_STATUSES, shared.HOUSING_PURCHASE_PAYMENT_STATUS_LABELS],
  [shared.HOUSING_BILLING_SOURCES, shared.HOUSING_BILLING_SOURCE_LABELS],
  [shared.APPROVAL_DECISION_STATUSES, shared.APPROVAL_DECISION_STATUS_LABELS],
  [shared.APPROVAL_EXECUTION_STATUSES, shared.APPROVAL_EXECUTION_STATUS_LABELS],
  [shared.PROPERTY_TASK_STATUSES, shared.PROPERTY_TASK_STATUS_LABELS]
];

test("HCD closed enum labels are exhaustive and contain no extra keys", () => {
  for (const [values, labels] of contracts) {
    assert.deepEqual(Object.keys(labels).sort(), [...values].sort());
    assert.equal(new Set(values).size, values.length);
    assert.ok(Object.values(labels).every((label) => typeof label === "string" && label.length > 0));
  }
});

test("HCD query pseudo-values do not pollute persisted turnover status", () => {
  assert.equal(shared.HOMESTAY_TURNOVER_STATUSES.includes("open"), false);
  assert.equal(shared.HOUSING_LEASE_STATUSES.includes("closed"), false);
});
