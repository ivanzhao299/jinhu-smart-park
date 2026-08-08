import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const root = __dirname;

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "testing" ? [] : productionFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
      ? [path] : [];
  }).sort();
}

describe("C4 property task ownership and unique writer contract", () => {
  it("has one projection function SQL callsite and no direct projection/head DML", () => {
    const files = productionFiles(root);
    assert.ok(files.length > 0, "property-task production runtime must exist");
    const occurrences: string[] = [];
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const label = relative(root, path);
      for (const match of source.matchAll(/fn_property_task_projection_replace_v1/gu)) {
        occurrences.push(`${label}:${match.index}`);
      }
      assert.doesNotMatch(source,
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?biz_property_task_projection(?:_head)?\b/iu,
        label);
      assert.doesNotMatch(source,
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+[^;]*property_task_projection/iu,
        label);
    }
    assert.equal(occurrences.length, 1,
      `expected one replace-function callsite, observed ${occurrences.join(",")}`);
    assert.match(occurrences[0]!, /^property-task\.projection\.repository\.ts:/u);
  });

  it("never owns receipt persistence or imports approval internals", () => {
    const receiptSerializationHelperImports: string[] = [];
    for (const path of productionFiles(root)) {
      const source = readFileSync(path, "utf8");
      const label = relative(root, path);
      assert.doesNotMatch(source,
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?biz_property_mutation_receipt\b/iu,
        label);
      let sourceWithoutAllowedImport = source;
      for (const match of source.matchAll(
        /\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?/gu)) {
        const importClause = match[1]!;
        const importPath = match[2]!;
        if (importPath !== "../property-approvals/property-mutation-receipt.adapter") {
          continue;
        }
        assert.equal(label, "property-task.orchestrator.ts",
          `receipt serialization helper import is not allowed in ${label}`);
        assert.match(importClause,
          /^\{\s*isPropertyMutationReceiptSerializationFailure\s*\}$/u,
          `receipt adapter import content drifted in ${label}`);
        receiptSerializationHelperImports.push(label);
        sourceWithoutAllowedImport = sourceWithoutAllowedImport.replace(match[0], "");
      }
      assert.doesNotMatch(sourceWithoutAllowedImport,
        /property-approvals\/(?:entities|property-approval\.(?:repository|service)|property-mutation-receipt\.adapter)/u,
        label);
    }
    assert.deepEqual(receiptSerializationHelperImports, ["property-task.orchestrator.ts"],
      "expected exactly one precisely scoped receipt serialization helper import");
  });

  it("keeps production source registration exact-empty and test fixtures out of production", () => {
    const files = productionFiles(root);
    const provider = files.find((path) => path.endsWith("property-task.registry.ts"));
    assert.ok(provider, "production registry provider is required");
    const source = readFileSync(provider, "utf8");
    assert.match(source, /createPropertyTaskProductionSourceRegistry/u);
    for (const path of files) {
      assert.doesNotMatch(readFileSync(path, "utf8"), /test_fixture_/u, relative(root, path));
    }
  });
});
