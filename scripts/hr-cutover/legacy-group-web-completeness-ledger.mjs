import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export class LegacyGroupWebCompletenessLedgerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyGroupWebCompletenessLedgerError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyGroupWebCompletenessLedgerError(code, detail);
};

const SOURCE_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/legacy-dual-source-reconciliation-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
]);

const PINNED_SOURCE_HASHES = Object.freeze({
  [SOURCE_PATHS[0]]:
    "38d5e621de3c163843bda8e3724c4225c79990446a9f0cecc09ff7e3e77f4959",
  [SOURCE_PATHS[1]]:
    "e99018b809147dbf97fe4cf07bef0123ec4eb7f8ff2295324bd0d204e86d76dd",
  [SOURCE_PATHS[2]]:
    "b11e280d088f23db8a5dece8294a572da85dfb0d309356d348abacd39e833621",
});

const CATEGORIES = Object.freeze([
  "table",
  "field",
  "view",
  "procedure",
  "function",
  "trigger",
  "menu_node",
  "navigable_entry",
  "asp_page",
]);

const CONTRACT_KEYS = Object.freeze([
  "formatVersion",
  "contractKind",
  "sourceSurface",
  "status",
  "sourceContracts",
  "expectedCatalog",
  "expectedInteraction",
  "denominatorPolicy",
  "missingAuthoritativeInputs",
  "sourceBindingSha256",
  "compatibilityScoreContribution",
  "productionImport",
]);

const sha256 = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : `${JSON.stringify(value)}\n`)
    .digest("hex");
const isSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const exactKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function assertContract(contract) {
  if (!exactKeys(contract, CONTRACT_KEYS)) fail("GROUP_WEB_LEDGER_CONTRACT_SHAPE_INVALID", "root");
  if (
    contract.formatVersion !== 1 ||
    contract.contractKind !== "yuzhou_hr_legacy_group_web_completeness_ledger" ||
    contract.sourceSurface !== "group_web" ||
    contract.status !== "inventory_only_coverage_pending" ||
    contract.compatibilityScoreContribution !== 0 ||
    contract.productionImport !== "HOLD"
  ) {
    fail("GROUP_WEB_LEDGER_BOUNDARY_INVALID", "root");
  }
  if (
    !Array.isArray(contract.sourceContracts) ||
    JSON.stringify(contract.sourceContracts.map((source) => source.path)) !== JSON.stringify(SOURCE_PATHS) ||
    contract.sourceContracts.some(
      (source) =>
        !exactKeys(source, ["path", "sha256"]) ||
        source.sha256 !== PINNED_SOURCE_HASHES[source.path],
    )
  ) {
    fail("GROUP_WEB_LEDGER_SOURCE_SET_INVALID", "sourceContracts");
  }
  if (
    !exactKeys(contract.expectedCatalog, [
      "tables",
      "fields",
      "nonemptyTables",
      "rows",
      "views",
      "procedures",
      "functions",
      "triggers",
    ]) ||
    !exactKeys(contract.expectedInteraction, [
      "menuNodes",
      "navigableEntries",
      "classicAspPages",
    ])
  ) {
    fail("GROUP_WEB_LEDGER_DENOMINATOR_SHAPE_INVALID", "expected counts");
  }
  const requiredPolicy = {
    includeEmptyTables: true,
    includeNullOnlyOrEmptyFields: true,
    includeUncalledRoutines: true,
    includeUnnavigatedAspPages: true,
    logicalEntriesAndPhysicalPagesAreSeparate: true,
  };
  if (JSON.stringify(contract.denominatorPolicy) !== JSON.stringify(requiredPolicy)) {
    fail("GROUP_WEB_LEDGER_DENOMINATOR_POLICY_INVALID", "denominatorPolicy");
  }
  const expectedMissing = [
    {
      categories: ["table", "field", "view"],
      reasonCode: "GROUP_WEB_ATOMIC_SCHEMA_EXPORT_NOT_COMMITTED",
    },
    {
      categories: ["procedure", "function", "trigger"],
      reasonCode: "GROUP_WEB_ATOMIC_ROUTINE_EXPORT_NOT_COMMITTED",
    },
    {
      categories: ["asp_page"],
      reasonCode: "GROUP_WEB_FULL_ASP_MANIFEST_NOT_COMMITTED",
    },
  ];
  if (JSON.stringify(contract.missingAuthoritativeInputs) !== JSON.stringify(expectedMissing)) {
    fail("GROUP_WEB_LEDGER_MISSING_INPUT_GAPS_INVALID", "missingAuthoritativeInputs");
  }
  const bindingPayload = {
    sourceContracts: contract.sourceContracts,
    expectedCatalog: contract.expectedCatalog,
    expectedInteraction: contract.expectedInteraction,
    denominatorPolicy: contract.denominatorPolicy,
    missingAuthoritativeInputs: contract.missingAuthoritativeInputs,
  };
  if (!isSha256(contract.sourceBindingSha256) || contract.sourceBindingSha256 !== sha256(bindingPayload)) {
    fail("GROUP_WEB_LEDGER_SOURCE_BINDING_INVALID", "sourceBindingSha256");
  }
}

function loadSources(root, contract) {
  assertContract(contract);
  const canonicalRoot = realpathSync(root);
  const rootPrefix = `${canonicalRoot}${sep}`;
  return Object.fromEntries(
    contract.sourceContracts.map((source) => {
      const sourcePath = resolve(canonicalRoot, source.path);
      const stat = lstatSync(sourcePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        fail("GROUP_WEB_LEDGER_SOURCE_PATH_INVALID", source.path);
      }
      const canonicalPath = realpathSync(sourcePath);
      if (!canonicalPath.startsWith(rootPrefix)) {
        fail("GROUP_WEB_LEDGER_SOURCE_PATH_INVALID", source.path);
      }
      const bytes = readFileSync(canonicalPath);
      if (sha256(bytes.toString("utf8")) !== source.sha256) {
        fail("GROUP_WEB_LEDGER_SOURCE_HASH_DRIFT", source.path);
      }
      return [source.path, JSON.parse(bytes.toString("utf8"))];
    }),
  );
}

function deriveAuthority(contract, sources) {
  const reconciliation = sources[SOURCE_PATHS[0]];
  const mapping = sources[SOURCE_PATHS[1]];
  const audit = sources[SOURCE_PATHS[2]];
  const catalog = reconciliation?.sources?.groupWeb?.catalog;
  if (
    reconciliation?.status !== "reviewed_read_only_baseline" ||
    reconciliation?.migrationPolicy?.operationMode !== "read_only_inventory_and_reconciliation" ||
    reconciliation?.migrationPolicy?.productionImport !== "HOLD" ||
    reconciliation?.sources?.groupWeb?.sourceId !== "yuzhou_group_web_enterprise_hr" ||
    reconciliation?.sources?.groupWeb?.systemSurface !== "classic_asp_group_web" ||
    !isSha256(catalog?.schemaHash) ||
    !isSha256(catalog?.tableRowCountHash)
  ) {
    fail("GROUP_WEB_LEDGER_CATALOG_AUTHORITY_INVALID", SOURCE_PATHS[0]);
  }
  const observedCatalog = Object.fromEntries(
    Object.keys(contract.expectedCatalog).map((key) => [key, catalog[key]]),
  );
  if (JSON.stringify(observedCatalog) !== JSON.stringify(contract.expectedCatalog)) {
    fail("GROUP_WEB_LEDGER_CATALOG_COUNT_DRIFT", "group web catalog");
  }
  if (
    mapping?.status !== "mapped_not_implementation_complete" ||
    mapping?.productionImport !== "HOLD" ||
    !Array.isArray(mapping.items) ||
    mapping.items.length !== contract.expectedInteraction.menuNodes ||
    !isSha256(mapping.sourceInventoryHash)
  ) {
    fail("GROUP_WEB_LEDGER_MENU_AUTHORITY_INVALID", SOURCE_PATHS[1]);
  }
  if (
    audit?.operationMode !== "read_only" ||
    audit?.productionImport !== "HOLD" ||
    audit?.sourceInventoryHash !== mapping.sourceInventoryHash ||
    audit?.sourceBoundary?.classicAspFiles !== contract.expectedInteraction.classicAspPages ||
    audit?.navigableModules !== contract.expectedInteraction.navigableEntries ||
    !Array.isArray(audit.items) ||
    audit.items.length !== audit.navigableModules ||
    !isSha256(audit.auditHash) ||
    sha256(JSON.stringify(audit.items)) !== audit.auditHash
  ) {
    fail("GROUP_WEB_LEDGER_PAGE_AUTHORITY_INVALID", SOURCE_PATHS[2]);
  }
  const menuIds = mapping.items.map((item) => item.legacyId);
  const navigableIds = audit.items.map((item) => item.legacyId);
  if (
    menuIds.some((id) => !Number.isInteger(id)) ||
    new Set(menuIds).size !== menuIds.length ||
    navigableIds.some((id) => !Number.isInteger(id)) ||
    new Set(navigableIds).size !== navigableIds.length ||
    navigableIds.some((id) => !menuIds.includes(id))
  ) {
    fail("GROUP_WEB_LEDGER_INTERACTION_IDENTITY_INVALID", "menu and navigable identities");
  }
  return {
    schemaHash: catalog.schemaHash,
    tableRowCountHash: catalog.tableRowCountHash,
    sourceInventoryHash: mapping.sourceInventoryHash,
    sourceAuditHash: audit.auditHash,
    menuIds,
    navigableItems: audit.items.map((item) => ({
      legacyId: item.legacyId,
      fieldEvidenceHash: item.fieldEvidenceHash,
    })),
  };
}

const pendingTarget = Object.freeze({
  status: "coverage_pending",
  targetDomain: null,
  targetObject: null,
  targetField: null,
  targetApi: null,
  targetPage: null,
  targetTest: null,
});

function record({ category, ordinal, identity = null, identityStatus, evidenceHash }) {
  return {
    locator: `group-web:${category}:${String(ordinal).padStart(5, "0")}`,
    sourceSurface: "group_web",
    category,
    sourceOrdinal: ordinal,
    sourceIdentity: identity,
    sourceIdentityStatus: identityStatus,
    sourceEvidenceSha256: evidenceHash,
    denominatorDisposition: "included",
    modernMapping: pendingTarget,
    compatibilityScoreContribution: 0,
  };
}

function opaqueRecords(category, count, evidenceHash) {
  return Array.from({ length: count }, (_value, index) =>
    record({
      category,
      ordinal: index + 1,
      identityStatus: "opaque_slot_pending_authoritative_export",
      evidenceHash,
    }),
  );
}

function materialize(contract, authority) {
  const records = [
    ...opaqueRecords("table", contract.expectedCatalog.tables, authority.schemaHash),
    ...opaqueRecords("field", contract.expectedCatalog.fields, authority.schemaHash),
    ...opaqueRecords("view", contract.expectedCatalog.views, authority.schemaHash),
    ...opaqueRecords("procedure", contract.expectedCatalog.procedures, authority.schemaHash),
    ...opaqueRecords("function", contract.expectedCatalog.functions, authority.schemaHash),
    ...opaqueRecords("trigger", contract.expectedCatalog.triggers, authority.schemaHash),
    ...authority.menuIds.map((legacyId, index) =>
      record({
        category: "menu_node",
        ordinal: index + 1,
        identity: String(legacyId),
        identityStatus: "hash_bound_source_identity",
        evidenceHash: authority.sourceInventoryHash,
      }),
    ),
    ...authority.navigableItems.map((item, index) =>
      record({
        category: "navigable_entry",
        ordinal: index + 1,
        identity: String(item.legacyId),
        identityStatus: "hash_bound_source_identity",
        evidenceHash: item.fieldEvidenceHash,
      }),
    ),
    ...opaqueRecords(
      "asp_page",
      contract.expectedInteraction.classicAspPages,
      authority.sourceAuditHash,
    ),
  ];
  return {
    formatVersion: 1,
    ledgerKind: "yuzhou_hr_legacy_group_web_completeness_ledger",
    sourceSurface: "group_web",
    status: "inventory_only_coverage_pending",
    sourceBindingSha256: contract.sourceBindingSha256,
    sourceAuthority: {
      schemaHash: authority.schemaHash,
      tableRowCountHash: authority.tableRowCountHash,
      sourceInventoryHash: authority.sourceInventoryHash,
      sourceAuditHash: authority.sourceAuditHash,
    },
    denominatorPolicy: contract.denominatorPolicy,
    missingAuthoritativeInputs: contract.missingAuthoritativeInputs,
    records,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
  };
}

function summarize(records) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  for (const item of records) counts[item.category] += 1;
  return { ...counts, total: records.length };
}

export function verifyGroupWebCompletenessLedger(root, contract, candidate) {
  const sources = loadSources(root, contract);
  const expected = materialize(contract, deriveAuthority(contract, sources));
  if (sha256(candidate) !== sha256(expected)) {
    fail("GROUP_WEB_LEDGER_MATERIALIZATION_DRIFT", "candidate does not match source-bound inventory");
  }
  const summary = summarize(candidate.records);
  const expectedTotal = Object.values(summary)
    .filter((_value, index) => index < CATEGORIES.length)
    .reduce((sum, value) => sum + value, 0);
  if (
    expectedTotal !== summary.total ||
    candidate.records.some(
      (item) =>
        item.sourceSurface !== "group_web" ||
        item.denominatorDisposition !== "included" ||
        item.modernMapping.status !== "coverage_pending" ||
        Object.entries(item.modernMapping).some(
          ([key, value]) => key !== "status" && value !== null,
        ) ||
        item.compatibilityScoreContribution !== 0,
    )
  ) {
    fail("GROUP_WEB_LEDGER_FALSE_COVERAGE", "records");
  }
  return {
    status: "PASS",
    ledgerStatus: candidate.status,
    sourceSurface: candidate.sourceSurface,
    summary,
    opaqueIdentitySlots: candidate.records.filter(
      (item) => item.sourceIdentityStatus === "opaque_slot_pending_authoritative_export",
    ).length,
    mappedRecords: 0,
    ledgerSha256: sha256(candidate),
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
  };
}

export function buildGroupWebCompletenessLedger(root, contract) {
  const sources = loadSources(root, contract);
  const ledger = materialize(contract, deriveAuthority(contract, sources));
  return { ledger, report: verifyGroupWebCompletenessLedger(root, contract, ledger) };
}

function parseArgs(argv) {
  const args = { root: resolve(import.meta.dirname, "../.."), contract: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--root", "--contract", "--out"].includes(key) || !value) {
      fail("GROUP_WEB_LEDGER_ARGUMENT_INVALID", key ?? "missing value");
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  args.contract ??=
    "scripts/hr-cutover/contracts/legacy-group-web-completeness-ledger-v1.json";
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const contract = JSON.parse(readFileSync(resolve(args.root, args.contract), "utf8"));
    const result = buildGroupWebCompletenessLedger(args.root, contract);
    if (args.out) writeFileSync(resolve(args.out), `${JSON.stringify(result.ledger, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result.report)}\n`);
  } catch (error) {
    const code = error instanceof LegacyGroupWebCompletenessLedgerError ? error.code : "GROUP_WEB_LEDGER_UNEXPECTED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
