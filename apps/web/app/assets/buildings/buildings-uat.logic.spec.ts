import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("blocked building deletion is localized and shown in an immediate dialog", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const service = readFileSync(
    resolve(__dirname, "../../../../api/src/modules/buildings/buildings.service.ts"),
    "utf8"
  );

  assert.match(page, /window\.alert\(failureMessage\)/);
  assert.match(page, /removeCommittedItem\(current, row\.id\)/);
  assert.match(page, /getCommittedDeleteRefreshError\(\(\) => load\(pageData\.page\)\)/);
  assert.match(service, /该楼栋下仍有未删除楼层，无法删除/);
  assert.doesNotMatch(service, /Building has undeleted floors and cannot be deleted/);
});
