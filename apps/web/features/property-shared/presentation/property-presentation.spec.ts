import assert from "node:assert/strict";
import test from "node:test";
import {
  displayEntityName,
  eligibilityReasonLabel,
  homestayPriceSourceLabel,
  housingChargeTypeLabel,
  housingPaymentMethodLabel,
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
  assert.equal(displayEntityName("22222222-2222-4222-8222-222222222222", "U-001", "房源不可用"), "U-001");
  assert.equal(displayEntityName("22222222-2222-4222-8222-222222222222", null, "房源不可用"), "房源不可用");
});

test("HCD lease filters exactly follow the closed shared status labels", () => {
  assert.ok(housingLeaseStatusOptions.some(({ value, label }) => value === "expiring" && label === "即将到期"));
  assert.ok(housingLeaseStatusOptions.some(({ value }) => value === "terminated"));
  assert.equal(housingLeaseStatusOptions.some(({ value }) => value === "closed"), false);
});

test("HCD temporary D-class labels stay Chinese and unknown values use Chinese fallbacks", () => {
  assert.equal(propertyLabels.homestayGuestVerification("verified"), "已核验");
  assert.equal(propertyLabels.homestayCredentialStatus("lost"), "已遗失");
  assert.equal(propertyLabels.homestayAuditAction("check_out"), "办理退房");
  assert.equal(propertyLabels.homestayAuditAction("future_action"), "未知订单操作");
  assert.equal(propertyLabels.partyConsentFact("pending_evidence"), "待补证据");
  assert.equal(propertyLabels.partyConsentProvenance("operator_recorded"), "经操作员记录");
  assert.equal(propertyLabels.partyRoleType("future_role"), "其他业务角色");
  assert.equal(propertyLabels.identitySubmissionStatus("pending_verification"), "待核验");
  assert.equal(propertyLabels.eventIncidentStatus("quarantined"), "已隔离");
  assert.equal(propertyLabels.eventFailureSide("consumer"), "消费侧");
  assert.equal(propertyLabels.identityDocumentType("id_card"), "身份证");
  assert.equal(propertyLabels.identityDocumentType("future_document"), "未知证件类型");
  assert.equal(propertyLabels.approvalAction("housing.leases.approve.request"), "长租租约审批");
  assert.equal(propertyLabels.approvalAction("future_action"), "未知审批操作");
  assert.equal(housingChargeTypeLabel("rent"), "租金");
  assert.equal(housingChargeTypeLabel("tenant_custom", { tenant_custom: "租户自定义费" }), "租户自定义费");
  assert.equal(housingChargeTypeLabel("future_charge"), "其他费用");
  assert.equal(housingPaymentMethodLabel("bank_transfer"), "银行转账");
  assert.equal(housingPaymentMethodLabel("tenant_custom", { tenant_custom: "园区收款码" }), "园区收款码");
  assert.equal(housingPaymentMethodLabel("future_method"), "其他支付方式");
});
