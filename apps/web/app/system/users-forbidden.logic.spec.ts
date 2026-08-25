import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "users/page.tsx"), "utf8");

test("user directory data-level 403 uses the shared forbidden state", () => {
  assert.match(source, /isForbiddenError\(error\)/);
  assert.match(source, /setApiForbidden\(true\)/);
  assert.match(source, /if \(apiForbidden\)/);
  assert.match(source, /<ForbiddenState message="当前账号拥有用户管理页面入口，但没有用户目录的数据访问权限。"/);
});
