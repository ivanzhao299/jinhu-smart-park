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

test("Track B high-risk endpoints are absent from housing client mutations", () => {
  const source = readAllComponents();
  for (const endpoint of [
    "/approve",
    "/void",
    "/checkout",
    "/actions",
    "/transfer"
  ]) {
    assert.equal(source.includes(`\`${endpoint}`), false, endpoint);
    assert.equal(source.includes(`/${endpoint.slice(1)}\``), false, endpoint);
  }
  for (const entryType of ["refund", "waiver", "deposit_refund", "deposit_deduction"]) {
    assert.doesNotMatch(source, new RegExp(`value=["']${entryType}["']`), entryType);
  }
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
  assert.match(collection, /const requestSequence = useRef\(0\);/);
  assert.match(collection, /const sequence = \+\+requestSequence\.current;/);
  assert.equal((collection.match(/sequence !== requestSequence\.current/g) ?? []).length, 2);
  assert.match(collection, /const resultQueryKey = useRef<string \| null>\(null\);/);
  assert.match(collection, /if \(resultQueryKey\.current !== input\.queryKey\)/);
  assert.match(collection, /resultRef\.current = null;\s*setResult\(null\);/);
  assert.match(collection, /queryKey: JSON\.stringify\(\{/);
  assert.match(collection, /result: authorized && currentQuery \? result : null/);
  assert.match(collection, /: currentQuery \? state : \{ kind: "initial-loading" \}/);

  const purchase = read("HousingPurchaseCreatePanel.tsx");
  assert.match(purchase, /import \{ businessDate \} from "\.\.\/\.\.\/\.\.\/lib\/business-date";/);
  assert.match(purchase, /useEffect\(\(\) => setPurchaseDate\(businessDate\(\)\), \[\]\);/);
  assert.match(purchase, /value=\{purchaseDate\}/);
  assert.doesNotMatch(purchase, /toISOString\(\)/);
});

test("finance selection follows the refreshed receivable set", () => {
  const source = read("HousingFinanceActions.tsx");
  assert.match(source, /if \(!entryKinds\.includes\(entryKind\)\)/);
  assert.match(source, /setEntryKind\(entryKinds\[0\] \?\? "payment"\);/);
  assert.match(source, /!receivables\.some\(\(receivable\) => receivable\.id === receivableId\)/);
  assert.equal((source.match(/setReceivableId\(""\)/g) ?? []).length >= 3, true);
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
