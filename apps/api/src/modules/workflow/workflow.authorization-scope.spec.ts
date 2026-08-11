import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("workflow assignee lookup reuses tenant-wide roles and permissions with park-scoped links", () => {
  const source = readFileSync(resolve(__dirname, "workflow.service.ts"), "utf8");
  const query = source.slice(source.indexOf("private async findUserIdsWithPermissions"));

  assert.match(query, /ur\.park_id::text = u\.park_id::text/);
  assert.match(query, /rp\.park_id::text = u\.park_id::text/);
  assert.match(query, /r\.tenant_id::text = u\.tenant_id::text/);
  assert.match(query, /p\.tenant_id::text = u\.tenant_id::text/);
  assert.doesNotMatch(query, /^\s+AND r\.park_id::text = u\.park_id::text/m);
  assert.doesNotMatch(query, /^\s+AND p\.park_id::text = u\.park_id::text/m);
});
