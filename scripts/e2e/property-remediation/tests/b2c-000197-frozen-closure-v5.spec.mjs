import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { failureInjectionCasesV5 } from "../track-b2c-000197-failure-cases-v5.mjs";

const root = process.cwd();
const files = [
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-executor-v5.mjs",
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v5.mjs",
  "scripts/e2e/property-remediation/track-b2c-000197-failure-cases-v5.mjs",
];

test("v5 closure has no ES import of returned v3/v4 executors or old failure cases", () => {
  const source = files.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
  assert.doesNotMatch(source, /preliminary-(?:executor|orchestrator)-v[34]\.mjs/u);
  assert.doesNotMatch(source, /from ["']\.\/track-b2c-000197-preliminary-executor\.mjs["']/u);
  assert.doesNotMatch(source, /failureInjectionCases(?!V5)/u);
});

test("v5 owns four unique failure boundaries", () => {
  const cases = failureInjectionCasesV5();
  assert.deepEqual(cases.map(({ name }) => name), ["before-create", "after-create", "after-drop", "before-rename"]);
  assert.equal(new Set(cases.map(({ prefix, assertion }) => `${prefix}\n${assertion}`)).size, 4);
});

test("every real Node test child in v5 uses explicit TAP reporter", () => {
  const source = files.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
  for (const match of source.matchAll(/args:\s*\[([^\]]*(?:\.spec\.|exact-eight)[^\]]*)\]/gsu)) {
    assert.match(match[1], /--test-reporter=tap/u);
  }
  assert.doesNotMatch(source, /args:\s*\["--test"[,\]]/u);
});
