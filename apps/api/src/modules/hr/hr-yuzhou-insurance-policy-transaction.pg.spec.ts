import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { DataSource } from "typeorm";
import { HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { createInsurancePolicyInTransaction, readInsurancePolicyForImport, updateInsurancePolicyInTransaction } from "./hr-yuzhou-insurance-policy-transaction";
const enabled = process.env.HR_INSURANCE_IMPORT_PG_REQUIRED === "1";
const database = `jinhu_hr_insurance_import_lab_${randomUUID().replaceAll("-", "")}`;
const scope = { tenantId: "fixture-tenant", parkId: "fixture-park" };
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic-insurance-import", roles: [], permissions: [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE] };
const facts = { name: null, scopeDescription: "synthetic scope", items: ["oldage", "remedy", "losework", "fund", "wound", "bear"].map(kind => ({ kind, variant: 1, baseRate: null, employerRate: "0.125", employeeRate: "0", supplementRate: "1", baseFixedAmount: null, employerFixedAmount: "-1.25", employeeFixedAmount: "0", supplementFixedAmount: "1" })) };
let admin: DataSource, db: DataSource, created = false;
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.ok(["55491", "55641"].includes(process.env.POSTGRES_PORT ?? ""));
  const config = { type: "postgres" as const, host: "127.0.0.1", port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD };
  admin = new DataSource({ ...config, database: "postgres" }); await admin.initialize();
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`); created = true;
  db = new DataSource({ ...config, database }); await db.initialize();
  assert.equal((await db.query("SELECT current_database() name"))[0].name, database);
  await db.query('CREATE EXTENSION "uuid-ossp"; CREATE TABLE hr_employee(id uuid PRIMARY KEY)');
  for (const filename of ["000239_hr_attendance_insurance_history.sql", "000299_hr_insurance_policy_fixed_amounts.sql"]) await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations", filename), "utf8"));
});
after(async () => {
  if (db?.isInitialized) await db.destroy();
  if (admin?.isInitialized) {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH(FORCE)`);
    assert.equal((await admin.query("SELECT count(*)::int n FROM pg_database WHERE datname=$1", [database]))[0].n, 0);
    await admin.destroy();
  }
});
async function counts() {
  return (await db.query("SELECT (SELECT count(*)::int FROM hr_insurance_policy) policies,(SELECT count(*)::int FROM hr_insurance_policy_item) items,(SELECT count(*)::int FROM hr_employee_insurance_period) periods"))[0];
}
test("actual migrations accept exact nullable factors and one reference with six scoped children", { skip: !enabled }, async () => {
  const result = await db.transaction(manager => createInsurancePolicyInTransaction(manager, scope, actor, `sha256:${"a".repeat(64)}`, facts));
  assert.equal(result.activated, false);
  assert.deepEqual(await counts(), { policies: 1, items: 6, periods: 0 });
  const rows = await db.query("SELECT base_rate::text base,employer_rate::text employer,base_fixed_amount::text fixed,employer_fixed_amount::text employer_fixed,tenant_id tenant,park_id park FROM hr_insurance_policy_item WHERE policy_id=$1", [result.policyId]);
  assert.equal(rows.length, 6);
  for (const row of rows) assert.deepEqual(row, { base: null, employer: "0.125000", fixed: null, employer_fixed: "-1.250", tenant: scope.tenantId, park: scope.parkId });
  const parent = (await db.query("SELECT policy_name,status,is_historical_import FROM hr_insurance_policy WHERE id=$1", [result.policyId]))[0];
  assert.deepEqual(parent, { policy_name: null, status: "historical", is_historical_import: true });
});
test("scope and missing permission failures preserve the actual database", { skip: !enabled }, async () => {
  const before = await counts();
  for (const denied of [{ ...actor, parkId: "foreign" }, { ...actor, permissions: actor.permissions.slice(0, 2) }]) await assert.rejects(db.transaction(manager => createInsurancePolicyInTransaction(manager, scope, denied, `sha256:${"b".repeat(64)}`, facts)));
  assert.deepEqual(await counts(), before);
});
test("late child failure rolls back reference and earlier children; same source retry then succeeds", { skip: !enabled }, async () => {
  const before = await counts();
  await db.query("CREATE FUNCTION fixture_reject_last_kind() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.insurance_kind='bear' THEN RAISE EXCEPTION 'fixture late failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_last_kind BEFORE INSERT ON hr_insurance_policy_item FOR EACH ROW EXECUTE FUNCTION fixture_reject_last_kind()");
  try { await assert.rejects(db.transaction(manager => createInsurancePolicyInTransaction(manager, scope, actor, `sha256:${"c".repeat(64)}`, facts)), /fixture late failure/u); assert.deepEqual(await counts(), before); }
  finally { await db.query("DROP TRIGGER fixture_reject_last_kind ON hr_insurance_policy_item; DROP FUNCTION fixture_reject_last_kind()"); }
  await db.transaction(manager => createInsurancePolicyInTransaction(manager, scope, actor, `sha256:${"c".repeat(64)}`, facts));
  assert.deepEqual(await counts(), { policies: before.policies + 1, items: before.items + 6, periods: 0 });
});
test("selective update preserves unselected facts, NULL and source snapshots; no-op does not bump versions", { skip: !enabled }, async () => {
  const policy = await db.transaction(manager => createInsurancePolicyInTransaction(manager, scope, actor, `sha256:${"d".repeat(64)}`, facts));
  const original = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  const snapshot = (await db.query("SELECT source_snapshot FROM hr_insurance_policy_item WHERE policy_id=$1 AND insurance_kind='oldage'", [policy.policyId]))[0];
  const changed = await db.transaction(manager => updateInsurancePolicyInTransaction(manager, scope, actor, policy.policyId, original, { "oldage.employerRate": "0.15", "oldage.employerFixedAmount": null }));
  assert.equal(changed.version, 2);
  const latest = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  assert.equal(latest.facts.items[0]!.employerRate, "0.15");
  assert.equal(latest.facts.items[0]!.employeeRate, "0");
  assert.equal(latest.facts.items[0]!.employerFixedAmount, null);
  assert.deepEqual((await db.query("SELECT source_snapshot FROM hr_insurance_policy_item WHERE policy_id=$1 AND insurance_kind='oldage'", [policy.policyId]))[0], snapshot);
  const noop = await db.transaction(manager => updateInsurancePolicyInTransaction(manager, scope, actor, policy.policyId, latest, { "oldage.employerRate": "0.150000" }));
  assert.equal(noop.version, 2);
  assert.equal((await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId))).factorHash, latest.factorHash);
});
test("child and metadata edits without parent version bump invalidate stale read evidence", { skip: !enabled }, async () => {
  const policy = await db.transaction(manager => createInsurancePolicyInTransaction(manager, scope, actor, `sha256:${"e".repeat(64)}`, facts));
  let prior = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  await db.query("UPDATE hr_insurance_policy_item SET employee_rate=0.2 WHERE policy_id=$1 AND insurance_kind='oldage'", [policy.policyId]);
  await assert.rejects(db.transaction(manager => updateInsurancePolicyInTransaction(manager, scope, actor, policy.policyId, prior, { "oldage.employerRate": "0.15" })), /CONCURRENT_CHANGE/u);
  prior = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  await db.query("UPDATE hr_insurance_policy SET policy_name='synthetic modern edit' WHERE id=$1", [policy.policyId]);
  await assert.rejects(db.transaction(manager => updateInsurancePolicyInTransaction(manager, scope, actor, policy.policyId, prior, { scopeDescription: null })), /CONCURRENT_CHANGE/u);
  const current = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  assert.equal(current.facts.name, "synthetic modern edit"); assert.equal(current.facts.items[0]!.employeeRate, "0.2");
  await assert.rejects(db.transaction(manager => updateInsurancePolicyInTransaction(manager, scope, actor, policy.policyId, current, { "oldage.unknown": "0" })), /FACTS_INVALID/u);
  await assert.rejects(db.transaction(manager => readInsurancePolicyForImport(manager, { ...scope, parkId: "foreign" }, { ...actor, parkId: "foreign" }, policy.policyId)), /TARGET_INVALID/u);
});
test("concurrent writers using the same evidence yield exactly one committed update", { skip: !enabled }, async () => {
  const policy = await db.transaction(manager => createInsurancePolicyInTransaction(manager, scope, actor, `sha256:${"f".repeat(64)}`, facts));
  const prior = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  const results = await Promise.allSettled(["0.3", "0.4"].map(rate => db.transaction(manager => updateInsurancePolicyInTransaction(manager, scope, actor, policy.policyId, prior, { "oldage.employerRate": rate }))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rejected.reason), /CONCURRENT_CHANGE/u);
  const latest = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  assert.equal(latest.version, 2);
  assert.ok(["0.3", "0.4"].includes(String(latest.facts.items[0]!.employerRate)));
});
test("late factor update failure rolls back earlier factor changes and parent version", { skip: !enabled }, async () => {
  const policy = await db.transaction(manager => createInsurancePolicyInTransaction(manager, scope, actor, `sha256:${"1".repeat(64)}`, facts));
  const prior = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  await db.query("CREATE FUNCTION fixture_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.insurance_kind='wound' THEN RAISE EXCEPTION 'fixture update failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_update BEFORE UPDATE ON hr_insurance_policy_item FOR EACH ROW EXECUTE FUNCTION fixture_reject_update()");
  try { await assert.rejects(db.transaction(manager => updateInsurancePolicyInTransaction(manager, scope, actor, policy.policyId, prior, { "oldage.employerRate": "0.3", "wound.employerRate": "0.3" })), /fixture update failure/u); }
  finally { await db.query("DROP TRIGGER fixture_reject_update ON hr_insurance_policy_item; DROP FUNCTION fixture_reject_update()"); }
  const latest = await db.transaction(manager => readInsurancePolicyForImport(manager, scope, actor, policy.policyId));
  assert.equal(latest.version, prior.version); assert.equal(latest.factorHash, prior.factorHash); assert.equal(latest.factsHash, prior.factsHash);
});
