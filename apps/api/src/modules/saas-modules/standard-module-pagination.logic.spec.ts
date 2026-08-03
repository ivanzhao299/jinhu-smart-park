import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("standard module pagination uses stable unique tie-breakers", () => {
  const source = readFileSync(resolve(__dirname, "saas-modules.service.ts"), "utf8");
  const start = source.indexOf("async listStandardModules");
  const end = source.indexOf("async createModule", start);
  const listSource = source.slice(start, end);

  assert.match(
    listSource,
    /orderBy\("module\.moduleGroup", "ASC"\)\s+\.addOrderBy\("module\.sortNo", "ASC"\)\s+\.addOrderBy\("module\.moduleCode", "ASC"\)\s+\.addOrderBy\("module\.id", "ASC"\)\s+\.skip/
  );
});
