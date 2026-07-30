import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("new energy adjustments select a readable posted billing item", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /\/energy\/billing-adjustments\/candidates\?page=\$\{page\}&page_size=50/);
  assert.doesNotMatch(page, /\/energy\/billing-items\?/);
  assert.doesNotMatch(page, /\/energy\/billing-cycles\?/);
  assert.doesNotMatch(page, /fetchReferenceFormOptions/);
  assert.match(page, /<select required value=\{form\.billingItemId\}/);
  assert.match(page, /请选择已发布账单项/);
  assert.match(page, /disabled=\{!item\.receivableId\}/);
  assert.match(page, /loadBillingItemOptions\(billingItemPage \+ 1\)/);
  assert.match(page, /formatBillingItemOption\(item\)/);
  assert.match(page, /function openCreate\(\)[\s\S]*loadBillingItemOptions\(1\)/);
  assert.doesNotMatch(page, /useEffect\(\(\) => \{ void loadBillingItemOptions/);
  assert.doesNotMatch(page, /<Field label="账单项 ID"><input required/);
});
