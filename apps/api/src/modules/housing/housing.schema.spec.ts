import assert from "node:assert/strict";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import {
  HousingChargePlanEntity,
  HousingHandoverEntity,
  HousingLeaseEntity,
  HousingLeaseOccupantEntity,
  HousingLedgerEntryEntity,
  HousingPurchaseEntity,
  HousingPurchaseItemEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";

test("housing entities map to independent long-rent aggregates", () => {
  const tables = getMetadataArgsStorage().tables;
  const expected = [
    [HousingLeaseEntity, "biz_housing_lease"],
    [HousingLeaseOccupantEntity, "rel_housing_lease_occupant"],
    [HousingChargePlanEntity, "biz_housing_charge_plan"],
    [HousingReceivableEntity, "biz_housing_receivable"],
    [HousingLedgerEntryEntity, "biz_housing_ledger_entry"],
    [HousingHandoverEntity, "biz_housing_handover"],
    [HousingPurchaseEntity, "biz_housing_purchase"],
    [HousingPurchaseItemEntity, "biz_housing_purchase_item"]
  ] as const;
  for (const [target, name] of expected) {
    assert.equal(tables.find((item) => item.target === target)?.name, name);
  }
});
