import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { LegacyDualSourceReconciliationError, verifyLegacyDualSourceReconciliation, verifyObservedGroupWebProfile } from "../hr-cutover/legacy-dual-source-reconciliation-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const contract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-dual-source-reconciliation-v1.json"), "utf8"));
const extractor = readFileSync(resolve(root, "scripts/extract-yuzhou-group-web-profile.sh"), "utf8");
const profileSql = readFileSync(resolve(root, "scripts/hr-cutover/sql/profile-group-web-source.sql"), "utf8");
const provisioner = readFileSync(resolve(root, "scripts/hr-cutover/provision-group-web-readonly.mjs"), "utf8");
const profileRunner = readFileSync(resolve(root, "scripts/hr-cutover/run-group-web-profile.mjs"), "utf8");
const employeeReconciliation = readFileSync(resolve(root, "scripts/hr-cutover/extract-dual-source-employee-reconciliation.mjs"), "utf8");
const reconciliationRehearsal = readFileSync(resolve(root, "scripts/hr-cutover/rehearse-dual-source-reconciliation.mjs"), "utf8");
const clone = value => structuredClone(value);
const rejects = (code, callback) => assert.throws(callback, error => error instanceof LegacyDualSourceReconciliationError && error.code === code);

test("desktop client and Group Web remain separate legacy sources with exact reviewed catalogs", () => {
  assert.deepEqual(verifyLegacyDualSourceReconciliation(contract), {
    ok: true,
    sources: 2,
    groupWebTables: 438,
    groupWebRows: 320406,
    groupWebEmployees: 548,
    activeManualReview: 115,
    productionImport: "HOLD"
  });
});

test("Group Web rollups and key table counts fail closed on catalog drift", () => {
  const rowDrift = clone(contract);
  rowDrift.groupWebCatalogRollup[0].rows -= 1;
  rejects("GROUP_WEB_ROLLUP_INVALID", () => verifyLegacyDualSourceReconciliation(rowDrift));
  const keyDrift = clone(contract);
  keyDrift.groupWebKeyTableCounts.Emp_tBasicInfo -= 1;
  rejects("GROUP_WEB_KEY_COUNTS_INVALID", () => verifyLegacyDualSourceReconciliation(keyDrift));
});

test("all and active employee reconciliation equations fail closed", () => {
  const allDrift = clone(contract);
  allDrift.reconciliation.allGroupWeb.unmatched -= 1;
  rejects("DUAL_SOURCE_RECONCILIATION_INVALID", () => verifyLegacyDualSourceReconciliation(allDrift));
  const activeDrift = clone(contract);
  activeDrift.reconciliation.activeGroupWeb.uniqueToGroupWeb -= 1;
  rejects("DUAL_SOURCE_RECONCILIATION_INVALID", () => verifyLegacyDualSourceReconciliation(activeDrift));
});

test("name-only matching, automatic employee creation, production import and sensitive evidence remain blocked", () => {
  const nameMatch = clone(contract);
  nameMatch.identityPolicy.nameOnlyMatch = "allowed";
  rejects("DUAL_SOURCE_IDENTITY_POLICY_INVALID", () => verifyLegacyDualSourceReconciliation(nameMatch));
  const automatic = clone(contract);
  automatic.identityPolicy.automaticEmployeeCreation = true;
  rejects("DUAL_SOURCE_IDENTITY_POLICY_INVALID", () => verifyLegacyDualSourceReconciliation(automatic));
  const importGo = clone(contract);
  importGo.migrationPolicy.productionImport = "GO";
  rejects("DUAL_SOURCE_IMPORT_GATE_INVALID", () => verifyLegacyDualSourceReconciliation(importGo));
  const sensitive = clone(contract);
  sensitive.migrationPolicy.requiredBeforeImport.push(["pass", "word=example"].join(""));
  rejects("DUAL_SOURCE_SENSITIVE_CONTENT", () => verifyLegacyDualSourceReconciliation(sensitive));
});

test("Group Web profiling requires exact read-only authority and emits only structural aggregates", () => {
  assert.match(extractor, /credential file must be mode 0600/);
  assert.match(extractor, /sa is forbidden for extraction/);
  assert.match(extractor, /FreeTDS tsql is required/);
  assert.match(profileRunner, /AUTH\|0\|1\|1\|0\|0\|0\|0/);
  assert.match(profileRunner, /TDSVER: "7\.0"/);
  assert.match(profileSql, /SET TRANSACTION ISOLATION LEVEL READ COMMITTED/);
  assert.match(profileSql, /COUNT_BIG\(\*\)/);
  assert.match(profileSql, /ROLLBACK TRANSACTION/);
  assert.doesNotMatch(profileSql, /FOR JSON/);
  assert.doesNotMatch(profileSql, /(?:idcard|identitycard|handtel|mobile|salary_amount|personname|empname)/i);
  assert.doesNotMatch(profileSql, /INSERT\s+INTO\s+(?!@counts)/i);
  assert.doesNotMatch(profileSql, /UPDATE\s+|DELETE\s+FROM/i);
});

test("a fresh observed Group Web profile must reconcile exactly to the reviewed contract", () => {
  const catalog = { ...contract.sources.groupWeb.catalog };
  delete catalog.schemaHash;
  delete catalog.tableRowCountHash;
  const observed = {
    formatVersion: 1,
    profileKind: "yuzhou_hr_legacy_group_web_observed_profile",
    operationMode: "read_only",
    catalog,
    rollup: [...contract.groupWebCatalogRollup].reverse(),
    keyTableCounts: Object.entries(contract.groupWebKeyTableCounts).map(([table, rows]) => ({ table, rows })).reverse()
  };
  assert.deepEqual(verifyObservedGroupWebProfile(observed, contract), { ok: true, tables: 438, fields: 5449, rows: 320406, keyTables: 17, operationMode: "read_only" });
  const drift = clone(observed);
  drift.catalog.rows += 1;
  rejects("GROUP_WEB_PROFILE_CATALOG_DRIFT", () => verifyObservedGroupWebProfile(drift, contract));
});

test("legacy Group Web ETL account provisioning is explicit, random, least-privilege and secret-safe", () => {
  assert.match(provisioner, /ALLOW_YUZHOU_LEGACY_ACCOUNT_PROVISION/);
  assert.match(provisioner, /IS_SRVROLEMEMBER\('sysadmin'\)/);
  assert.match(provisioner, /randomBytes\(24\)/);
  assert.match(provisioner, /sp_addrolemember N'db_datareader'/);
  assert.match(provisioner, /GRANT SELECT/);
  assert.match(provisioner, /GRANT VIEW DEFINITION/);
  assert.match(provisioner, /DENY INSERT, UPDATE, DELETE, EXECUTE/);
  assert.match(provisioner, /0\|1\|1\|0\|0\|0\|0/);
  assert.match(provisioner, /openSync\(temp, "wx", 0o600\)/);
  assert.match(provisioner, /secretValuesPrinted: false/);
  assert.match(provisioner, /if \(cleanupContext\)/);
  assert.doesNotMatch(provisioner, /192\.168\.\d+\.\d+|(?:hardcoded_password|plaintext_secret)/i);
  for (const source of [provisioner, profileRunner, employeeReconciliation]) {
    assert.doesNotMatch(source, /"-P",\s*password/);
    assert.match(source, /input: `\$\{password\}\\n/);
  }
});

test("dual-source employee reconciliation uses HMAC, forbids names and fails closed on exact accounting", () => {
  assert.match(employeeReconciliation, /createHmac\("sha256", key\)/);
  assert.match(employeeReconciliation, /key\.length !== 32/);
  assert.match(employeeReconciliation, /nameOnlyMatch: "forbidden"/);
  assert.match(employeeReconciliation, /activePendingManualReview: 115/);
  assert.match(employeeReconciliation, /matchedByEither: 316/);
  assert.match(employeeReconciliation, /productionImport: "HOLD"/);
  assert.match(employeeReconciliation, /secretValuesPrinted: false/);
  assert.doesNotMatch(employeeReconciliation, /vCHName|vMobile|vEmail|vAddress|SELECT \*/);
});

test("dual-source reconciliation rehearsal proves exact load, rollback zero, reload and container cleanup", () => {
  assert.match(reconciliationRehearsal, /loaded !== 115/);
  assert.match(reconciliationRehearsal, /rollbackResidual !== 0/);
  assert.match(reconciliationRehearsal, /reloaded !== 115/);
  assert.match(reconciliationRehearsal, /containerResidual !== 0/);
  assert.match(reconciliationRehearsal, /--env-file/);
  assert.doesNotMatch(reconciliationRehearsal, /"-e", `POSTGRES_PASSWORD/);
  assert.match(reconciliationRehearsal, /personalValuesStored: false/);
  assert.match(reconciliationRehearsal, /productionImport: "HOLD"/);
  assert.doesNotMatch(reconciliationRehearsal, /hr_employee|sys_user|hr_payroll|hr_payslip|biz_user_message/);
});
