import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { PropertyMutationReceiptEntity } from "./entities/property-approval.entities";

const moduleRoot = __dirname;
const expectedLegacyActions = [
  "property.approval.submit",
  "property.approval.withdraw",
  "property.approval.decide",
  "property.approval.incident-retry",
  "property.event.replay",
  "property.notification.mark-read"
] as const;

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
      ? [path]
      : [];
  });
}

describe("legacy mutation receipt contract ownership", () => {
  it("maps the receipt contract discriminator without changing legacy payload fields", () => {
    const column = getMetadataArgsStorage().columns.find((candidate) =>
      candidate.target === PropertyMutationReceiptEntity
      && candidate.propertyName === "receiptContractVersion"
    );
    assert.ok(column);
    assert.equal(column.options.name, "receipt_contract_version");
    assert.equal(column.options.type, "varchar");
    assert.equal(column.options.length, 16);
  });

  it("has exactly six legacy-v1 writers plus the one allowlisted port-v2 SQL writer", () => {
    const sources = productionTypeScriptFiles(moduleRoot).map((path) => ({
      path,
      source: readFileSync(path, "utf8")
    }));
    const actions: string[] = [];
    let legacyWriterCount = 0;
    const portV2WriterPaths: string[] = [];

    for (const { path, source } of sources) {
      for (const match of source.matchAll(
        /mutationRepository\.create\(\{([\s\S]*?)\}\)/g
      )) {
        legacyWriterCount += 1;
        const body = match[1] ?? "";
        assert.match(body, /receiptContractVersion:\s*"legacy-v1"/u, path);
        const action = body.match(/actionId:\s*"([^"]+)"/u)?.[1];
        assert.ok(action, `missing literal receipt action in ${path}`);
        actions.push(action);
      }

      for (const match of source.matchAll(
        /INSERT\s+INTO\s+(?:public\.)?biz_property_mutation_receipt\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/giu
      )) {
        const columns = (match[1] ?? "").split(",").map((value) => value.trim());
        const values = match[2] ?? "";
        assert.ok(columns.includes("receipt_contract_version"), path);
        if (/'port-v2'/u.test(values)) {
          assert.equal(path, join(moduleRoot, "property-mutation-receipt.adapter.ts"));
          assert.match(source, /export class DatabasePropertyMutationReceiptAdapter/u);
          assert.match(values, /^'port-v2',/u);
          portV2WriterPaths.push(path);
        } else {
          legacyWriterCount += 1;
          assert.match(values, /'legacy-v1'/u, path);
          const action = values.match(
            /'(property\.(?:event\.replay|notification\.mark-read))'/u
          )?.[1];
          assert.ok(action, `missing allowlisted raw-SQL receipt action in ${path}`);
          actions.push(action);
        }
      }
    }

    assert.equal(legacyWriterCount, expectedLegacyActions.length);
    assert.deepEqual([...new Set(actions)].sort(), [...expectedLegacyActions].sort());
    assert.deepEqual(portV2WriterPaths, [
      join(moduleRoot, "property-mutation-receipt.adapter.ts")
    ]);
  });
});
