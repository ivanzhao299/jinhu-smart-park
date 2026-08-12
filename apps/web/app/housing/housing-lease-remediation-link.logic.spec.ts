import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("historical ineligible lease remediation link requires asset module and exact control-plane read permissions", () => {
  const source = readFileSync(resolve(__dirname, "_components/HousingLeaseDetailClient.tsx"), "utf8");

  assert.match(source, /module="asset" permission=\{PROPERTY_BUSINESS_PERMISSIONS\.PROPERTY_OPERATIONS_PAGE\}/);
  assert.match(source, /module="asset" permission=\{PROPERTY_BUSINESS_PERMISSIONS\.PROPERTY_OPERATION_READ\}/);
  assert.match(source, /assets\/property-operations/);
});
