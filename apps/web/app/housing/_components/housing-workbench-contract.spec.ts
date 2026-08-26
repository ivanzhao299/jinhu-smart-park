import assert from "node:assert/strict";
import test from "node:test";
import {
  HOUSING_DETAIL_ROUTES,
  HOUSING_RUNTIME_APPROVAL_SOURCE_TYPES,
  HOUSING_RETURN_CONTEXT_POLICY,
  HOUSING_WORKBENCH_SURFACES,
  housingHandoverTypes,
  isHousingFinancialHandover,
  resolveHousingLanding
} from "./housing-workbench-contract";
import { propertyApprovalTargetAllowed } from "../../../components/property/property-runtime-slots.logic";
import {
  createReturnHref,
  decodeReturnContext,
  encodeReturnContext
} from "../../../features/property-shared/detail/return-context";
import { hasAuthoritativeEmptyUnitScope, returnToSearch } from "./housing-list-logic";
import { payloadFingerprint } from "./idempotency-logic";
import {
  housingPageCorrection,
  housingTotalPages
} from "../../../features/housing/listing/pagination";

test("housing exposes the frozen nine surfaces and four detail routes", () => {
  assert.deepEqual(
    HOUSING_WORKBENCH_SURFACES.map((surface) => surface.route),
    [
      "/housing/dashboard",
      "/housing/tasks",
      "/housing/tenants",
      "/housing/leases",
      "/housing/handovers",
      "/housing/billing",
      "/housing/finance",
      "/housing/repairs",
      "/housing/purchases"
    ]
  );
  assert.deepEqual(Object.values(HOUSING_DETAIL_ROUTES), [
    "/housing/leases/[leaseId]",
    "/housing/handovers/[handoverId]",
    "/housing/repairs/[repairId]",
    "/housing/purchases/[purchaseId]"
  ]);
});

test("housing approval deep links accept property operation config and remain fail-closed", () => {
  assert.equal(propertyApprovalTargetAllowed(
    { sourceType: "property-operation-config" } as never,
    HOUSING_RUNTIME_APPROVAL_SOURCE_TYPES
  ), true);
  for (const sourceType of ["homestay-booking", "unknown-source"]) {
    assert.equal(propertyApprovalTargetAllowed(
      { sourceType } as never,
      HOUSING_RUNTIME_APPROVAL_SOURCE_TYPES
    ), false);
  }

  const context = {
    route: "/housing/tasks",
    query: { requestId: "22222222-2222-4222-8222-222222222222" }
  } as const;
  assert.deepEqual(decodeReturnContext(encodeReturnContext(context)), context);
  assert.equal(
    createReturnHref(context, HOUSING_RETURN_CONTEXT_POLICY),
    "/housing/tasks?requestId=22222222-2222-4222-8222-222222222222"
  );
});

test("handover types follow the lease lifecycle enforced by the command service", () => {
  assert.deepEqual(housingHandoverTypes("active"), ["move_in", "move_out"]);
  assert.deepEqual(housingHandoverTypes("expiring"), ["move_out"]);
  assert.deepEqual(housingHandoverTypes("checkout_pending"), ["move_out"]);
  for (const status of ["draft", "pending_approval", "pending_signature", "terminated", "void"]) {
    assert.deepEqual(housingHandoverTypes(status), []);
  }
});

test("move-out financial discriminator uses decimal strings without number coercion", () => {
  assert.equal(isHousingFinancialHandover({
    handoverType: "move_in",
    damageAmount: "100.00",
    unsettledAmount: "0",
    depositDeductionAmount: "0.00"
  }), false);
  assert.equal(isHousingFinancialHandover({
    handoverType: "move_out",
    damageAmount: "0.00",
    unsettledAmount: "0",
    depositDeductionAmount: "0.000"
  }), false);
  assert.equal(isHousingFinancialHandover({
    handoverType: "move_out",
    damageAmount: "0.00",
    unsettledAmount: "0.01",
    depositDeductionAmount: "0.00"
  }), true);
});

test("legacy housing landing requires both modules and a granular page permission", () => {
  const enabledModules = [
    { module_code: "housing_rental", enabled: true },
    { module_code: "asset", enabled: true }
  ];
  assert.equal(resolveHousingLanding({
    permissions: ["housing:leases:page"],
    enabled_modules: enabledModules
  }), "/housing/leases");
  assert.equal(resolveHousingLanding({
    permissions: ["housing_rental:operations"],
    enabled_modules: enabledModules
  }), null);
  assert.equal(resolveHousingLanding({
    permissions: ["*"],
    is_super: true,
    enabled_modules: [{ module_code: "housing_rental", enabled: true }]
  }), null);
});

test("restricted empty unit scope is only asserted from authoritative config", () => {
  assert.equal(hasAuthoritativeEmptyUnitScope([{
    dimension: "unit", scope_type: "custom", scope_config: { unitIds: [] }
  }], false), true);
  assert.equal(hasAuthoritativeEmptyUnitScope([{
    dimension: "unit", scope_type: "custom", scope_config: { ids: ["unit-1"] }
  }], false), false);
  assert.equal(hasAuthoritativeEmptyUnitScope([{
    dimension: "tenant", scope_type: "tenant", scope_config: {}
  }], false), false);
});

test("housing pagination contracts collapse stale URL pages to the last valid page", () => {
  assert.equal(housingTotalPages(0), 1);
  assert.equal(housingTotalPages(41), 3);
  assert.equal(housingPageCorrection(4, 41), 3);
  assert.equal(housingPageCorrection(1, 0), null);
  assert.equal(housingPageCorrection(3, 41), null);
});

test("return context receives a second URLSearchParams encoding layer", () => {
  const inner = encodeURIComponent(JSON.stringify({
    route: "/housing/leases", query: { keyword: "50% off" }, scrollAnchor: "housing-list"
  }));
  const outer = returnToSearch(inner);
  assert.match(outer, /^returnTo=/);
  assert.equal(new URLSearchParams(outer).get("returnTo"), inner);
  assert.match(outer, /%2525/);
});

test("idempotency payload fingerprint is key-order stable and changes with payload", () => {
  assert.equal(payloadFingerprint({ b: 2, a: "x" }), payloadFingerprint({ a: "x", b: 2 }));
  assert.notEqual(payloadFingerprint({ amount: "1.00" }), payloadFingerprint({ amount: "2.00" }));
});
