export class LegacyDualSourceReconciliationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyDualSourceReconciliationError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyDualSourceReconciliationError(code, detail); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys, label) => {
  if (!object(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("DUAL_SOURCE_SHAPE_INVALID", label);
};
const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

const EXPECTED_KEY_COUNTS = {
  Emp_tBasicInfo: 548, Emp_tExperiences: 944, Emp_tFamily: 643, Emp_tContract: 233,
  Emp_tDimission: 28, Emp_Punish_tApplay: 8, Att_tAttend: 930, Com_tTimeWage: 19408,
  Com_tPricesalary: 87, Com_tDeductSalary: 26, Per_tGuideline: 131, Per_tAssessTemplate: 23,
  Tra_TraPlan_tPlan: 25, Tra_tEmployeeCourse: 38, Rec_tResumeBasic: 5,
  Sys_tOperation: 9528, Sys_tLogin: 716
};

export function verifyLegacyDualSourceReconciliation(contract) {
  exact(contract, ["formatVersion", "contractKind", "status", "sources", "groupWebCatalogRollup", "groupWebKeyTableCounts", "reconciliation", "identityPolicy", "migrationPolicy"], "root");
  if (contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_legacy_dual_source_reconciliation" || contract.status !== "reviewed_read_only_baseline") fail("DUAL_SOURCE_IDENTITY_INVALID", "root");
  const serialized = JSON.stringify(contract);
  if (/(?:\/Users\/|Downloads\/|file:\/\/|(?:pass(?:word)?|token|secret)\s*[=:]|(?:^|[^0-9])(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.))/i.test(serialized)) fail("DUAL_SOURCE_SENSITIVE_CONTENT", "root");

  exact(contract.sources, ["desktopClient", "groupWeb"], "sources");
  const desktop = contract.sources.desktopClient;
  exact(desktop, ["sourceId", "systemSurface", "databaseRole", "catalog", "employees"], "sources.desktopClient");
  exact(desktop.catalog, ["tables", "fields", "rules", "helpTopics", "authorizationRows"], "sources.desktopClient.catalog");
  if (desktop.sourceId !== "yuzhou_desktop_client_salary" || desktop.systemSurface !== "windows_desktop_client" || desktop.databaseRole !== "client_and_payroll_history" || desktop.employees !== 2949 || JSON.stringify(desktop.catalog) !== JSON.stringify({ tables: 162, fields: 2364, rules: 212, helpTopics: 46, authorizationRows: 915 })) fail("DESKTOP_SOURCE_BASELINE_INVALID", "sources.desktopClient");

  const web = contract.sources.groupWeb;
  exact(web, ["sourceId", "systemSurface", "databaseRole", "catalog", "employees"], "sources.groupWeb");
  exact(web.catalog, ["tables", "fields", "nonemptyTables", "rows", "views", "procedures", "functions", "triggers", "schemaHash", "tableRowCountHash"], "sources.groupWeb.catalog");
  exact(web.employees, ["all", "activeCandidates", "snapshotHash"], "sources.groupWeb.employees");
  if (web.sourceId !== "yuzhou_group_web_enterprise_hr" || web.systemSurface !== "classic_asp_group_web" || web.databaseRole !== "enterprise_hr_operations" || web.catalog.tables !== 438 || web.catalog.fields !== 5449 || web.catalog.nonemptyTables !== 215 || web.catalog.rows !== 320406 || web.catalog.views !== 768 || web.catalog.procedures !== 340 || web.catalog.functions !== 9 || web.catalog.triggers !== 79 || !sha(web.catalog.schemaHash) || !sha(web.catalog.tableRowCountHash) || web.employees.all !== 548 || web.employees.activeCandidates !== 134 || !sha(web.employees.snapshotHash)) fail("GROUP_WEB_SOURCE_BASELINE_INVALID", "sources.groupWeb");

  if (!Array.isArray(contract.groupWebCatalogRollup) || contract.groupWebCatalogRollup.length !== 14) fail("GROUP_WEB_ROLLUP_INVALID", "groupWebCatalogRollup");
  const prefixes = new Set();
  let tables = 0;
  let rows = 0;
  for (const item of contract.groupWebCatalogRollup) {
    exact(item, ["prefix", "tables", "rows"], `groupWebCatalogRollup.${item?.prefix}`);
    if (typeof item.prefix !== "string" || !/^[a-z]+$/.test(item.prefix) || prefixes.has(item.prefix) || !Number.isInteger(item.tables) || item.tables < 0 || !Number.isInteger(item.rows) || item.rows < 0) fail("GROUP_WEB_ROLLUP_INVALID", String(item?.prefix));
    prefixes.add(item.prefix);
    tables += item.tables;
    rows += item.rows;
  }
  if (tables !== web.catalog.tables || rows !== web.catalog.rows || !prefixes.has("other")) fail("GROUP_WEB_ROLLUP_INVALID", `${tables}/${rows}`);
  if (JSON.stringify(contract.groupWebKeyTableCounts) !== JSON.stringify(EXPECTED_KEY_COUNTS)) fail("GROUP_WEB_KEY_COUNTS_INVALID", "groupWebKeyTableCounts");

  const reconciliation = contract.reconciliation;
  exact(reconciliation, ["allGroupWeb", "activeGroupWeb", "evidenceHash"], "reconciliation");
  exact(reconciliation.allGroupWeb, ["matchedByEmployeeCode", "matchedByIdentityHash", "matchedByEither", "unmatched"], "reconciliation.allGroupWeb");
  exact(reconciliation.activeGroupWeb, ["matchedByCodeOrIdentityHash", "uniqueToGroupWeb", "disposition"], "reconciliation.activeGroupWeb");
  const all = reconciliation.allGroupWeb;
  const active = reconciliation.activeGroupWeb;
  if (all.matchedByEmployeeCode !== 313 || all.matchedByIdentityHash !== 308 || all.matchedByEither !== 316 || all.unmatched !== 232 || all.matchedByEither + all.unmatched !== web.employees.all || active.matchedByCodeOrIdentityHash !== 19 || active.uniqueToGroupWeb !== 115 || active.matchedByCodeOrIdentityHash + active.uniqueToGroupWeb !== web.employees.activeCandidates || active.disposition !== "manual_reconciliation_required" || !sha(reconciliation.evidenceHash)) fail("DUAL_SOURCE_RECONCILIATION_INVALID", "reconciliation");

  exact(contract.identityPolicy, ["matchPriority", "nameOnlyMatch", "conflictDisposition", "sourceProvenanceRequired", "automaticEmployeeCreation"], "identityPolicy");
  if (JSON.stringify(contract.identityPolicy.matchPriority) !== JSON.stringify(["identity_hash", "employee_code", "manual_review"]) || contract.identityPolicy.nameOnlyMatch !== "forbidden" || contract.identityPolicy.conflictDisposition !== "quarantine" || contract.identityPolicy.sourceProvenanceRequired !== true || contract.identityPolicy.automaticEmployeeCreation !== false) fail("DUAL_SOURCE_IDENTITY_POLICY_INVALID", "identityPolicy");

  exact(contract.migrationPolicy, ["operationMode", "productionImport", "onlineSideEffectsAllowed", "requiredBeforeImport"], "migrationPolicy");
  if (contract.migrationPolicy.operationMode !== "read_only_inventory_and_reconciliation" || contract.migrationPolicy.productionImport !== "HOLD" || contract.migrationPolicy.onlineSideEffectsAllowed !== false || !Array.isArray(contract.migrationPolicy.requiredBeforeImport) || contract.migrationPolicy.requiredBeforeImport.length !== 5 || new Set(contract.migrationPolicy.requiredBeforeImport).size !== 5) fail("DUAL_SOURCE_IMPORT_GATE_INVALID", "migrationPolicy");

  return { ok: true, sources: 2, groupWebTables: tables, groupWebRows: rows, groupWebEmployees: web.employees.all, activeManualReview: active.uniqueToGroupWeb, productionImport: contract.migrationPolicy.productionImport };
}

export function verifyObservedGroupWebProfile(profile, contract) {
  verifyLegacyDualSourceReconciliation(contract);
  exact(profile, ["formatVersion", "profileKind", "operationMode", "catalog", "rollup", "keyTableCounts"], "observedProfile");
  if (profile.formatVersion !== 1 || profile.profileKind !== "yuzhou_hr_legacy_group_web_observed_profile" || profile.operationMode !== "read_only") fail("GROUP_WEB_PROFILE_IDENTITY_INVALID", "observedProfile");
  exact(profile.catalog, ["tables", "fields", "nonemptyTables", "rows", "views", "procedures", "functions", "triggers"], "observedProfile.catalog");
  const expectedCatalog = { ...contract.sources.groupWeb.catalog };
  delete expectedCatalog.schemaHash;
  delete expectedCatalog.tableRowCountHash;
  if (JSON.stringify(profile.catalog) !== JSON.stringify(expectedCatalog)) fail("GROUP_WEB_PROFILE_CATALOG_DRIFT", "observedProfile.catalog");
  if (!Array.isArray(profile.rollup) || profile.rollup.length !== contract.groupWebCatalogRollup.length) fail("GROUP_WEB_PROFILE_ROLLUP_DRIFT", "observedProfile.rollup");
  const normalizeRollup = items => [...items].map(item => {
    exact(item, ["prefix", "tables", "rows"], `observedProfile.rollup.${item?.prefix}`);
    return item;
  }).sort((a, b) => a.prefix.localeCompare(b.prefix, "en"));
  if (JSON.stringify(normalizeRollup(profile.rollup)) !== JSON.stringify(normalizeRollup(contract.groupWebCatalogRollup))) fail("GROUP_WEB_PROFILE_ROLLUP_DRIFT", "observedProfile.rollup");
  if (!Array.isArray(profile.keyTableCounts) || profile.keyTableCounts.length !== Object.keys(EXPECTED_KEY_COUNTS).length) fail("GROUP_WEB_PROFILE_KEY_COUNTS_DRIFT", "observedProfile.keyTableCounts");
  const observedKeyCounts = {};
  for (const item of profile.keyTableCounts) {
    exact(item, ["table", "rows"], `observedProfile.keyTableCounts.${item?.table}`);
    if (typeof item.table !== "string" || Object.hasOwn(observedKeyCounts, item.table) || !Number.isInteger(item.rows) || item.rows < 0) fail("GROUP_WEB_PROFILE_KEY_COUNTS_DRIFT", String(item?.table));
    observedKeyCounts[item.table] = item.rows;
  }
  const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")));
  if (JSON.stringify(sorted(observedKeyCounts)) !== JSON.stringify(sorted(EXPECTED_KEY_COUNTS))) fail("GROUP_WEB_PROFILE_KEY_COUNTS_DRIFT", "observedProfile.keyTableCounts");
  return { ok: true, tables: profile.catalog.tables, fields: profile.catalog.fields, rows: profile.catalog.rows, keyTables: profile.keyTableCounts.length, operationMode: profile.operationMode };
}
