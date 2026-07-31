import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("SLA rule selectors load business dictionaries by code", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /loadDictMapByCodes<DictItemRow>\(SLA_RULE_DICT_CODES\)/);
  assert.match(
    page,
    /SLA_RULE_DICT_CODES = \["workorder_type", "workorder_urgency", "workorder_priority"\]/
  );
  assert.doesNotMatch(page, /["'`]\/dict-types/);
  assert.doesNotMatch(page, /dict_type_id=/);
});
