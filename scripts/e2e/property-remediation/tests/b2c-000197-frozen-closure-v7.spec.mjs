import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { failureInjectionCasesV7 } from "../track-b2c-000197-failure-cases-v7.mjs";
import { AUTHORITATIVE_FILE_PATHS_V7 } from "../track-b2c-000197-preliminary-orchestrator-v7.mjs";

const root = process.cwd();
const manifestPath = resolve(root,
  ".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v7-input-manifest-20260802.grammar");
const ownedPaths = AUTHORITATIVE_FILE_PATHS_V7.filter((path) => path.startsWith("scripts/e2e/property-remediation/")
  && path.includes("b2c-000197-") && path.includes("v7"));
const implementationPaths = ownedPaths.filter((path) => !path.includes("/tests/"));

function manifestRows() {
  const lines = readFileSync(manifestPath, "utf8").trimEnd().split("\n");
  assert.equal(lines.shift(), "b2c-000197-preliminary-input-manifest-v7");
  return lines.filter((line) => line.startsWith("file\t")).map((line) => {
    const [, path, bytes, sha] = line.split("\t"); return { path, bytes: Number(bytes), sha };
  });
}

test("v7 closure owns four failure boundaries and imports no returned implementation", () => {
  const source = implementationPaths.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
  assert.doesNotMatch(source, /preliminary-(?:executor|orchestrator)-v[3456]\.mjs/u);
  assert.doesNotMatch(source, /old-writer-drain-v4-returned|93fb2c36/u);
  const cases = failureInjectionCasesV7();
  assert.deepEqual(cases.map(({ name }) => name), ["before-create", "after-create", "after-drop", "before-rename"]);
  assert.equal(new Set(cases.map(({ prefix, assertion }) => `${prefix}\n${assertion}`)).size, 4);
});

test("every real Node test child retains an explicit TAP reporter", () => {
  const source = ownedPaths.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
  for (const match of source.matchAll(/args:\s*\[([^\]]*(?:\.spec\.|exact-eight)[^\]]*)\]/gsu)) {
    assert.match(match[1], /--test-reporter=tap/u);
  }
  assert.doesNotMatch(source, /args:\s*\["--test"[,\]]/u);
});

test("manifest rows are the exact bidirectional dependency closure", () => {
  const rows = manifestRows(); const rowPaths = rows.map(({ path }) => path);
  assert.equal(new Set(rowPaths).size, rowPaths.length);
  assert.deepEqual([...rowPaths].sort(), [...AUTHORITATIVE_FILE_PATHS_V7].sort());
  for (const { path, bytes, sha } of rows) {
    const stat = lstatSync(resolve(root, path));
    assert.equal(stat.isSymbolicLink(), false, path); assert.equal(stat.size, bytes, path);
    assert.match(sha, /^[0-9a-f]{64}$/u, path);
  }
  const discovered = new Set();
  for (const owner of ownedPaths) {
    const source = readFileSync(resolve(root, owner), "utf8");
    for (const match of source.matchAll(/["']([^"']+\.(?:mjs|cjs|ts|json|grammar|md))["']/gu)) {
      const value = match[1]; let absolute = null;
      if (value.startsWith("./") || value.startsWith("../")) absolute = resolve(root, dirname(owner), value);
      else if (/^(?:apps|scripts|database|\.trellis)\//u.test(value)) absolute = resolve(root, value);
      else if (value.startsWith("src/")) absolute = resolve(root, "apps/api", value);
      if (absolute && !absolute.endsWith("b2c-000197-preliminary-v7-input-manifest-20260802.grammar")
          && !absolute.endsWith("b2c-000197-preliminary-executor-v7-review-handoff-20260802.md")) {
        discovered.add(relative(root, absolute));
      }
    }
  }
  for (const dependency of discovered) assert.ok(rowPaths.includes(dependency), `manifest omission:${dependency}`);
});
