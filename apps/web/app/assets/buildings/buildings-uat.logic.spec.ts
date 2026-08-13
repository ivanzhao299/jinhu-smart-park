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

test("post-switch creation failures survive the required page reload", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /sessionStorage\.setItem\([\s\S]*BUILDING_FLASH_KEY/u);
  assert.match(page, /sessionStorage\.getItem\(BUILDING_FLASH_KEY\)/u);
  assert.match(page, /sessionStorage\.removeItem\(BUILDING_FLASH_KEY\)/u);
  assert.match(page, /current \? `\$\{current\}；列表加载失败：\$\{error\.message\}` : error\.message/u);
  assert.ok(page.indexOf("sessionStorage.setItem(") < page.indexOf("window.location.reload();", page.indexOf("catch (error)")));
});

test("park switch failures are visible inside the building drawer", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /setFormMessage\(error instanceof Error \? error\.message : "楼栋保存失败"\)/u);
  assert.match(page, /formMessage \? <p className="status-pill" role="alert">\{formMessage\}<\/p>/u);
});

test("a committed save reports a later list refresh failure as partial success", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /保存成功，但列表刷新失败：/u);
});
