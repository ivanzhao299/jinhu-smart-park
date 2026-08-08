import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { failureInjectionCasesV9 } from "../track-b2c-000197-failure-cases-v9.mjs";
import { authoritativeFileRowsV9 } from "../track-b2c-000197-preliminary-orchestrator-v9.mjs";
import { resolveFormalExecutionClosureV9 } from "../track-b2c-000197-closure-resolver-v9.mjs";

const root = process.cwd();
const manifestPath = resolve(root,
  ".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v9-input-manifest-20260802.grammar");
const implementationPaths = [
  "scripts/e2e/property-remediation/track-b2c-000197-failure-cases-v9.mjs",
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-executor-v9.mjs",
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v9.mjs",
  "scripts/e2e/property-remediation/track-b2c-000197-closure-resolver-v9.mjs",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function rows() {
  const lines = readFileSync(manifestPath, "utf8").trimEnd().split("\n");
  assert.equal(lines.shift(), "b2c-000197-preliminary-input-manifest-v9");
  return lines.filter((line) => line.startsWith("file\t")).map((line) => {
    const [, path, bytes, sha, reason] = line.split("\t"); return { path, bytes: Number(bytes), sha, reason };
  });
}

test("v9 implementation owns complete fault capability and imports no v3-v7 implementation or authority", () => {
  const source = implementationPaths.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
  assert.doesNotMatch(source, /preliminary-(?:executor|orchestrator)-v[34567]\.mjs/u);
  assert.doesNotMatch(source, /old-writer-drain-v4-returned|93fb2c36/u);
  const cases = failureInjectionCasesV9();
  assert.deepEqual(cases.map(({ name }) => name), ["before-create", "after-create", "after-drop", "before-rename"]);
});

test("manifest is exact omission/excess/size/SHA closure with no node_modules", () => {
  const manifestRows = rows(); const actual = manifestRows.map(({ path, reason }) => ({ path, reason }));
  const expected = authoritativeFileRowsV9();
  assert.equal(new Set(actual.map(({ path }) => path)).size, actual.length); assert.deepEqual(actual, expected);
  for (const row of manifestRows) {
    const path = resolve(root, row.path); const stat = lstatSync(path); const content = readFileSync(path);
    assert.equal(stat.isSymbolicLink(), false, row.path); assert.equal(stat.size, row.bytes, row.path);
    assert.equal(sha256(content), row.sha, row.path); assert.doesNotMatch(row.path, /(?:^|\/)node_modules\//u);
    assert.match(row.reason, /^(?:authority-input|readonly-preflight|typecheck-compiler|typecheck-governance|formal-recursive)$/u);
  }
});

test("every recursive execution dependency is represented and governance outputs avoid self-hash", () => {
  const actual = new Set(rows().map(({ path }) => path)); const closure = resolveFormalExecutionClosureV9(root);
  for (const path of closure.repositoryFiles) assert.ok(actual.has(path), `omission:${path}`);
  for (const path of ["package.json", "apps/api/package.json", "apps/api/tsconfig.json", "tsconfig.base.json",
    "pnpm-workspace.yaml", "pnpm-lock.yaml", "packages/shared/package.json"]) assert.ok(actual.has(path), path);
  assert.ok(closure.builtin.length > 0); assert.ok(closure.external.length > 0); assert.deepEqual(closure.unresolved, []);
  assert.equal(actual.has(".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v9-input-manifest-20260802.grammar"), false);
  assert.equal(actual.has(".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-executor-v9-review-handoff-20260802.md"), false);
});
