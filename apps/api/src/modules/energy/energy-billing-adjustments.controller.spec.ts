import assert from "node:assert/strict";
import test from "node:test";
import "reflect-metadata";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { EnergyBillingAdjustmentsController } from "./energy-billing-adjustments.controller";

test("adjustment creators can load the candidate data required by the create form", () => {
  const permissions = Reflect.getMetadata(
    PERMISSIONS_KEY,
    EnergyBillingAdjustmentsController.prototype.candidates
  );

  assert.deepEqual(permissions, [SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_CREATE]);
});
