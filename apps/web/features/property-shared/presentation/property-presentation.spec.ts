import assert from "node:assert/strict";
import test from "node:test";
import {
  displayEntityName,
  eligibilityReasonLabel,
  homestayPriceSourceLabel,
  housingLeaseStatusOptions,
  propertyLabels,
  workOrderStatusLabel
} from "./property-presentation";

test("HCD known codes use Chinese labels and unknown codes use Chinese fallbacks", () => {
  assert.equal(propertyLabels.operatingMode("short_stay"), "民宿短租");
  assert.equal(propertyLabels.bookingStatus("no_show"), "未到店");
  assert.equal(propertyLabels.leaseStatus("terminated"), "已终止");
  assert.equal(propertyLabels.leaseStatus("future_state"), "未知租约状态");
  assert.equal(propertyLabels.taskSource("housing_repair"), "长租报修");
  assert.equal(workOrderStatusLabel(80), "已超时");
  assert.equal(workOrderStatusLabel("future"), "未知工单状态");
  assert.equal(eligibilityReasonLabel("future"), "未知阻断原因");
  assert.equal(homestayPriceSourceLabel("date_override"), "日期覆盖价");
});

test("HCD entity fallback never exposes internal ids", () => {
  assert.equal(displayEntityName("金湖一居", "U-001", "房源不可用"), "金湖一居");
  assert.equal(displayEntityName(null, "U-001", "房源不可用"), "U-001");
  assert.equal(displayEntityName(null, null, "房源不可用"), "房源不可用");
  assert.equal(displayEntityName(null, "22222222-2222-4222-8222-222222222222", "房源不可用"), "房源不可用");
});

test("HCD lease filters exactly follow the closed shared status labels", () => {
  assert.ok(housingLeaseStatusOptions.some(({ value, label }) => value === "expiring" && label === "即将到期"));
  assert.ok(housingLeaseStatusOptions.some(({ value }) => value === "terminated"));
  assert.equal(housingLeaseStatusOptions.some(({ value }) => value === "closed"), false);
});
