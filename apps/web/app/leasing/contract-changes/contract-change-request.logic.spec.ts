import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("contract change apiRequest callers pass structured bodies", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.doesNotMatch(page, /body:\s*JSON\.stringify/);
  assert.match(page, /body: payload/);
  assert.match(page, /body: action === "reject" \? \{ reject_reason: text, opinion: text \}/);
});
