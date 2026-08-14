import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

test("creating a park refreshes the persisted user projection before rebuilding React context", () => {
  const submit = source.slice(source.indexOf("async function submit"), source.indexOf("async function remove"));
  assert.match(submit, /const creating = editingId === null/);
  assert.match(submit, /await fetchCurrentUser\(\{ requestToken: getAccessToken\(\) \}\)/);
  assert.match(submit, /sessionStorage\.setItem\(PARK_FLASH_KEY/);
  assert.match(submit, /window\.location\.reload\(\)/);
  assert.ok(submit.indexOf("fetchCurrentUser") < submit.indexOf("window.location.reload"));
});

test("a committed park is reported separately when user-context refresh fails", () => {
  assert.match(source, /园区已保存，但可访问园区刷新失败/);
  assert.match(source, /请刷新页面后重试/);
  assert.match(source, /sessionStorage\.removeItem\(PARK_FLASH_KEY\)/);
});
