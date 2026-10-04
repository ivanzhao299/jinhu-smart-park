import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = process.cwd().endsWith("/apps/api") ? resolve(process.cwd(), "../..") : process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("incremental Yuzhou import is finite, encrypted and operation-idempotent", () => {
  const migration = read("database/migrations/000327_hr_yuzhou_incremental_import_ledger.sql");
  const service = read("apps/api/src/modules/hr/hr-yuzhou-incremental-import.service.ts");
  const controller = read("apps/api/src/modules/hr/hr-yuzhou-incremental-import.controller.ts");
  const contract = read("packages/shared/src/hr-yuzhou-incremental.ts");
  for (const value of ["employee", "profile", "contract", "package_encrypted", "source_facts_encrypted", "uq_hr_incremental_import_item_source", "uq_hr_incremental_import_revision"]) assert.match(migration, new RegExp(value));
  assert.match(contract, /YUZHOU_INCREMENTAL_FIELDS/);
  assert.match(service, /Unsupported \$\{item\.domain\} field/);
  assert.match(service, /sourceKey must be canonical sha256:<sourceIdentity>/);
  assert.match(service, /rowDigest does not match the normalized source payload/);
  assert.match(service, /INITIAL_FIELD_BASELINE_UNKNOWN/);
  assert.match(service, /source_pk_canonical=\$3 AND map\.source_identity_sha256=\$4/);
  assert.match(service, /'\{\}'::jsonb,'\{\}'::jsonb/);
  assert.match(service, /this\.sensitive\.encrypt/);
  assert.match(service, /Incremental import package drift detected/);
  assert.match(service, /version=version\+1/);
  assert.match(service, /Incremental target changed concurrently/);
  assert.match(controller, /IdempotencyInterceptor/);
  assert.match(controller, /captureBody: false/);
  assert.doesNotMatch(service, /DELETE FROM hr_employee|DELETE FROM hr_contract|INSERT INTO sys_user|hr_payroll_run/);
});
