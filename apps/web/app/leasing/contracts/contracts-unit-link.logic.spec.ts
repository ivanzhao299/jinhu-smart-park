import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("new contract drafts continue directly into the unit-linking step", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /const response = await apiRequest<LeasingContractRow>\(path/);
  assert.match(page, /setEditing\(response\.data\)/);
  assert.match(page, /setContractDetailTab\("units"\)/);
  assert.match(page, /合同草稿已创建，请关联至少一个房源后再提交/);
  assert.match(page, /await loadContractUnits\(response\.data\.id\)/);
  assert.match(page, /if \(editing\) \{[\s\S]*?setShowForm\(false\)/);
});
