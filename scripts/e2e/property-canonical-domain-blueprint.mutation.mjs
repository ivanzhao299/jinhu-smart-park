import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const source = readFileSync(resolve(root, "docs/architecture/property-canonical-domain-blueprint.md"), "utf8");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "jinhu-property-blueprint-"));

function expectMutationFailure(name, mutate) {
  const target = join(temporaryDirectory, `${name}.md`);
  const mutated = mutate(source);
  assert.notEqual(mutated, source, `${name} mutation did not change the blueprint`);
  writeFileSync(target, mutated, "utf8");
  const result = spawnSync(process.execPath, [resolve(root, "scripts/e2e/property-canonical-domain-blueprint.contract.mjs")], {
    cwd: root,
    env: { ...process.env, PROPERTY_CANONICAL_BLUEPRINT_PATH: target },
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0, `${name} mutation unexpectedly passed`);
}

try {
  expectMutationFailure("status", (value) => value.replace(',"terminated","void"] -->', ',"terminated"] -->'));
  expectMutationFailure("endpoint", (value) => value.replace('"path":"leases/:id/sign"', '"path":"leases/:id/sign-missing"'));
  expectMutationFailure("schema", (value) => value.replace('"biz_leasing_refund"] -->', '"biz_leasing_refund","biz_missing_mutation_probe"] -->'));
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("property canonical domain blueprint mutation probes passed: status, endpoint, schema");
