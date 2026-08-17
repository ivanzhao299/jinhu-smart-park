import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("tenant company dictionaries load directly by code without type pagination", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /loadDictMapByCodes<DictItemRow>\(codes\)/);
  assert.match(page, /"park_tenant_status"/);
  assert.match(page, /"park_tenant_type"/);
  assert.match(page, /"park_tenant_risk_level"/);
  assert.match(page, /"industry_code"/);
  assert.match(page, /"park_tenant_source_type"/);
  assert.doesNotMatch(page, /\/dict-types\?page=1&page_size=100/);
  assert.doesNotMatch(page, /dict_type_id=\$\{dictTypeId\}/);
});
