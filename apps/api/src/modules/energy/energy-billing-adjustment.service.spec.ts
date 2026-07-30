import assert from "node:assert/strict";
import test from "node:test";
import { EnergyBillingAdjustmentService } from "./energy-billing-adjustment.service";

class CandidateQueryBuilder {
  readonly joins: Array<{ kind: "inner" | "left"; alias: string; condition: string }> = [];
  readonly selections: string[] = [];
  skipValue = 0;
  takeValue = 0;

  innerJoin(_target: unknown, alias: string, condition: string) {
    this.joins.push({ kind: "inner", alias, condition });
    return this;
  }

  leftJoin(_target: unknown, alias: string, condition: string) {
    this.joins.push({ kind: "left", alias, condition });
    return this;
  }

  where() { return this; }
  andWhere() { return this; }
  orderBy() { return this; }

  select(selection: string) {
    this.selections.push(selection);
    return this;
  }

  addSelect(selection: string) {
    this.selections.push(selection);
    return this;
  }

  skip(value: number) {
    this.skipValue = value;
    return this;
  }

  take(value: number) {
    this.takeValue = value;
    return this;
  }

  async getCount() {
    return 1;
  }

  async getRawMany() {
    return [{
      id: "item-1",
      cycleId: "cycle-1",
      cycleCode: "CYCLE-1",
      cycleName: "历史账期",
      relatedParkTenantId: "tenant-1",
      parkTenantCode: "PT-001",
      companyName: "已退园企业",
      billingMethod: "DIRECT_METER",
      finalAmount: "100.00",
      confirmationStatus: "CONFIRMED",
      receivableId: "receivable-1"
    }];
  }
}

test("adjustment candidates retain historical soft-deleted tenant labels", async () => {
  const builder = new CandidateQueryBuilder();
  const service = new EnergyBillingAdjustmentService(
    {} as never,
    { createQueryBuilder: () => builder } as never,
    {} as never,
    {} as never,
    { applyToQueryBuilder: async () => undefined } as never,
    {} as never,
    {} as never
  );

  const result = await service.listCandidates(
    { tenantId: "tenant", parkId: "park" },
    { page: 1, page_size: 50 },
    {} as never
  );

  const tenantJoin = builder.joins.find((join) => join.alias === "parkTenant");
  assert.equal(tenantJoin?.kind, "left");
  assert.doesNotMatch(tenantJoin?.condition ?? "", /parkTenant\.is_deleted/);
  assert.ok(builder.selections.some((selection) => selection.includes("COALESCE(parkTenant.company_name")));
  assert.equal(result.items[0]?.companyName, "已退园企业");
  assert.equal(builder.skipValue, 0);
  assert.equal(builder.takeValue, 50);
});
