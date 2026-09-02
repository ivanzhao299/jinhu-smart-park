/* global __dirname */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const webRoot = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(webRoot, relative), "utf8");

const sources = {
  homestayList: read("homestay/_components/HomestayListRecords.tsx"),
  homestayFilters: read("homestay/_components/HomestayListClient.tsx"),
  homestayDetail: read("homestay/_components/HomestayDetailClient.tsx"),
  homestayFinance: read("homestay/_components/HomestayFinanceEntryPanel.tsx"),
  homestayTurnover: read("homestay/_components/HomestayTurnoverActions.tsx"),
  homestayState: read("homestay/_components/use-homestay-list-state.ts"),
  housingTasks: read("housing/_components/HousingOverviewSurfaceClients.tsx"),
  housingRental: read("housing/_components/HousingRentalSurfaceClients.tsx"),
  housingCosts: read("housing/_components/HousingCostSurfaceClients.tsx"),
  housingLease: read("housing/_components/HousingLeaseDetailClient.tsx"),
  housingDetails: read("housing/_components/HousingEntityDetailClients.tsx"),
  housingBilling: read("housing/_components/HousingBillingActions.tsx"),
  housingFinance: read("housing/_components/HousingFinanceActions.tsx"),
  housingHandover: read("housing/_components/HousingHandoverForm.tsx"),
  controlPlane: read("../components/property/PropertyControlPlaneClient.tsx")
};
sources.foundation = read("../components/property/PropertyFoundationControlClient.tsx");

const coverage = {
  "HCD-001": [sources.homestayList, /propertyLabels\.taskStatus/, /propertyLabels\.taskSource/],
  "HCD-002": [sources.homestayList, /propertyLabels\.operatingMode/],
  "HCD-003": [sources.homestayList + sources.homestayDetail, /propertyLabels\.bookingStatus/],
  "HCD-004": [sources.homestayList + sources.homestayDetail, /propertyLabels\.turnoverStatus/],
  "HCD-006": [sources.homestayDetail + sources.homestayFinance, /propertyLabels\.homestayLedgerType/],
  "HCD-008": [sources.homestayDetail + sources.homestayTurnover, /workOrderStatusLabel/],
  "HCD-009": [sources.homestayDetail + sources.homestayFinance + sources.housingLease + sources.housingDetails + sources.housingFinance + sources.housingHandover, /审批状态：/, /执行状态：/],
  "HCD-010": [sources.homestayDetail, /homestayPriceSourceLabel/],
  "HCD-013": [read("housing/_components/HousingCollectionPage.tsx") + read("housing/_components/HousingDetailShell.tsx") + sources.housingFinance + sources.housingHandover + sources.homestayDetail + sources.homestayFinance, /propertyErrorMessage/],
  "HCD-014": [sources.homestayFilters, /homestayBookingStatusOptions/, /homestayTurnoverStatusOptions/],
  "HCD-016": [sources.housingRental + sources.housingCosts + sources.housingLease, /propertyLabels\.leaseStatus/],
  "HCD-017": [sources.housingRental + sources.housingLease, /eligibilityReasonLabel/],
  "HCD-018": [sources.housingRental + sources.housingDetails + sources.housingLease, /propertyLabels\.handoverStatus/],
  "HCD-019": [sources.housingTasks, /propertyLabels\.taskSource/, /propertyLabels\.taskStatus/, /propertyTaskSourceOptions/, /propertyTaskStatusOptions/],
  "HCD-021": [sources.housingLease, /未命名租客/, /未命名人员/],
  "HCD-022": [sources.housingLease, /propertyLabels\.occupantRole/],
  "HCD-023": [sources.housingCosts + sources.housingDetails, /repairPriority/, /repairUrgency/, /workOrderStatusLabel/],
  "HCD-024": [sources.housingCosts + sources.housingDetails, /purchaseApproval/, /purchasePayment/, /housingPurchaseApprovalStatusOptions/],
  "HCD-025": [sources.housingBilling, /propertyLabels\.billingSource/],
  "HCD-029": [sources.controlPlane, /propertyLabels\.executionStatus/, /propertyLabels\.sourceType/]
};

test("PR1 has traceable presentation wiring for every A/C HCD item", () => {
  for (const [id, [source, ...patterns]] of Object.entries(coverage)) {
    for (const pattern of patterns) assert.match(source, pattern, `${id} missing ${pattern}`);
  }
  assert.equal(Object.keys(coverage).length, 20);
});

test("PR1 removes audited raw codes and internal-id fallbacks from visible JSX", () => {
  assert.doesNotMatch(sources.homestayList, /<StatusPill value=\{item\.(?:status|bookingStatus)\}/);
  assert.doesNotMatch(sources.housingLease, /\?\? (?:data\.lease\.tenantPartyId|item\.partyId)/);
  assert.doesNotMatch(sources.housingRental, /reasonCodes\.join/);
  assert.doesNotMatch(sources.housingCosts, /render: \(item\) => item\.(?:status|priority|approvalStatus|paymentStatus)/);
  assert.doesNotMatch(sources.controlPlane, /source: `\$\{row\.sourceType\} · \$\{row\.sourceId\}`/);
  assert.doesNotMatch(sources.foundation, /row\.operatorName \|\| row\.operatorId/);
  assert.doesNotMatch(sources.foundation, /<dd>\{row\.requestId \?\?/);
  assert.doesNotMatch(sources.foundation, /conflict\.sourceId \? ` · \$\{conflict\.sourceId\}`/);
  assert.doesNotMatch(Object.values(sources).join("\n"), /申请编号：\$\{[^}]*requestId/);
  assert.doesNotMatch(sources.housingLease + sources.housingDetails + sources.housingRental, /handoverType === "move_in" \? "入住" : "退租"/);
});

test("HCD-009 every high-risk feedback surface projects Chinese approval states without request ids", () => {
  for (const source of [sources.homestayDetail, sources.homestayFinance, sources.housingLease,
    sources.housingDetails, sources.housingFinance, sources.housingHandover]) {
    assert.match(source, /审批状态：/);
    assert.match(source, /执行状态：/);
    assert.doesNotMatch(source, /申请编号：\$\{[^}]*requestId/);
  }
});

test("PR2 wires authorized names for every B-class HCD item without internal-id fallbacks", () => {
  assert.equal((sources.homestayList.match(/displayEntityName\(item\.unitName, item\.unitCode, "未命名房源"\)/g) ?? []).length, 3);
  assert.equal((sources.homestayList.match(/displayEntityName\(item\.unit_name, item\.unit_code, "未命名房源"\)/g) ?? []).length, 2);
  assert.doesNotMatch(sources.homestayList, /\[item\.unitCode, item\.unitName\]\.filter\(Boolean\)\.join/);
  assert.match(sources.homestayDetail, /displayEntityName\(booking\.unitName, booking\.unitCode, "未命名房源"\)/);
  assert.match(sources.homestayState, /params\.set\("unit_id", input\.unitId\)/);
  assert.match(sources.homestayState, /displayEntityName\(item\.unitName, item\.unitCode, "未命名房源"\)/);
  assert.doesNotMatch(sources.homestayState, /label: "已选择房源"/);
  assert.match(sources.housingTasks, /item\.assigneeName\?\.trim\(\) \|\| "未分派"/);
  assert.doesNotMatch(sources.housingTasks, /render: \(item\) => item\.assigneeId/);
  assert.match(sources.housingCosts, /displayEntityName\(item\.unitName, item\.unitCode, "未关联房源"\)/);
  assert.match(sources.housingDetails, /displayEntityName\(data\.purchase\.unitName, data\.purchase\.unitCode, "未关联房源"\)/);
});
