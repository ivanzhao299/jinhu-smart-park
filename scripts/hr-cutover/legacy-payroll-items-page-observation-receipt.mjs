#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const SOURCE_PATHS = Object.freeze({
  atomicInventory: "scripts/hr-cutover/contracts/legacy-client-live-traversal-atomic-v1.json",
  familyTraversal: "scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json",
  salaryitemsRuleReceipt:
    "scripts/hr-cutover/contracts/legacy-payroll-salaryitems-primary-rule-source-receipt-v1.json",
  salaryequalRuleReceipt:
    "scripts/hr-cutover/contracts/legacy-payroll-salaryequal-rule-relation-source-receipt-v1.json",
});
const SOURCE_HASHES = Object.freeze({
  atomicInventory: "ee3adb30d145afc33f845e290f5acfa390beb85c1ed913ead1dd2c8d136da4b5",
  familyTraversal: "e3c01e1f772f629a351d885a935af63b83ddba5edf29b2d07fcf41810410bc54",
  salaryitemsRuleReceipt: "975dbd978a30979e03054daa3764b6c28bec558b6f810780aa334ce649153b78",
  salaryequalRuleReceipt: "45e323088d6e6b50ca091cea9f331b3e59c662ebf25454bfed6df6ab8e043846",
});
const WINDOW_TYPES = ["main_window", "dialog", "tab_page", "unknown"];
const CONTROL_TYPES = [
  "data_grid",
  "text_input",
  "numeric_input",
  "select",
  "checkbox",
  "formula_editor",
  "tab",
  "read_only_text",
  "unknown",
];
const ACTION_CATEGORIES = [
  "create",
  "edit",
  "delete",
  "save",
  "cancel",
  "reorder",
  "validate_formula",
  "lookup",
  "close",
  "unknown",
];

export class LegacyPayrollItemsPageObservationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPayrollItemsPageObservationError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyPayrollItemsPageObservationError(code, detail);
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected, code, label) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...expected].sort())) fail(code, label);
};
const safeTitle = (value, label) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 80 ||
    /[\r\n\t@=]|:\/\/|\d{6,}/u.test(value)
  ) {
    fail("PAYROLL_ITEMS_PAGE_TITLE_INVALID", label);
  }
};

function readBinding(repositoryRoot, binding, key) {
  if (
    !object(binding) ||
    binding.path !== SOURCE_PATHS[key] ||
    binding.sha256 !== SOURCE_HASHES[key]
  ) {
    fail("PAYROLL_ITEMS_PAGE_SOURCE_BINDING_INVALID", key);
  }
  const bytes = readFileSync(resolve(repositoryRoot, binding.path));
  if (digest(bytes) !== binding.sha256) fail("PAYROLL_ITEMS_PAGE_SOURCE_DRIFT", key);
  return JSON.parse(bytes.toString("utf8"));
}

function validateContract(contract, repositoryRoot) {
  if (
    !object(contract) ||
    contract.formatVersion !== 1 ||
    contract.contractKind !== "yuzhou_hr_legacy_payroll_items_page_observation" ||
    contract.surface !== "desktop_client" ||
    contract.pageIntent !== "payroll_items_and_formulas" ||
    !same(contract.atomicEntry, {
      atomicId: "client.payroll.001",
      familyId: "payroll",
      entryPoint: "工资核算设置",
      pageCheck: "payroll-items-and-formulas",
    }) ||
    !same(contract.allowedWindowTypes, WINDOW_TYPES) ||
    !same(contract.allowedControlTypes, CONTROL_TYPES) ||
    !same(contract.allowedActionCategories, ACTION_CATEGORIES) ||
    !same(contract.evidencePolicy, {
      staticEvidenceStatus: "navigation_and_rule_source_bound_only",
      runtimeEvidenceStatusWithoutWindowsInstance: "pending",
      runtimeEvidenceStatusAfterCapture: "review_pending",
      screenEvidence: "sha256_only_no_path_or_binary",
      controlValues: "FORBIDDEN",
      payrollValues: "FORBIDDEN",
      personData: "FORBIDDEN",
      credentials: "FORBIDDEN",
      compatibilityCredit: 0,
    }) ||
    contract.productionWrite !== "FORBIDDEN" ||
    contract.productionImport !== "HOLD"
  ) {
    fail("PAYROLL_ITEMS_PAGE_CONTRACT_INVALID", "identity or safety boundary");
  }

  const sources = Object.fromEntries(
    Object.entries(contract.sourceBindings ?? {}).map(([key, binding]) => [
      key,
      readBinding(repositoryRoot, binding, key),
    ]),
  );
  if (!same(Object.keys(sources).sort(), Object.keys(SOURCE_PATHS).sort())) {
    fail("PAYROLL_ITEMS_PAGE_SOURCE_BINDING_INVALID", "coverage");
  }
  const atomic = sources.atomicInventory.entries?.find(
    (entry) => entry.atomicId === contract.atomicEntry.atomicId,
  );
  if (
    !atomic ||
    atomic.familyId !== "payroll" ||
    atomic.entryPoint !== "工资核算设置" ||
    atomic.surface !== "desktop_client" ||
    atomic.observationStatus !== "pending" ||
    atomic.gapReasonCode !== "ATOMIC_RUNTIME_OBSERVATION_PENDING"
  ) {
    fail("PAYROLL_ITEMS_PAGE_STATIC_ENTRY_INVALID", "atomic entry");
  }
  const family = sources.familyTraversal.menuFamilies?.find((item) => item.id === "payroll");
  if (
    !family ||
    !family.entryPoints?.includes("工资核算设置") ||
    !family.pageChecks?.includes("payroll-items-and-formulas") ||
    family.decision !== "preserve"
  ) {
    fail("PAYROLL_ITEMS_PAGE_STATIC_ENTRY_INVALID", "family traversal");
  }
  if (
    sources.salaryitemsRuleReceipt.contractKind !==
      "yuzhou_hr_payroll_salaryitems_primary_rule_source_receipt" ||
    sources.salaryitemsRuleReceipt.productionImport !== "HOLD" ||
    sources.salaryequalRuleReceipt.contractKind !==
      "yuzhou_hr_payroll_salaryequal_rule_relation_source_receipt" ||
    sources.salaryequalRuleReceipt.productionImport !== "HOLD"
  ) {
    fail("PAYROLL_ITEMS_PAGE_RULE_SOURCE_INVALID", "salary rule contracts");
  }
}

function validateCountRows(rows, allowed, code, label) {
  if (!Array.isArray(rows) || rows.length === 0) fail(code, `${label}:empty`);
  const seen = new Set();
  for (const row of rows) {
    exactKeys(row, ["category", "count"], code, `${label}:row`);
    if (
      !allowed.includes(row.category) ||
      seen.has(row.category) ||
      !Number.isSafeInteger(row.count) ||
      row.count < 0
    ) {
      fail(code, `${label}:value`);
    }
    seen.add(row.category);
  }
  return rows.reduce((sum, row) => sum + row.count, 0);
}

function pendingRuntimeEvidence() {
  return {
    windows: [],
    screenshotSha256: [],
    observedAt: null,
  };
}

function validateRuntimeEvidence(evidence, evidenceOrigin, contract) {
  exactKeys(
    evidence,
    ["windows", "screenshotSha256", "observedAt"],
    "PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID",
    "runtime evidence",
  );
  if (!Array.isArray(evidence.windows) || !Array.isArray(evidence.screenshotSha256)) {
    fail("PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID", "runtime collections");
  }
  const windowHashes = new Set();
  const windows = evidence.windows.map((window) => {
    exactKeys(
      window,
      ["title", "windowType", "controlTypeCounts", "actionCategoryCounts"],
      "PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID",
      "window",
    );
    safeTitle(window.title, "window title");
    if (!contract.allowedWindowTypes.includes(window.windowType)) {
      fail("PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID", "window type");
    }
    const controlCount = validateCountRows(
      window.controlTypeCounts,
      contract.allowedControlTypes,
      "PAYROLL_ITEMS_PAGE_CONTROL_COUNTS_INVALID",
      "control counts",
    );
    const actionCount = validateCountRows(
      window.actionCategoryCounts,
      contract.allowedActionCategories,
      "PAYROLL_ITEMS_PAGE_ACTION_COUNTS_INVALID",
      "action counts",
    );
    const titleSha256 = digest(canonical({ title: window.title, windowType: window.windowType }));
    if (windowHashes.has(titleSha256)) {
      fail("PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID", "duplicate window identity");
    }
    windowHashes.add(titleSha256);
    return {
      title: window.title,
      windowType: window.windowType,
      titleSha256,
      controlTypeCounts: structuredClone(window.controlTypeCounts),
      controlCount,
      actionCategoryCounts: structuredClone(window.actionCategoryCounts),
      actionCount,
      windowEvidenceSha256: digest(canonical(window)),
    };
  });
  if (evidence.screenshotSha256.some((hash) => !SHA256.test(hash)) || new Set(evidence.screenshotSha256).size !== evidence.screenshotSha256.length) {
    fail("PAYROLL_ITEMS_PAGE_SCREENSHOT_INVALID", "hash-only screenshot evidence");
  }
  if (
    !(evidence.observedAt === null || (typeof evidence.observedAt === "string" && ISO_INSTANT.test(evidence.observedAt) && Number.isFinite(Date.parse(evidence.observedAt))))
  ) {
    fail("PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID", "observation time");
  }
  const completeLive =
    evidenceOrigin === "live_windows_observation" &&
    windows.length > 0 &&
    evidence.screenshotSha256.length > 0 &&
    evidence.observedAt !== null;
  if (evidenceOrigin === "live_windows_observation" && !completeLive) {
    fail("PAYROLL_ITEMS_PAGE_LIVE_OBSERVATION_INCOMPLETE", "window screenshot and time required");
  }
  if (
    evidenceOrigin === "no_windows_instance" &&
    (windows.length !== 0 || evidence.screenshotSha256.length !== 0 || evidence.observedAt !== null)
  ) {
    fail("PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID", "pending origin cannot carry runtime evidence");
  }
  return {
    windows,
    screenshotSha256: [...evidence.screenshotSha256],
    observedAt: evidence.observedAt,
    completeLive,
  };
}

export function buildLegacyPayrollItemsPageObservationReceipt({
  contract,
  repositoryRoot,
  evidenceOrigin = "no_windows_instance",
  runtimeEvidence = null,
}) {
  validateContract(contract, repositoryRoot);
  if (!["no_windows_instance", "live_windows_observation"].includes(evidenceOrigin)) {
    fail("PAYROLL_ITEMS_PAGE_OBSERVATION_INVALID", "evidence origin");
  }
  const runtime = validateRuntimeEvidence(runtimeEvidence ?? pendingRuntimeEvidence(), evidenceOrigin, contract);
  const staticEvidence = {
    status: "navigation_and_rule_source_bound_only",
    entryTitle: contract.atomicEntry.entryPoint,
    atomicInventorySha256: contract.sourceBindings.atomicInventory.sha256,
    familyTraversalSha256: contract.sourceBindings.familyTraversal.sha256,
    salaryitemsRuleReceiptContractSha256: contract.sourceBindings.salaryitemsRuleReceipt.sha256,
    salaryequalRuleReceiptContractSha256: contract.sourceBindings.salaryequalRuleReceipt.sha256,
    staticEvidenceSha256: digest(
      canonical({ atomicEntry: contract.atomicEntry, sourceBindings: contract.sourceBindings }),
    ),
  };
  const runtimeBody = {
    evidenceOrigin,
    windows: runtime.windows,
    windowCount: runtime.windows.length,
    controlCount: runtime.windows.reduce((sum, window) => sum + window.controlCount, 0),
    actionCount: runtime.windows.reduce((sum, window) => sum + window.actionCount, 0),
    screenshotSha256: runtime.screenshotSha256,
    screenshotCount: runtime.screenshotSha256.length,
    observedAt: runtime.observedAt,
  };
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_payroll_items_page_observation_receipt",
    surface: "desktop_client",
    pageIntent: contract.pageIntent,
    staticEvidence,
    runtimeEvidence: {
      ...runtimeBody,
      runtimeEvidenceSha256: digest(canonical(runtimeBody)),
    },
    runtimeObservationStatus: runtime.completeLive ? "captured_review_pending" : "pending",
    status: runtime.completeLive
      ? "PAYROLL_ITEMS_LIVE_PAGE_CAPTURED_REVIEW_PENDING"
      : "PAYROLL_ITEMS_LIVE_PAGE_OBSERVATION_PENDING",
    gapCodes: runtime.completeLive
      ? ["PAYROLL_ITEMS_LIVE_PAGE_SEMANTIC_REVIEW_PENDING"]
      : ["PAYROLL_ITEMS_WINDOWS_INSTANCE_OBSERVATION_MISSING"],
    controlValuesIncluded: false,
    payrollValuesIncluded: false,
    personDataIncluded: false,
    credentialsIncluded: false,
    screenshotBinaryIncluded: false,
    productionWritePerformed: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

function readPrivateObservation(path) {
  if (!isAbsolute(path ?? "") || resolve(path) !== path) {
    fail("PAYROLL_ITEMS_PAGE_OBSERVATION_FILE_UNSAFE", "absolute path required");
  }
  let link;
  let stat;
  try {
    link = lstatSync(path);
    stat = statSync(path);
  } catch {
    fail("PAYROLL_ITEMS_PAGE_OBSERVATION_FILE_UNSAFE", "missing file");
  }
  if (link.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) {
    fail("PAYROLL_ITEMS_PAGE_OBSERVATION_FILE_UNSAFE", "0600 regular file required");
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("PAYROLL_ITEMS_PAGE_OBSERVATION_FILE_INVALID", "invalid JSON");
  }
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-payroll-items-page-observation-v1.json"),
      "utf8",
    ),
  );
  let receipt;
  if (process.argv.length === 3 && process.argv[2] === "--pending") {
    receipt = buildLegacyPayrollItemsPageObservationReceipt({ contract, repositoryRoot });
  } else if (process.argv.length === 4 && process.argv[2] === "--observation-file") {
    receipt = buildLegacyPayrollItemsPageObservationReceipt({
      contract,
      repositoryRoot,
      evidenceOrigin: "live_windows_observation",
      runtimeEvidence: readPrivateObservation(process.argv[3]),
    });
  } else {
    fail("PAYROLL_ITEMS_PAGE_ARGUMENT_INVALID", "use --pending or --observation-file ABSOLUTE_PATH");
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof LegacyPayrollItemsPageObservationError ? error.code : "PAYROLL_ITEMS_PAGE_UNEXPECTED"}\n`,
    );
    process.exitCode = 1;
  }
}
