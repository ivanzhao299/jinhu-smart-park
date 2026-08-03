import assert from "node:assert/strict";
import test from "node:test";
import { buildAvailablePlanCatalogQuery, DEFAULT_PLAN_CATALOG_SCOPE } from "./plan-catalog.logic";

test("available plan catalog gives the current scope precedence over the default catalog", () => {
  const result = buildAvailablePlanCatalogQuery(
    { tenantId: "tenant-a", parkId: "park-a" },
    { page: 2, page_size: 20, keyword: " pro " }
  );

  assert.match(result.sql, /PARTITION BY plan\.plan_code/);
  assert.match(result.sql, /CASE WHEN plan\.tenant_id = \$1 AND plan\.park_id = \$2 THEN 0 ELSE 1 END/);
  assert.deepEqual(result.parameters, [
    "tenant-a",
    "park-a",
    DEFAULT_PLAN_CATALOG_SCOPE.tenantId,
    DEFAULT_PLAN_CATALOG_SCOPE.parkId,
    "%pro%",
    20,
    20
  ]);
});

test("available plan catalog remains bounded by the validated page size", () => {
  const result = buildAvailablePlanCatalogQuery(
    { tenantId: "tenant-a", parkId: "park-a" },
    { page: 1, page_size: 100 }
  );

  assert.match(result.sql, /LIMIT \$7/);
  assert.equal(result.parameters[4], null);
  assert.equal(result.parameters[6], 100);
});
