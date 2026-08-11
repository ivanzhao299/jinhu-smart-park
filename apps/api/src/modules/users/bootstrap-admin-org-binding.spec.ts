import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "../../../../../scripts/bootstrap-admin.sh"), "utf8");

test("bootstrap admin preserves any other primary organization assignment", () => {
  assert.match(source, /id <> '\$existing_id'[\s\S]*is_primary = true/);
  assert.doesNotMatch(source, /org_id <> '\$org_id'[\s\S]*is_primary = true/);
  assert.match(source, /root_is_primary=true[\s\S]*other_primary_id[\s\S]*root_is_primary=false/);
  assert.match(source, /is_primary = \$root_is_primary/);
  assert.match(source, /NULL, \$root_is_primary, NULL/);
});
