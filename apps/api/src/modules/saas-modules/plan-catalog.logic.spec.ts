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

test("available plan catalog excludes plans that cannot provision any module", () => {
  const result = buildAvailablePlanCatalogQuery(
    { tenantId: "tenant-a", parkId: "park-a" },
    { page: 1, page_size: 20 }
  );

  const ranked = result.sql.slice(result.sql.indexOf("ranked AS"), result.sql.indexOf("selected AS"));
  const selected = result.sql.slice(result.sql.indexOf("selected AS"), result.sql.indexOf("paged AS"));
  assert.doesNotMatch(ranked, /jsonb_array_length/);
  assert.match(selected, /precedence = 1\s+AND jsonb_array_length\(COALESCE\(module_codes, '\[\]'::jsonb\)\) > 0/);
});

test("available plan catalog orders the selected rows before applying offset and limit", () => {
  const result = buildAvailablePlanCatalogQuery(
    { tenantId: "tenant-a", parkId: "park-a" },
    { page: 2, page_size: 100 }
  );
  const paged = result.sql.slice(result.sql.indexOf("paged AS"), result.sql.indexOf("totals AS"));

  assert.match(paged, /FROM selected\s+ORDER BY sort_no ASC, plan_code ASC, id ASC\s+OFFSET \$6\s+LIMIT \$7/);
});

test("available plan catalog applies keyword filtering after scope precedence", () => {
  const result = buildAvailablePlanCatalogQuery(
    { tenantId: "tenant-a", parkId: "park-a" },
    { page: 1, page_size: 20, keyword: "starter" }
  );
  const ranked = result.sql.slice(result.sql.indexOf("ranked AS"), result.sql.indexOf("selected AS"));
  const selected = result.sql.slice(result.sql.indexOf("selected AS"), result.sql.indexOf("paged AS"));

  assert.doesNotMatch(ranked, /\$5/);
  assert.match(selected, /WHERE precedence = 1\s+AND jsonb_array_length[\s\S]+AND \(\$5::text IS NULL OR plan_code ILIKE \$5 OR plan_name ILIKE \$5\)/);
});
