import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const webRoot = resolve(__dirname, "../../..");

const targetPages = [
  "app/leasing/receivables/page.tsx",
  "app/leasing/payments/page.tsx",
  "app/leasing/checkouts/page.tsx",
  "app/assets/units/UnitsPageClient.tsx"
] as const;

test("first-wave property lists use the shared shell with explicit filter and pagination contracts", () => {
  for (const path of targetPages) {
    const source = readFileSync(resolve(webRoot, path), "utf8");
    assert.match(source, /PropertyListShell/);
    assert.match(source, /PropertyResponsiveRecords|<UnitsTable/);
    assert.match(source, /appliedFilterChips=/);
    assert.match(source, /onApplyFilters=/);
    assert.match(source, /onResetFilters=/);
    assert.match(source, /pagination=/);
    assert.match(source, /setFilters\(\(current\) => \(\{ \.\.\.current, \[key\]:/);
    assert.match(source, /setAppliedFilters\(\(current\) => \(\{ \.\.\.current, \[key\]:/);
  }
});

test("newly paginated financial lists step back after deleting the last row", () => {
  for (const path of targetPages.slice(0, 3)) {
    const source = readFileSync(resolve(webRoot, path), "utf8");
    assert.match(source, /pageData\.items\.length === 1 && pageData\.page > 1 \? pageData\.page - 1 : pageData\.page/);
  }
});

test("first-wave leasing lists project desktop and mobile records from shared descriptors", () => {
  for (const path of targetPages.slice(0, 3)) {
    const source = readFileSync(resolve(webRoot, path), "utf8");
    assert.match(source, /PropertyFieldDescriptor/);
    assert.match(source, /fields=\{recordFields\}/);
    assert.doesNotMatch(source, /<DataTable className="allow-horizontal-table">/);
  }
});

test("units table removes the fixed desktop action width and uses responsive records", () => {
  const source = readFileSync(resolve(webRoot, "app/assets/units/components/UnitsTable.tsx"), "utf8");
  assert.match(source, /PropertyResponsiveRecords/);
  assert.match(source, /PropertyFieldDescriptor/);
  assert.doesNotMatch(source, /480px|allow-horizontal-table/);
  assert.doesNotMatch(source, /onPageChange/);
});

test("list shell stays out of financial and domain mutation paths", () => {
  const source = readFileSync(resolve(__dirname, "PropertyListShell.tsx"), "utf8");
  assert.doesNotMatch(source, /apiRequest|createIdempotencyKey|DELETE|POST|PUT/);
  assert.doesNotMatch(source, /receivable|payment|checkout|unit/i);
});
