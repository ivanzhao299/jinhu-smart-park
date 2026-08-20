const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const housingRoot = path.dirname(require.resolve("./page.tsx"));
const componentsRoot = path.join(housingRoot, "_components");
const partiesRoot = path.join(housingRoot, "..", "assets", "parties");

function read(name) {
  return fs.readFileSync(path.join(componentsRoot, name), "utf8");
}

function readAllComponents() {
  return fs.readdirSync(componentsRoot)
    .filter((name) => /\.(?:ts|tsx)$/.test(name))
    .map(read)
    .join("\n");
}

test("housing owns nine canonical surfaces and four detail routes", () => {
  const surfaces = [
    "dashboard",
    "tasks",
    "tenants",
    "leases",
    "handovers",
    "billing",
    "finance",
    "repairs",
    "purchases"
  ];
  for (const surface of surfaces) {
    assert.equal(fs.existsSync(path.join(housingRoot, surface, "page.tsx")), true, surface);
  }
  for (const [surface, parameter] of [
    ["leases", "leaseId"],
    ["handovers", "handoverId"],
    ["repairs", "repairId"],
    ["purchases", "purchaseId"]
  ]) {
    assert.equal(
      fs.existsSync(path.join(housingRoot, surface, `[${parameter}]`, "page.tsx")),
      true,
      `${surface}/${parameter}`
    );
  }
});

test("legacy universal client is removed", () => {
  assert.equal(fs.existsSync(path.join(housingRoot, "HousingOperationsClient.tsx")), false);
  assert.equal(fs.existsSync(path.join(housingRoot, "housing-operations.logic.ts")), false);
});

test("approved high-risk endpoints are wired through guarded housing mutations", () => {
  const source = readAllComponents();
  for (const contract of [
    '"approve"',
    '"void"',
    '"checkout"',
    "/actions`",
    "/transfer`",
    '"refund"',
    '"waiver"',
    '"deposit_refund"',
    "housing.handovers.complete-move-out-financial"
  ]) {
    assert.equal(source.includes(contract), true, contract);
  }
  assert.match(source, /idempotency\.keyFor\(/);
  assert.match(source, /审批申请已提交/);
  assert.match(read("HousingLeaseDetailClient.tsx"), /pending_approval" && eligible/);
  assert.match(read("HousingLeaseDetailClient.tsx"), /Boolean\(data\.finance_summary\)/);
  assert.match(read("HousingLeaseDetailClient.tsx"), /checkoutFinanciallyReady/);
  assert.match(read("HousingLeaseDetailClient.tsx"), /<ConsequenceDialog actionLabel=/);
  assert.match(read("HousingLeaseDetailClient.tsx"), /不会立即改变租约或财务状态/);
  assert.match(read("HousingFinanceActions.tsx"), /lastPaymentRecorderId/);
  assert.match(read("HousingFinanceActions.tsx"), /max=\{amountMax\}/);
  assert.match(read("HousingFinanceActions.tsx"), /<ConsequenceDialog actionLabel="确认提交财务审批"/);
  assert.match(read("HousingFinanceActions.tsx"), /不会立即退款、减免或退还押金/);
  const purchase = read("HousingEntityDetailClients.tsx");
  assert.match(purchase, /<ConsequenceDialog actionLabel=/);
  assert.match(purchase, /reasonPolicy=\{\{ kind: "required"/);
  assert.match(purchase, /loadOptions=\{loadHousingLeases\}/);
  assert.match(purchase, /不会立即生成租客应收/);
  assert.doesNotMatch(purchase, /目标租约 ID/);
});

test("Track A mutation panels use exact actions and owning aggregates", () => {
  const source = readAllComponents();
  for (const contract of [
    "housing.leases.create",
    "/housing/leases",
    "housing.leases.sign",
    "\"sign\"",
    "housing.leases.add-occupant",
    "\"occupants\"",
    "housing.billing.save-plan",
    "\"charge-plans\"",
    "housing.billing.generate",
    "\"generate-bills\"",
    "housing.finance.register",
    "/ledger",
    "housing.repairs.create",
    "/repairs",
    "housing.purchases.create",
    "/housing/purchases"
  ]) {
    assert.equal(source.includes(contract), true, contract);
  }
});

test("housing shared runtime slots include repair tasks from the backend projection", () => {
  const tasksPage = fs.readFileSync(path.join(housingRoot, "tasks", "page.tsx"), "utf8");
  const contract = read("housing-workbench-contract.ts");
  const backend = fs.readFileSync(
    path.join(housingRoot, "..", "..", "..", "api", "src", "modules", "housing", "housing-workbench-query.service.ts"),
    "utf8"
  );
  const taskAdapter = fs.readFileSync(
    path.join(housingRoot, "..", "..", "..", "api", "src", "modules", "housing", "housing-task.adapter.ts"),
    "utf8"
  );
  const overview = read("HousingOverviewSurfaceClients.tsx");

  assert.match(backend, /SELECT work_order\.id, 'housing_repair'/);
  assert.match(backend, /work_order\.source_type='tenant_request'/);
  assert.match(backend, /task\."sourceType"<>'housing_repair'/);
  assert.match(taskAdapter, /sourceType: "housing_repair"/);
  assert.match(taskAdapter, /detailPermission: "housing:repair:read"/);
  assert.match(taskAdapter, /deepLink: \(id\) => `\/housing\/repairs\/\$\{id\}`/);
  assert.match(taskAdapter, /source\.status IN \('10','20','30','40','45','50','80','91'\)/);
  assert.match(taskAdapter, /source\.create_time \+ \(\(COALESCE\(source\.sla_dispatch_min,30\)\)/);
  assert.match(taskAdapter, /COALESCE\(source\.accept_time,source\.dispatch_time,source\.create_time\)/);
  assert.match(taskAdapter, /COALESCE\(source\.sla_finish_min,240\)/);
  assert.doesNotMatch(taskAdapter, /COALESCE\(source\.finish_time,source\.create_time\) AS "dueAt"/);
  assert.doesNotMatch(taskAdapter, /WHEN source\.status IN \('80','90'\) THEN 'cancelled'/);
  assert.match(overview, /housing_repair: \{ feature: "housing\.repairs"/);
  assert.match(contract, /HOUSING_RUNTIME_TASK_SOURCE_TYPES = \[/);
  for (const sourceType of [
    "housing_lease",
    "housing_handover",
    "housing_repair",
    "housing_billing",
    "housing_purchase"
  ]) {
    assert.match(contract, new RegExp(`"${sourceType}"`), sourceType);
  }
  assert.match(tasksPage, /HOUSING_RUNTIME_TASK_SOURCE_TYPES/);
  assert.match(tasksPage, /taskSourceTypes=\{HOUSING_RUNTIME_TASK_SOURCE_TYPES\}/);
  assert.doesNotMatch(tasksPage, /taskSourceTypes=\{\[\s*"housing_lease"/);
});

test("attachment removal uses synchronous locks on every Track A workflow", () => {
  for (const name of [
    "HousingPurchaseCreatePanel.tsx",
    "HousingRepairCreatePanel.tsx",
    "HousingHandoverForm.tsx"
  ]) {
    const source = read(name);
    assert.match(source, /if \(removeLock\.current\) return;/, name);
    assert.match(source, /removeLock\.current = true;/, name);
    assert.match(source, /removeLock\.current = false;/, name);
  }
  const leaseSource = read("HousingLeaseSecondaryActions.tsx");
  assert.match(leaseSource, /if \(!signature \|\| lock\.current\) return;/);
  assert.match(leaseSource, /lock\.current = true;/);
  assert.match(leaseSource, /lock\.current = false;/);
  assert.match(leaseSource, /const succeeded = await mutate\("housing-lease-sign"/);
  assert.match(leaseSource, /if \(succeeded\) setSignature\(null\);/);
  assert.match(leaseSource, /let succeeded = false;/);
  assert.match(leaseSource, /succeeded = true;/);
  assert.match(leaseSource, /succeeded \? `\$\{success\} 数据刷新失败：\$\{detail\}` : detail/);
});

test("billing adopts the authoritative saved plan id before generation", () => {
  const source = read("HousingBillingActions.tsx");
  assert.match(source, /mutate<HousingChargePlanResponse>/);
  assert.match(source, /if \(plan\) setPlanId\(plan\.id\);/);
});

test("housing list requests reject stale completions and purchase defaults use the park date", () => {
  const collection = read("HousingCollectionPage.tsx");
  const collectionView = read("HousingCollectionView.tsx");
  assert.match(collection, /const requestSequence = useRef\(0\);/);
  assert.match(collection, /const sequence = \+\+requestSequence\.current;/);
  assert.equal((collection.match(/sequence !== requestSequence\.current/g) ?? []).length, 2);
  assert.match(collection, /const resultQueryKey = useRef<string \| null>\(null\);/);
  assert.match(collection, /if \(resultQueryKey\.current !== input\.queryKey\)/);
  assert.match(collection, /resultRef\.current = null;\s*setResult\(null\);/);
  assert.match(collection, /queryKey: JSON\.stringify\(\{/);
  assert.match(collection, /result: authorized && currentQuery \? result : null/);
  assert.match(collection, /: currentQuery \? state : \{ kind: "initial-loading" \}/);
  assert.match(collection, /const correctedPage = data\.result \? housingPageCorrection\(query\.page, data\.result\.total\) : null;/);
  assert.match(collection, /if \(correctedPage !== null\) query\.replace\(correctedPage, query\.active\)/);
  assert.match(collection, /router\[replace \? "replace" : "push"\]/);
  assert.match(collection, /hasAccess\(user, SYSTEM_PERMISSIONS\.ROLE_READ, "system"\)/);
  assert.match(collection, /hasAccess\(user, SYSTEM_PERMISSIONS\.ROLE_ASSIGN_DATA_SCOPE, "system"\)/);
  assert.match(collection, /hasAccess\(user, SYSTEM_PERMISSIONS\.PERMISSION_READ, "system"\)/);
  assert.match(collection, /hasAccess\(user, SYSTEM_PERMISSIONS\.DATA_SCOPE_READ, "system"\)/);
  assert.match(collection, /hasAccess\(user, SYSTEM_PERMISSIONS\.FIELD_POLICY_READ, "system"\)/);
  assert.match(collectionView, /changeScopeAction=\{props\.canChangeScope/);
  assert.match(collectionView, /href="\/system\/roles"/);
  assert.match(collectionView, /请联系管理员调整数据范围/);

  const purchase = read("HousingPurchaseCreatePanel.tsx");
  assert.match(purchase, /import \{ businessDate \} from "\.\.\/\.\.\/\.\.\/lib\/business-date";/);
  assert.match(purchase, /useEffect\(\(\) => setPurchaseDate\(businessDate\(\)\), \[\]\);/);
  assert.match(purchase, /value=\{purchaseDate\}/);
  assert.doesNotMatch(purchase, /toISOString\(\)/);
});

test("high-risk confirmation stays open when a housing mutation reports failure", () => {
  const lease = read("HousingLeaseDetailClient.tsx");
  const purchase = read("HousingEntityDetailClients.tsx");
  const finance = read("HousingFinanceActions.tsx");
  for (const source of [lease, purchase, finance]) {
    assert.match(source, /return true;/);
    assert.match(source, /return false;/);
  }
});

test("finance selection follows the refreshed receivable set", () => {
  const source = read("HousingFinanceActions.tsx");
  assert.match(source, /if \(!entryKinds\.includes\(entryKind\)\)/);
  assert.match(source, /setEntryKind\(entryKinds\[0\] \?\? "payment"\);/);
  assert.match(source, /!receivables\.some\(\(receivable\) => receivable\.id === receivableId\)/);
  assert.equal((source.match(/setReceivableId\(""\)/g) ?? []).length >= 3, true);
  assert.match(source, /isPositiveMoney\(receivable\.balance\)/);
  assert.match(source, /isPositiveMoney\(receivable\.paidAmount\)/);
  assert.match(source, /isPositiveMoney\(item\.summary\.deposit_balance\)/);
});

test("async housing forms capture the form element before awaiting", () => {
  for (const name of [
    "HousingFinanceActions.tsx",
    "HousingPurchaseCreatePanel.tsx",
    "HousingRentalSurfaceClients.tsx",
    "HousingRepairCreatePanel.tsx",
    "HousingLeaseCreatePanel.tsx"
  ]) {
    const source = read(name);
    assert.match(source, /const formElement = event\.currentTarget;/, name);
    assert.doesNotMatch(source, /event\.currentTarget\.reset\(\)/, name);
  }
});

test("housing tenant creation leaves the server-owned source domain to the API", () => {
  const source = read("HousingRentalSurfaceClients.tsx");
  assert.doesNotMatch(source, /source_domain\s*:/);
  assert.match(source, /buildHousingTenantCreateBody\(form\)/);
  assert.match(source, /apiRequest<HousingTenantListItem>\("\/housing\/tenants"/);
});

test("Party workbench distinguishes authoritative empty scope and white-lists sorting", () => {
  const source = fs.readFileSync(path.join(partiesRoot, "PartyWorkbenchClient.tsx"), "utf8");
  assert.match(source, /hasAuthoritativeEmptyPartyScope\(scopes, isSuper\)/);
  assert.match(source, /PARTY_LIST_SORTS\.some/);
  assert.match(source, /query\.set\("sort", sort\)/);
  assert.match(source, /query\.set\("order", order\)/);
});
