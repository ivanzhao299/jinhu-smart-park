import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "HomestayStayActions.tsx"), "utf8");

test("issued credentials expose audited return and loss actions", () => {
  assert.match(source, /item\.status === "issued"/);
  assert.match(source, /credentials\/\$\{item\.id\}\/return/);
  assert.match(source, /credentials\/\$\{lostCredential!\.id\}\/lost/);
  assert.match(source, /reasonPolicy=\{\{ kind: "required"/);
  assert.match(source, /不能再登记回收；处置原因将写入审计日志/);
});
