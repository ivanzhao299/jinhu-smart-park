import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("checkout dictionaries load directly by code without type pagination", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /loadDictMapByCodes<DictItemRow>\(codes\)/);
  assert.match(page, /"leasing_checkout_type"/);
  assert.match(page, /"leasing_release_unit_status"/);
  assert.doesNotMatch(page, /\/dict-types\?page=1&page_size=100/);
});
