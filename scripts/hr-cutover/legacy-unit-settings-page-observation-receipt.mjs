#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9.-]{2,95}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const EXPECTED_PATHS = {
  atomicInventory: "scripts/hr-cutover/contracts/legacy-client-live-traversal-atomic-v1.json",
  companyRootFieldReceipt: "scripts/hr-cutover/contracts/legacy-company-root-field-receipt-v1.json",
};
const EXPECTED_GAPS = [
  ["company.addr", "COMPANY_ADDR_UNIT_SETTINGS_PAGE_SEMANTICS_UNCONFIRMED"],
  ["company.email", "COMPANY_EMAIL_UNIT_SETTINGS_PAGE_SEMANTICS_UNCONFIRMED"],
  ["company.master", "COMPANY_MASTER_UNIT_SETTINGS_PAGE_SEMANTICS_UNCONFIRMED_NO_GUESS"],
];
const EXPECTED_SAFE_STORAGE = new Map([
  ["company.addr", "sys_org.contact_address"],
  ["company.email", "sys_org.contact_email"],
  ["company.master", "sys_org.legacy_company_manager_reference"],
]);
const CONTROL_TYPES = ["text_input", "numeric_input", "select", "checkbox", "radio_group", "date_input", "read_only_text", "unknown"];
const BUTTON_ACTIONS = ["save", "cancel", "close", "edit", "reset", "lookup", "unknown"];
const VISIBILITY_CONDITIONS = ["always", "role_gated", "state_dependent", "unknown"];
const ROLES = ["system_admin", "hr_admin", "hr_operator", "read_only_reviewer", "unknown"];

export class LegacyUnitSettingsPageObservationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyUnitSettingsPageObservationError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyUnitSettingsPageObservationError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, expected, code, label) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...expected].sort())) fail(code, label);
};
const safeLabel = (value, label) => {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 80
    || /[\r\n\t@=]|:\/\/|\d{6,}/u.test(value)) {
    fail("UNIT_SETTINGS_OBSERVATION_LABEL_INVALID", label);
  }
};

function readBinding(repositoryRoot, binding, key) {
  if (!object(binding) || binding.path !== EXPECTED_PATHS[key] || !SHA256.test(binding.sha256 ?? "")) {
    fail("UNIT_SETTINGS_SOURCE_BINDING_INVALID", key);
  }
  const bytes = readFileSync(resolve(repositoryRoot, binding.path));
  if (digest(bytes) !== binding.sha256) fail("UNIT_SETTINGS_SOURCE_EVIDENCE_DRIFT", key);
  return JSON.parse(bytes.toString("utf8"));
}

function validateContract(contract, repositoryRoot) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_unit_settings_page_observation"
    || contract.surface !== "desktop_client"
    || !same(contract.atomicEntry, { atomicId: "client.organization_job.001", familyId: "organization_job", entryPoint: "单位设置" })
    || !same(contract.stableIdentityPolicy, {
      windowIdPrefix: "unit-settings.window.",
      controlIdPrefix: "unit-settings.control.",
      buttonIdPrefix: "unit-settings.button.",
    })
    || !same(contract.allowedControlTypes, CONTROL_TYPES)
    || !same(contract.allowedButtonActions, BUTTON_ACTIONS)
    || !same(contract.allowedVisibilityConditions, VISIBILITY_CONDITIONS)
    || !same(contract.allowedRoles, ROLES)
    || !same(contract.evidencePolicy, {
      screenshotStorage: "sha256_only_no_path_or_binary",
      controlValues: "FORBIDDEN",
      userIdentity: "FORBIDDEN",
      personalData: "FORBIDDEN",
      credentials: "FORBIDDEN",
      missingLiveObservationStatus: "pending",
      liveObservationReviewStatus: "review_pending",
      compatibilityCredit: 0,
    })
    || contract.productionImport !== "HOLD") {
    fail("UNIT_SETTINGS_CONTRACT_INVALID", "identity or safety policy");
  }
  if (!Array.isArray(contract.semanticConfirmationGaps)
    || !same(contract.semanticConfirmationGaps.map(gap => [gap.sourceColumn, gap.gapCode]), EXPECTED_GAPS)
    || contract.semanticConfirmationGaps.some(gap => !same(Object.keys(gap).sort(), ["sourceColumn", "gapCode", "authoritativeMeaning", "compatibilityCredit"].sort())
      || gap.authoritativeMeaning !== null || gap.compatibilityCredit !== 0)) {
    fail("UNIT_SETTINGS_SEMANTIC_GAP_INVALID", "addr email master gaps");
  }
  const atomic = readBinding(repositoryRoot, contract.sourceBindings?.atomicInventory, "atomicInventory");
  const entry = atomic.entries?.find(row => row.atomicId === contract.atomicEntry.atomicId);
  if (!entry || entry.familyId !== "organization_job" || entry.entryPoint !== "单位设置" || entry.surface !== "desktop_client"
    || entry.observationStatus !== "pending" || entry.gapReasonCode !== "ATOMIC_RUNTIME_OBSERVATION_PENDING") {
    fail("UNIT_SETTINGS_ATOMIC_SOURCE_INVALID", "unit settings entry");
  }
  const company = readBinding(repositoryRoot, contract.sourceBindings?.companyRootFieldReceipt, "companyRootFieldReceipt");
  if (company.contractKind !== "yuzhou_hr_legacy_company_root_field_receipt" || company.productionImport !== "HOLD") {
    fail("UNIT_SETTINGS_COMPANY_SOURCE_INVALID", "company root receipt");
  }
  const companyGaps = new Map(company.explicitGaps?.map(gap => [`company.${gap.sourceColumn}`, gap]));
  for (const [sourceColumn] of EXPECTED_GAPS) {
    if (!companyGaps.has(sourceColumn)
      || companyGaps.get(sourceColumn).authoritativeModernTarget !== EXPECTED_SAFE_STORAGE.get(sourceColumn)) {
      fail("UNIT_SETTINGS_COMPANY_SOURCE_INVALID", sourceColumn);
    }
  }
}

function validateStableId(value, prefix, label) {
  if (typeof value !== "string" || !value.startsWith(prefix) || !SAFE_ID.test(value)) {
    fail("UNIT_SETTINGS_STABLE_ID_INVALID", label);
  }
}

function validateObservation(observation, contract) {
  exactKeys(observation, ["navigationSource", "window", "controls", "buttons", "observedRole", "screenshots", "observedAt", "semanticGapObservations"], "UNIT_SETTINGS_OBSERVATION_INVALID", "observation shape");
  exactKeys(observation.navigationSource, ["surface", "atomicId", "familyId", "entryPoint", "navigationKind"], "UNIT_SETTINGS_OBSERVATION_INVALID", "navigation source");
  if (!same(observation.navigationSource, {
    surface: "desktop_client",
    atomicId: "client.organization_job.001",
    familyId: "organization_job",
    entryPoint: "单位设置",
    navigationKind: "legacy_menu_entry",
  })) fail("UNIT_SETTINGS_NAVIGATION_INVALID", "navigation source");

  if (observation.window !== null) {
    exactKeys(observation.window, ["stableId", "titleLabel", "windowType", "modal"], "UNIT_SETTINGS_OBSERVATION_INVALID", "window shape");
    validateStableId(observation.window.stableId, contract.stableIdentityPolicy.windowIdPrefix, "window");
    safeLabel(observation.window.titleLabel, "window title");
    if (!["main_window", "dialog", "tab_page", "unknown"].includes(observation.window.windowType) || typeof observation.window.modal !== "boolean") {
      fail("UNIT_SETTINGS_OBSERVATION_INVALID", "window metadata");
    }
  }

  if (!Array.isArray(observation.controls) || !Array.isArray(observation.buttons) || !Array.isArray(observation.screenshots)
    || !Array.isArray(observation.semanticGapObservations)) fail("UNIT_SETTINGS_OBSERVATION_INVALID", "collection shape");
  const ids = new Set();
  for (const control of observation.controls) {
    exactKeys(control, ["stableId", "parentWindowStableId", "fieldLabel", "controlType", "required", "readOnly", "visibilityCondition"], "UNIT_SETTINGS_OBSERVATION_INVALID", "control shape");
    validateStableId(control.stableId, contract.stableIdentityPolicy.controlIdPrefix, "control");
    if (ids.has(control.stableId)) fail("UNIT_SETTINGS_STABLE_ID_INVALID", "duplicate control");
    ids.add(control.stableId);
    if (observation.window === null || control.parentWindowStableId !== observation.window.stableId) fail("UNIT_SETTINGS_OBSERVATION_INVALID", "control parent");
    safeLabel(control.fieldLabel, "field label");
    if (!contract.allowedControlTypes.includes(control.controlType)
      || typeof control.required !== "boolean"
      || typeof control.readOnly !== "boolean"
      || !contract.allowedVisibilityConditions.includes(control.visibilityCondition)) {
      fail("UNIT_SETTINGS_OBSERVATION_INVALID", "control metadata");
    }
  }
  for (const button of observation.buttons) {
    exactKeys(button, ["stableId", "parentWindowStableId", "buttonLabel", "action", "visibilityCondition"], "UNIT_SETTINGS_OBSERVATION_INVALID", "button shape");
    validateStableId(button.stableId, contract.stableIdentityPolicy.buttonIdPrefix, "button");
    if (ids.has(button.stableId)) fail("UNIT_SETTINGS_STABLE_ID_INVALID", "duplicate button");
    ids.add(button.stableId);
    if (observation.window === null || button.parentWindowStableId !== observation.window.stableId) fail("UNIT_SETTINGS_OBSERVATION_INVALID", "button parent");
    safeLabel(button.buttonLabel, "button label");
    if (!contract.allowedButtonActions.includes(button.action)
      || !contract.allowedVisibilityConditions.includes(button.visibilityCondition)) {
      fail("UNIT_SETTINGS_OBSERVATION_INVALID", "button metadata");
    }
  }
  if (!contract.allowedRoles.includes(observation.observedRole)) fail("UNIT_SETTINGS_OBSERVATION_INVALID", "role");
  for (const screenshot of observation.screenshots) {
    exactKeys(screenshot, ["sha256", "windowStableId", "captureKind"], "UNIT_SETTINGS_OBSERVATION_INVALID", "screenshot shape");
    if (!SHA256.test(screenshot.sha256 ?? "") || observation.window === null || screenshot.windowStableId !== observation.window.stableId
      || !["full_window", "control_region"].includes(screenshot.captureKind)) {
      fail("UNIT_SETTINGS_SCREENSHOT_INVALID", "hash-only screenshot evidence");
    }
  }
  if (!(observation.observedAt === null || (typeof observation.observedAt === "string" && ISO_INSTANT.test(observation.observedAt)
    && Number.isFinite(Date.parse(observation.observedAt))))) fail("UNIT_SETTINGS_OBSERVATION_INVALID", "observation time");
  if (observation.observedAt !== null && observation.window === null) fail("UNIT_SETTINGS_OBSERVATION_INVALID", "time without window");

  if (observation.semanticGapObservations.length !== 3
    || !same(observation.semanticGapObservations.map(row => row.sourceColumn), EXPECTED_GAPS.map(row => row[0]))) {
    fail("UNIT_SETTINGS_SEMANTIC_GAP_INVALID", "observation coverage");
  }
  for (const gap of observation.semanticGapObservations) {
    exactKeys(gap, ["sourceColumn", "pageControlStableId", "pageLabelObserved", "semanticStatus", "authoritativeMeaning"], "UNIT_SETTINGS_SEMANTIC_GAP_INVALID", gap?.sourceColumn);
    if (gap.authoritativeMeaning !== null || gap.semanticStatus !== "pending_authoritative_confirmation") {
      fail("UNIT_SETTINGS_SEMANTIC_GAP_INVALID", gap.sourceColumn);
    }
    if (gap.pageControlStableId === null) {
      if (gap.pageLabelObserved !== null) fail("UNIT_SETTINGS_SEMANTIC_GAP_INVALID", `${gap.sourceColumn}:label without control`);
    } else {
      if (!ids.has(gap.pageControlStableId) || typeof gap.pageLabelObserved !== "string") fail("UNIT_SETTINGS_SEMANTIC_GAP_INVALID", `${gap.sourceColumn}:control binding`);
      safeLabel(gap.pageLabelObserved, `${gap.sourceColumn}:page label`);
      const control = observation.controls.find(row => row.stableId === gap.pageControlStableId);
      if (control?.fieldLabel !== gap.pageLabelObserved) fail("UNIT_SETTINGS_SEMANTIC_GAP_INVALID", `${gap.sourceColumn}:label drift`);
    }
  }
  return structuredClone(observation);
}

const pendingObservation = () => ({
  navigationSource: {
    surface: "desktop_client",
    atomicId: "client.organization_job.001",
    familyId: "organization_job",
    entryPoint: "单位设置",
    navigationKind: "legacy_menu_entry",
  },
  window: null,
  controls: [],
  buttons: [],
  observedRole: "unknown",
  screenshots: [],
  observedAt: null,
  semanticGapObservations: EXPECTED_GAPS.map(([sourceColumn]) => ({
    sourceColumn,
    pageControlStableId: null,
    pageLabelObserved: null,
    semanticStatus: "pending_authoritative_confirmation",
    authoritativeMeaning: null,
  })),
});

export function buildLegacyUnitSettingsPageObservationReceipt({ contract, repositoryRoot, observation = null, evidenceOrigin = "no_live_observation" }) {
  validateContract(contract, repositoryRoot);
  if (!['no_live_observation', 'live_desktop_observation'].includes(evidenceOrigin)) fail("UNIT_SETTINGS_OBSERVATION_INVALID", "evidence origin");
  const safeObservation = validateObservation(observation ?? pendingObservation(), contract);
  const completeLive = evidenceOrigin === "live_desktop_observation"
    && safeObservation.window !== null
    && safeObservation.controls.length > 0
    && safeObservation.buttons.length > 0
    && safeObservation.observedRole !== "unknown"
    && safeObservation.screenshots.length > 0
    && safeObservation.observedAt !== null;
  if (evidenceOrigin === "live_desktop_observation" && !completeLive) fail("UNIT_SETTINGS_LIVE_OBSERVATION_INCOMPLETE", "window controls buttons role screenshot and time required");
  if (evidenceOrigin === "no_live_observation" && observation !== null) fail("UNIT_SETTINGS_OBSERVATION_INVALID", "non-live origin cannot carry observation");
  const semanticGaps = contract.semanticConfirmationGaps.map((gap, index) => ({
    ...gap,
    ...safeObservation.semanticGapObservations[index],
  }));
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_unit_settings_page_observation_receipt",
    surface: "desktop_client",
    atomicEntry: structuredClone(contract.atomicEntry),
    sourceBinding: {
      atomicInventorySha256: contract.sourceBindings.atomicInventory.sha256,
      companyRootFieldReceiptContractSha256: contract.sourceBindings.companyRootFieldReceipt.sha256,
    },
    evidenceOrigin,
    navigationSource: safeObservation.navigationSource,
    windowIdentity: safeObservation.window,
    controls: safeObservation.controls,
    buttons: safeObservation.buttons,
    observedRole: safeObservation.observedRole,
    screenshotEvidence: safeObservation.screenshots,
    observedAt: safeObservation.observedAt,
    semanticConfirmationGaps: semanticGaps,
    observationStatus: completeLive ? "captured_review_pending" : "pending",
    reviewStatus: "review_pending",
    status: completeLive ? "LIVE_PAGE_OBSERVATION_CAPTURED_REVIEW_PENDING" : "LIVE_PAGE_OBSERVATION_PENDING",
    gapCodes: [
      ...(completeLive ? [] : ["UNIT_SETTINGS_LIVE_PAGE_OBSERVATION_MISSING"]),
      ...semanticGaps.map(gap => gap.gapCode),
    ],
    controlValuesIncluded: false,
    userIdentityIncluded: false,
    personalDataIncluded: false,
    credentialsIncluded: false,
    screenshotBinaryIncluded: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

function readContract(repositoryRoot) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-unit-settings-page-observation-v1.json"), "utf8"));
}

function readPrivateObservation(path) {
  if (!isAbsolute(path ?? "") || resolve(path) !== path) fail("UNIT_SETTINGS_OBSERVATION_FILE_UNSAFE", "absolute path required");
  let link;
  let stat;
  try {
    link = lstatSync(path);
    stat = statSync(path);
  } catch {
    fail("UNIT_SETTINGS_OBSERVATION_FILE_UNSAFE", "missing file");
  }
  if (link.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) {
    fail("UNIT_SETTINGS_OBSERVATION_FILE_UNSAFE", "0600 regular file required");
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("UNIT_SETTINGS_OBSERVATION_FILE_INVALID", "invalid JSON");
  }
}

function main(argv) {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = readContract(repositoryRoot);
  if (argv.length === 1 && argv[0] === "--pending") {
    process.stdout.write(canonical(buildLegacyUnitSettingsPageObservationReceipt({ contract, repositoryRoot })));
    return;
  }
  if (argv.length === 2 && argv[0] === "--observation-file") {
    process.stdout.write(canonical(buildLegacyUnitSettingsPageObservationReceipt({
      contract,
      repositoryRoot,
      observation: readPrivateObservation(argv[1]),
      evidenceOrigin: "live_desktop_observation",
    })));
    return;
  }
  fail("UNIT_SETTINGS_ARGUMENT_INVALID", "use --pending or --observation-file <absolute-0600-json>");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.code ?? "UNIT_SETTINGS_OBSERVATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
