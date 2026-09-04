import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildLegacyPayrollItemsPageObservationReceipt,
  LegacyPayrollItemsPageObservationError,
} from "../hr-cutover/legacy-payroll-items-page-observation-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-payroll-items-page-observation-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = (runtimeEvidence = null, evidenceOrigin = "no_windows_instance", selected = contract()) =>
  buildLegacyPayrollItemsPageObservationReceipt({
    contract: selected,
    repositoryRoot: root,
    runtimeEvidence,
    evidenceOrigin,
  });
const rejects = (code, action) =>
  assert.throws(
    action,
    (error) => error instanceof LegacyPayrollItemsPageObservationError && error.code === code,
  );
const liveEvidence = () => ({
  windows: [
    {
      title: "工资核算设置",
      windowType: "main_window",
      controlTypeCounts: [
        { category: "data_grid", count: 1 },
        { category: "formula_editor", count: 1 },
        { category: "select", count: 2 },
      ],
      actionCategoryCounts: [
        { category: "create", count: 1 },
        { category: "edit", count: 1 },
        { category: "save", count: 1 },
        { category: "validate_formula", count: 1 },
      ],
    },
  ],
  screenshotSha256: ["a".repeat(64)],
  observedAt: "2026-09-04T08:00:00Z",
});

test("static navigation and salary rule evidence remain separate from missing Windows observation", () => {
  const receipt = build();
  assert.equal(receipt.staticEvidence.status, "navigation_and_rule_source_bound_only");
  assert.equal(receipt.staticEvidence.entryTitle, "工资核算设置");
  assert.match(receipt.staticEvidence.salaryitemsRuleReceiptContractSha256, /^[a-f0-9]{64}$/u);
  assert.match(receipt.staticEvidence.salaryequalRuleReceiptContractSha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.runtimeEvidence.evidenceOrigin, "no_windows_instance");
  assert.equal(receipt.runtimeEvidence.windowCount, 0);
  assert.equal(receipt.runtimeObservationStatus, "pending");
  assert.equal(receipt.status, "PAYROLL_ITEMS_LIVE_PAGE_OBSERVATION_PENDING");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
});

test("complete live evidence records titles type/action counts and hashes only", () => {
  const receipt = build(liveEvidence(), "live_windows_observation");
  assert.equal(receipt.runtimeObservationStatus, "captured_review_pending");
  assert.equal(receipt.status, "PAYROLL_ITEMS_LIVE_PAGE_CAPTURED_REVIEW_PENDING");
  assert.equal(receipt.runtimeEvidence.windowCount, 1);
  assert.equal(receipt.runtimeEvidence.controlCount, 4);
  assert.equal(receipt.runtimeEvidence.actionCount, 4);
  assert.equal(receipt.runtimeEvidence.screenshotCount, 1);
  assert.equal(receipt.runtimeEvidence.windows[0].title, "工资核算设置");
  assert.match(receipt.runtimeEvidence.windows[0].windowEvidenceSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(receipt.gapCodes, ["PAYROLL_ITEMS_LIVE_PAGE_SEMANTIC_REVIEW_PENDING"]);
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionWritePerformed, false);
});

test("values identities free-form controls and screenshot payloads fail closed", () => {
  const value = liveEvidence();
  value.windows[0].value = "forbidden";
  rejects("PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID", () => build(value, "live_windows_observation"));

  const label = liveEvidence();
  label.windows[0].controlTypeCounts[0].label = "forbidden";
  rejects("PAYROLL_ITEMS_PAGE_CONTROL_COUNTS_INVALID", () => build(label, "live_windows_observation"));

  const invalidType = liveEvidence();
  invalidType.windows[0].controlTypeCounts[0].category = "salary_value";
  rejects("PAYROLL_ITEMS_PAGE_CONTROL_COUNTS_INVALID", () => build(invalidType, "live_windows_observation"));

  const screenshot = liveEvidence();
  screenshot.screenshotSha256 = ["data:image/png;base64,forbidden"];
  rejects("PAYROLL_ITEMS_PAGE_SCREENSHOT_INVALID", () => build(screenshot, "live_windows_observation"));

  const duplicate = liveEvidence();
  duplicate.windows[0].controlTypeCounts.push({ category: "data_grid", count: 1 });
  rejects("PAYROLL_ITEMS_PAGE_CONTROL_COUNTS_INVALID", () => build(duplicate, "live_windows_observation"));
});

test("incomplete live evidence and attempts to attach runtime evidence to pending origin fail closed", () => {
  const incomplete = liveEvidence();
  incomplete.screenshotSha256 = [];
  rejects("PAYROLL_ITEMS_PAGE_LIVE_OBSERVATION_INCOMPLETE", () =>
    build(incomplete, "live_windows_observation"),
  );
  rejects("PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID", () => build(liveEvidence(), "no_windows_instance"));
});

test("source drift and production or credit promotion fail closed", () => {
  const drift = contract();
  drift.sourceBindings.salaryitemsRuleReceipt.sha256 = "0".repeat(64);
  rejects("PAYROLL_ITEMS_PAGE_SOURCE_BINDING_INVALID", () => build(null, "no_windows_instance", drift));

  const promoted = contract();
  promoted.evidencePolicy.compatibilityCredit = 1;
  rejects("PAYROLL_ITEMS_PAGE_CONTRACT_INVALID", () => build(null, "no_windows_instance", promoted));

  const writable = contract();
  writable.productionWrite = "ALLOWED";
  rejects("PAYROLL_ITEMS_PAGE_CONTRACT_INVALID", () => build(null, "no_windows_instance", writable));
});

test("CLI supports safe pending mode and only private absolute observation files", () => {
  const script = resolve(root, "scripts/hr-cutover/legacy-payroll-items-page-observation-receipt.mjs");
  const pending = spawnSync(process.execPath, [script, "--pending"], { encoding: "utf8" });
  assert.equal(pending.status, 0, pending.stderr);
  assert.equal(JSON.parse(pending.stdout).status, "PAYROLL_ITEMS_LIVE_PAGE_OBSERVATION_PENDING");
  assert.equal(pending.stderr, "");

  const temporary = mkdtempSync(join(tmpdir(), "payroll-items-page-observation-"));
  try {
    const input = join(temporary, "observation.json");
    writeFileSync(input, `${JSON.stringify(liveEvidence())}\n`, { mode: 0o600 });
    chmodSync(input, 0o600);
    const live = spawnSync(process.execPath, [script, "--observation-file", input], {
      encoding: "utf8",
    });
    assert.equal(live.status, 0, live.stderr);
    const receipt = JSON.parse(live.stdout);
    assert.equal(receipt.status, "PAYROLL_ITEMS_LIVE_PAGE_CAPTURED_REVIEW_PENDING");
    assert.equal(receipt.screenshotBinaryIncluded, false);
    assert.equal(receipt.payrollValuesIncluded, false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("serialized receipts contain no payroll values people credentials image payloads or file paths", () => {
  for (const receipt of [build(), build(liveEvidence(), "live_windows_observation")]) {
    const serialized = JSON.stringify(receipt);
    assert.doesNotMatch(
      serialized,
      /"(?:value|salary|amount|employee|personId|username|userId|password|credential|imagePath|imageBinary|base64)"\s*:|\/Users\/|Downloads\//iu,
    );
    assert.equal(receipt.controlValuesIncluded, false);
    assert.equal(receipt.payrollValuesIncluded, false);
    assert.equal(receipt.personDataIncluded, false);
    assert.equal(receipt.credentialsIncluded, false);
    assert.equal(receipt.screenshotBinaryIncluded, false);
  }
});
